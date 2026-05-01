from fastapi import APIRouter, HTTPException
import asyncio
import logging
import os
import tempfile
import time
import hashlib
import json
from pathlib import Path
from ..models.schemas import ApiResponse, PredictLoadRequest, PredictRiskRequest, CompareRequest
from ..services.ml_service import ml_service
from ..services.data_service import data_service, DATA_STORE_DIR
from ..services.ollama_service import ollama_service
from ..services.openrouter_service import openrouter_service

router = APIRouter(prefix="/analysis", tags=["Analysis"])

logger = logging.getLogger(__name__)

_AI_REC_CACHE_TTL_S = int(os.environ.get("AI_RECOMMENDATIONS_CACHE_TTL_S", "900"))
_ai_rec_cache_dir_resolved: Path | None = None


def _ai_rec_cache_dir() -> Path:
    """
    Resolve AI recommendation cache directory lazily.
    Import-time mkdir could crash the whole app on Render if DATA_STORE_DIR is misconfigured
    (e.g. disk path without a mounted disk).
    """
    global _ai_rec_cache_dir_resolved
    if _ai_rec_cache_dir_resolved is not None:
        return _ai_rec_cache_dir_resolved
    primary = Path(DATA_STORE_DIR) / "ai_cache"
    try:
        primary.mkdir(parents=True, exist_ok=True)
        _ai_rec_cache_dir_resolved = primary
        return primary
    except OSError as exc:
        fallback = Path(tempfile.gettempdir()) / "graceland_ai_cache"
        try:
            fallback.mkdir(parents=True, exist_ok=True)
        except OSError as exc2:
            logger.error("Could not create AI cache dir at %s or %s: %s; %s", primary, fallback, exc, exc2)
            raise
        logger.warning("AI cache primary dir unusable (%s), using fallback %s", exc, fallback)
        _ai_rec_cache_dir_resolved = fallback
        return fallback


def _build_ai_cache_key(player_id: str, player: dict) -> str:
    metrics = player.get("metrics", {}) if isinstance(player, dict) else {}
    cache_payload = {
        "version": "v7",
        "playerId": player_id,
        "team": data_service.get_current_team(),
        "model": getattr(openrouter_service, "model", "") or "",
        "maxTokens": openrouter_service.effective_max_tokens(),
        "budgetMode": getattr(openrouter_service, "budget_mode", False),
        "includeAnalytics": getattr(openrouter_service, "include_analytics", False),
        "playerName": player.get("name"),
        "lastSession": player.get("lastSession"),
        "hasRecentData": player.get("hasRecentData"),
        "recentSessionCount": player.get("recentSessionCount", 0),
        "avgLoad": player.get("avgLoad"),
        "avgSpeed": player.get("avgSpeed"),
        "metrics": metrics,
    }
    return hashlib.sha256(json.dumps(cache_payload, sort_keys=True).encode("utf-8")).hexdigest()


def _build_standard_recommendation_report(
    player_name: str,
    risk_level: str,
    risk_factors: list[str],
    recommendations: list[str],
    *,
    player_id: str | None = None,
) -> str:
    factor_lines = "\n".join(f"- {factor}" for factor in (risk_factors or ["No major risk factors detected."]))
    recommendation_lines = "\n".join(f"- {item}" for item in (recommendations or ["Continue normal monitoring."]))
    level = str(risk_level or "low").upper()
    lines = [
        "## Executive Summary",
        f"**{player_name}** is currently assessed as **{level} injury risk** based on the latest available training data.",
        "",
        "What this means for planning (next 72 hours):",
        "- Treat this as a decision-support signal, not a diagnosis.",
        "- Prioritize consistency: avoid sudden spikes in total load or high-speed exposure.",
        "- Align the plan with availability, match minutes role, and staff observation (RPE/soreness).",
        "",
        "## Key Risk Drivers (why)",
        factor_lines,
        "",
        "## Recommended Coaching Actions (what to do now)",
        recommendation_lines,
        "",
        "## Session Design (practical translation)",
        "- **Warm-up**: progressive build (mobility → activation → short accelerations).",
        "- **Main block**: keep quality high; reduce chaos if risk is MED/HIGH (smaller-sided constraints, fewer maximal efforts).",
        "- **Exposure**: deliberately dose high-speed and sprint exposure rather than letting it happen randomly.",
        "- **Cooldown**: easy flush + breathing, then short tissue tolerance work (as appropriate).",
        "",
        "## Recovery & Monitoring (what to watch)",
        "- Check morning readiness (sleep, soreness, subjective fatigue) and short movement screen (if available).",
        "- Track **load**, **high-speed running / sprint distance**, and **top speed exposure** relative to the squad benchmark.",
        "- Red flags: new pain, persistent tightness, unusual drop in speed/quality, or repeated spikes session-to-session.",
        "",
        "## Communication Notes (for staff)",
        "- Agree one simple objective: *availability for next match/training block*.",
        "- Document the decision: what you changed today, and what would make you change again within 48 hours.",
    ]
    if player_id and player_id != "team_average":
        lines.extend([
            "",
            "## Player-specific extras (use this as a checklist)",
            "- Confirm **position/role** (starter, rotation, limited minutes) and reflect it in volume targets.",
            "- Compare the athlete vs **Team Average** for load and high-speed exposure; aim for controlled deltas rather than extremes.",
            "- If MED/HIGH risk: reduce peak demands first (max sprint distance, repeated accelerations), keep technical quality.",
            "- Build one **if–then trigger** for the next 7 days (example): *If soreness ≥ 6/10 OR a sudden sprint-distance spike, then reduce high-speed exposures next session and shift to technical work.*",
            "- Re-check within 24–48 hours after any change to ensure the trend improves (not just a single session).",
        ])
    elif player_id == "team_average":
        lines.extend([
            "",
            "## Squad-level next steps (use Team Average correctly)",
            "- Use Team Average as a benchmark: flag individuals consistently **above/below** squad load and sprint volume.",
            "- Segment by positional groups: compare defenders/mids/forwards separately (team-wide means can hide pockets of risk).",
            "- Rotation planning: identify 3–5 players with sustained high load + high-speed exposure and protect them early in the week.",
            "- Data hygiene: one export cadence and aligned session dates so the aggregate stays trustworthy (no missing sessions).",
            "- Agree a weekly rhythm: planned high-speed exposures + planned deload day + planned recovery monitoring touchpoints.",
        ])
    return "\n".join(lines)


@router.post("/predict-load", response_model=ApiResponse)
async def predict_load(request: PredictLoadRequest):
    """Predict player load for next session (match or training)."""
    try:
        features = request.features
        if not features:
            player = data_service.get_player_detail(request.playerId)
            if not player:
                raise HTTPException(
                    status_code=404,
                    detail="Player not found. Load data in Dashboard and ensure the player is in the current team."
                )
            features = player['metrics']

        session_type = (request.sessionType or 'match').lower()
        if session_type not in ('match', 'training'):
            session_type = 'match'
        result = ml_service.predict_load(features, session_type)

        player_name = "Unknown"
        player = data_service.get_player_detail(request.playerId)
        if player:
            player_name = player['name']

        return ApiResponse(success=True, data={
            'playerId': request.playerId,
            'playerName': player_name,
            'predictedLoad': round(result['predictedLoad'], 2),
            'confidence': result.get('confidence', 0.8),
            'method': result.get('method', 'ml_model'),
            'sessionType': result.get('sessionType', session_type),
            'features': features,
        })
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team-average", response_model=ApiResponse)
async def get_team_average():
    """Get team average metrics. Returns stub when no data so frontend does not break."""
    try:
        team_avg = data_service.get_team_average_metrics()
        if not team_avg:
            return ApiResponse(success=True, data={
                'id': 'team_average',
                'name': 'Team Average',
                'position': 'TEAM',
                'number': 0,
                'riskLevel': 'low',
                'avgLoad': 0,
                'avgSpeed': 0,
                'sessions': 0,
                'lastSession': None,
                'hasRecentData': False,
                'recentSessionCount': 0,
                'metrics': {},
                'teamStats': {'totalPlayers': 0, 'playersWithRecentData': 0, 'riskDistribution': {'low': 0, 'medium': 0, 'high': 0}},
            })
        return ApiResponse(success=True, data=team_avg)
    except Exception as e:
        return ApiResponse(success=True, data={
            'id': 'team_average',
            'name': 'Team Average',
            'position': 'TEAM',
            'number': 0,
            'riskLevel': 'low',
            'avgLoad': 0,
            'avgSpeed': 0,
            'sessions': 0,
            'hasRecentData': False,
            'recentSessionCount': 0,
            'metrics': {},
            'teamStats': {'totalPlayers': 0, 'playersWithRecentData': 0, 'riskDistribution': {'low': 0, 'medium': 0, 'high': 0}},
        })


@router.get("/analytics", response_model=ApiResponse)
async def get_analytics(playerId: str | None = None):
    """Get advanced analytics for the current team or a specific player."""
    try:
        return ApiResponse(success=True, data=data_service.get_analytics_overview(playerId))
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to build analytics")


@router.get("/team-comparison", response_model=ApiResponse)
async def get_team_comparison():
    """Get both men's and women's team comparison from persisted datasets."""
    try:
        return ApiResponse(success=True, data=data_service.get_team_comparison())
    except Exception:
        raise HTTPException(status_code=500, detail="Unable to build team comparison")


@router.post("/predict-risk", response_model=ApiResponse)
async def predict_risk(request: PredictRiskRequest):
    """Predict injury risk - only uses data from last 45 days (1.5 months)"""
    try:
        # Handle team average special case
        if request.playerId == 'team_average':
            team_avg = data_service.get_team_average_metrics()
            if not team_avg:
                return ApiResponse(success=True, data={
                    'playerId': 'team_average',
                    'playerName': 'Team Average',
                    'riskLevel': 'low',
                    'probability': 0.0,
                    'factors': ["No team data available. Upload a CSV in Dashboard to analyze."],
                    'recommendations': [
                        "Upload training data in the Dashboard",
                        "Risk cannot be assessed without data",
                    ],
                    'hasRecentData': False,
                    'recentSessionCount': 0,
                })
            
            # Use team average metrics for prediction
            features = team_avg.get('metrics', {})
            has_recent_data = team_avg.get('hasRecentData', False)
            recent_sessions = team_avg.get('recentSessionCount', 0)
            
            if not has_recent_data or recent_sessions == 0 or not features:
                return ApiResponse(success=True, data={
                    'playerId': 'team_average',
                    'playerName': 'Team Average',
                    'riskLevel': 'low',
                    'probability': 0.0,
                    'factors': [f"No recent training data in the last 45 days ({recent_sessions} sessions)"],
                    'recommendations': [
                        "Team has no recent training sessions",
                        "Risk cannot be accurately assessed without recent data",
                        "Consider starting with low intensity training to gather baseline data"
                    ],
                    'hasRecentData': False,
                    'recentSessionCount': recent_sessions
                })
            
            # Validate features before prediction
            if not isinstance(features, dict) or len(features) == 0:
                return ApiResponse(success=True, data={
                    'playerId': 'team_average',
                    'playerName': 'Team Average',
                    'riskLevel': 'low',
                    'probability': 0.0,
                    'factors': ["Insufficient metrics data for risk prediction"],
                    'recommendations': [
                        "Team metrics are not available",
                        "Upload training data to enable risk analysis"
                    ],
                    'hasRecentData': False,
                    'recentSessionCount': recent_sessions
                })
            
            try:
                risk_level, probability, factors, recommendations = ml_service.predict_risk(features)
            except Exception as e:
                # Fallback if prediction fails
                return ApiResponse(success=True, data={
                    'playerId': 'team_average',
                    'playerName': 'Team Average',
                    'riskLevel': 'low',
                    'probability': 0.0,
                    'factors': [f"Risk prediction unavailable: {str(e)}"],
                    'recommendations': [
                        "Unable to calculate risk with current data",
                        "Ensure training models are properly trained",
                        "Check that sufficient player data is available"
                    ],
                    'hasRecentData': True,
                    'recentSessionCount': recent_sessions
                })
            
            return ApiResponse(success=True, data={
                'playerId': 'team_average',
                'playerName': 'Team Average',
                'riskLevel': risk_level,
                'probability': probability,
                'factors': factors,
                'recommendations': recommendations,
                'hasRecentData': True,
                'recentSessionCount': recent_sessions
            })
        
        player = data_service.get_player_detail(request.playerId)
        if not player:
            return ApiResponse(success=True, data={
                'playerId': request.playerId,
                'playerName': 'Unknown',
                'riskLevel': 'low',
                'probability': 0.0,
                'factors': ["Player not found or no data available."],
                'recommendations': ["Select a player from the list and ensure data is loaded."],
                'hasRecentData': False,
                'recentSessionCount': 0,
            })
        
        player_name = player.get('name', 'Unknown')
        # Check if player has recent data (last 45 days)
        has_recent_data = player.get('hasRecentData', False)
        recent_sessions = player.get('recentSessionCount', 0)
        
        # If no recent data, return low risk automatically
        if not has_recent_data or recent_sessions == 0:
            return ApiResponse(success=True, data={
                'playerId': request.playerId,
                'playerName': player_name,
                'riskLevel': 'low',
                'probability': 0.0,
                'factors': [f"No training data in the last 45 days ({recent_sessions} sessions)"],
                'recommendations': [
                    "Player has no recent training sessions",
                    "Risk cannot be accurately assessed without recent data",
                    "Consider starting with low intensity training to gather baseline data"
                ],
                'hasRecentData': False,
                'recentSessionCount': recent_sessions
            })
        
        features = player.get('metrics', {})
        
        # Validate features before prediction
        if not isinstance(features, dict) or len(features) == 0:
            return ApiResponse(success=True, data={
                'playerId': request.playerId,
                'playerName': player_name,
                'riskLevel': 'low',
                'probability': 0.0,
                'factors': ["Insufficient metrics data for risk prediction"],
                'recommendations': [
                    "Player metrics are not available",
                    "Upload training data to enable risk analysis"
                ],
                'hasRecentData': True,
                'recentSessionCount': recent_sessions
            })
        
        try:
            risk_level, probability, factors, recommendations = await asyncio.to_thread(
                ml_service.predict_risk, features
            )
        except Exception as e:
            # Fallback if prediction fails
            return ApiResponse(success=True, data={
                'playerId': request.playerId,
                'playerName': player_name,
                'riskLevel': 'low',
                'probability': 0.0,
                'factors': [f"Risk prediction unavailable: {str(e)}"],
                'recommendations': [
                    "Unable to calculate risk with current data",
                    "Ensure training models are properly trained",
                    "Check that sufficient player data is available"
                ],
                'hasRecentData': True,
                'recentSessionCount': recent_sessions
            })
        
        return ApiResponse(success=True, data={
            'playerId': request.playerId,
            'playerName': player_name,
            'riskLevel': risk_level,
            'probability': probability,
            'factors': factors,
            'recommendations': recommendations,
            'hasRecentData': True,
            'recentSessionCount': recent_sessions
        })
    except ValueError as e:
        return ApiResponse(success=True, data={
            'playerId': getattr(request, 'playerId', ''),
            'playerName': 'Unknown',
            'riskLevel': 'low',
            'probability': 0.0,
            'factors': [str(e)],
            'recommendations': ["Check input data and try again."],
            'hasRecentData': False,
            'recentSessionCount': 0,
        })
    except Exception as e:
        return ApiResponse(success=True, data={
            'playerId': getattr(request, 'playerId', ''),
            'playerName': 'Unknown',
            'riskLevel': 'low',
            'probability': 0.0,
            'factors': [f"Analysis error: {str(e)}"],
            'recommendations': ["Something went wrong. Try again or upload data in Dashboard."],
            'hasRecentData': False,
            'recentSessionCount': 0,
        })


@router.post("/compare", response_model=ApiResponse)
async def compare_players(request: CompareRequest):
    """Compare multiple players"""
    try:
        results = []
        for player_id in request.playerIds:
            player = data_service.get_player_detail(player_id)
            if player:
                try:
                    result = ml_service.predict_load(player['metrics'], 'training')
                    results.append({
                        'playerId': player_id,
                        'playerName': player['name'],
                        'predictedLoad': round(result['predictedLoad'], 2),
                        'confidence': result['confidence'],
                        'features': player['metrics']
                    })
                except:
                    results.append({
                        'playerId': player_id,
                        'playerName': player['name'],
                        'predictedLoad': player['avgLoad'],
                        'confidence': 0,
                        'features': player['metrics']
                    })
        
        return ApiResponse(success=True, data=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ollama-status", response_model=ApiResponse)
async def get_ollama_status():
    """Get Ollama AI status"""
    try:
        status = ollama_service.get_status()
        return ApiResponse(success=True, data=status)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/openrouter-status", response_model=ApiResponse)
async def get_openrouter_status():
    """Get OpenRouter AI status"""
    try:
        status = openrouter_service.get_status()
        status["aiRecommendationsCacheTtlSeconds"] = _AI_REC_CACHE_TTL_S
        try:
            d = _ai_rec_cache_dir()
            status["aiRecommendationsCacheEntries"] = len(list(d.glob("*.json")))
            status["aiRecommendationsCacheDir"] = str(d)
        except Exception:
            status["aiRecommendationsCacheEntries"] = None
        return ApiResponse(success=True, data=status)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai-recommendations", response_model=ApiResponse)
async def get_ai_recommendations(request: PredictRiskRequest):
    """Full coach bundle: same injury-risk fields as /predict-risk plus OpenRouter coach text (single round-trip)."""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        logger.info(f"Getting AI recommendations for player: {request.playerId}")
        
        # Handle team average: never 404 — mirror GET /team-average stub when aggregate cannot be built
        used_team_stub = False
        if request.playerId == 'team_average':
            player = data_service.get_team_average_metrics()
            if not player:
                used_team_stub = True
                logger.info("Team average aggregate unavailable — using stub for coach bundle (same as /team-average)")
                player = {
                    'id': 'team_average',
                    'name': 'Team Average',
                    'position': 'TEAM',
                    'number': 0,
                    'riskLevel': 'low',
                    'avgLoad': 0,
                    'avgSpeed': 0,
                    'sessions': 0,
                    'lastSession': None,
                    'hasRecentData': False,
                    'recentSessionCount': 0,
                    'metrics': {},
                    'extendedStats': {
                        'playerLoad': {'avg': 0, 'std': 0, 'max': 0, 'min': 0},
                    },
                }
        else:
            player = data_service.get_player_detail(request.playerId)
            if not player:
                logger.warning(f"Player not found: {request.playerId}")
                raise HTTPException(status_code=404, detail="Player not found")
        
        # Fast path: disk cache lookup BEFORE heavy computations (risk + analytics + LLM).
        cache_key = _build_ai_cache_key(request.playerId, player)
        cache_fp = _ai_rec_cache_dir() / f"{cache_key}.json"
        try:
            if cache_fp.exists():
                age_s = time.time() - cache_fp.stat().st_mtime
                if age_s < _AI_REC_CACHE_TTL_S:
                    cached_data = json.loads(cache_fp.read_text(encoding="utf-8"))
                    # v5 cache must include full risk bundle (single round-trip for frontend)
                    if cached_data.get("coachBundleVersion") == 1 and "probability" in cached_data:
                        cached_data["aiSource"] = "openrouter-cache"
                        return ApiResponse(success=True, data=cached_data)
        except Exception:
            pass

        # Match /predict-risk: one ML call, full probability + factors + recommendations
        has_recent_data = player.get('hasRecentData', False)
        recent_sessions = int(player.get('recentSessionCount', 0) or 0)
        logger.info(f"Player {player['name']} has recent data: {has_recent_data}")

        def _analytics_safe():
            try:
                return data_service.get_analytics_overview(request.playerId)
            except Exception:
                return None

        if not has_recent_data or recent_sessions == 0:
            risk_level = 'low'
            probability = 0.0
            risk_factors = [f"No training data in the last 45 days ({recent_sessions} sessions)"]
            ml_recommendations = [
                "Player has no recent training sessions",
                "Risk cannot be accurately assessed without recent data",
                "Consider starting with low intensity training to gather baseline data",
            ]
        else:
            features = player.get('metrics', {})
            if not isinstance(features, dict) or len(features) == 0:
                risk_level = 'low'
                probability = 0.0
                risk_factors = ["Insufficient metrics data for risk prediction"]
                ml_recommendations = [
                    "Player metrics are not available",
                    "Upload training data to enable risk analysis",
                ]
            else:
                try:
                    risk_level, probability, risk_factors, ml_recommendations = await asyncio.to_thread(
                        ml_service.predict_risk, features
                    )
                except Exception as e:
                    risk_level = 'low'
                    probability = 0.0
                    risk_factors = [f"Risk prediction unavailable: {str(e)}"]
                    ml_recommendations = [
                        "Unable to calculate risk with current data",
                        "Ensure training models are properly trained",
                        "Check that sufficient player data is available",
                    ]

        if used_team_stub:
            risk_level = 'low'
            probability = 0.0
            risk_factors = [
                "No team aggregate could be built: no CSV loaded, empty roster, or no athlete has GPS sessions in the last 45 days.",
            ]
            ml_recommendations = [
                "Upload or refresh the team Catapult CSV from Dashboard and confirm session dates fall inside the analysis window.",
                "Once at least one player has recent sessions, Team Average will summarize squad load, speed, and sprint exposure.",
                "If some individuals already have data, analyze them by name until the full squad is current.",
            ]

        analytics_overview = None
        should_load_analytics = (
            openrouter_service.is_configured()
            and getattr(openrouter_service, "include_analytics", True)
            and has_recent_data
            and recent_sessions > 0
        )
        if should_load_analytics:
            analytics_overview = await asyncio.to_thread(_analytics_safe)

        logger.info(f"Risk level determined: {risk_level}")

        allow_ollama_fallback = os.environ.get("ALLOW_OLLAMA_FALLBACK", "0") == "1"

        # Get AI recommendations (prefer OpenRouter when configured)
        result = await asyncio.to_thread(
            openrouter_service.get_player_recommendations,
            player['name'],
            player,
            risk_level,
            risk_factors,
            analytics_overview,
        )
        if not result.get('success') and allow_ollama_fallback:
            fallback_result = await asyncio.to_thread(
                ollama_service.get_player_recommendations,
                player['name'],
                player,
                risk_level,
                risk_factors,
            )
            # Keep OpenRouter error for debugging if Ollama succeeds
            if fallback_result.get('success') and result.get('error'):
                fallback_result['error'] = f"OpenRouter failed: {result.get('error')}"
            result = fallback_result
        
        logger.info(f"AI recommendations result - success: {result.get('success')}, source: {result.get('source')}")

        ai_recommendations = result.get('recommendations', '')
        ai_success = bool(result.get('success', False))
        ai_source = result.get('source', 'fallback')
        if not ai_recommendations:
            ai_recommendations = _build_standard_recommendation_report(
                player['name'],
                risk_level,
                risk_factors,
                ml_recommendations,
                player_id=request.playerId,
            )
            if ai_source == 'fallback':
                ai_source = 'rule-based-fallback'

        response_data = {
            'coachBundleVersion': 1,
            'playerId': request.playerId,
            'playerName': player['name'],
            'riskLevel': risk_level,
            'probability': probability,
            'factors': risk_factors,
            'recommendations': ml_recommendations,
            'hasRecentData': has_recent_data,
            'recentSessionCount': player.get('recentSessionCount', 0),
            'aiRecommendations': ai_recommendations,
            'aiSource': ai_source,
            'aiSuccess': ai_success,
            'aiError': result.get('error')
        }

        if response_data.get("aiSuccess") and response_data.get("aiRecommendations"):
            try:
                cache_fp.write_text(json.dumps(response_data, ensure_ascii=False), encoding="utf-8")
            except Exception:
                pass

        return ApiResponse(success=True, data=response_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AI recommendations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
