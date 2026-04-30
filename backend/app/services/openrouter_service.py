import os
import logging
from typing import Dict, Any, List, Optional, Tuple
import time
import hashlib
import json

import requests

logger = logging.getLogger(__name__)

_OPENROUTER_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}


OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")

# Profiles:
# - cheap: lowest-cost practical coach report
# - balanced: better wording/consistency at modest cost
# - quality: stronger model when cost is less sensitive
OPENROUTER_PROFILE = os.environ.get("OPEN_ROUTER_PROFILE", "cheap").strip().lower()
_PROFILE_DEFAULTS = {
    "cheap": {
        "model": "google/gemini-2.5-flash-lite:nitro",
        "max_tokens": 160,
        "include_analytics": False,
    },
    "balanced": {
        "model": "openai/gpt-4o-mini",
        "max_tokens": 220,
        "include_analytics": False,
    },
    "quality": {
        "model": "openai/gpt-4.1-mini",
        "max_tokens": 320,
        "include_analytics": True,
    },
}
_SELECTED_PROFILE = _PROFILE_DEFAULTS.get(OPENROUTER_PROFILE, _PROFILE_DEFAULTS["cheap"])
DEFAULT_OPENROUTER_MODEL = os.environ.get("OPEN_ROUTER_MODEL", _SELECTED_PROFILE["model"])
# Hard cap on output tokens to avoid accidental huge bills (override ceiling via OPEN_ROUTER_MAX_TOKENS_CAP)
ABSOLUTE_MAX_OUTPUT_TOKENS = int(os.environ.get("OPEN_ROUTER_MAX_TOKENS_CAP", "512"))
# Budget mode (default on): shorter prompts/context + lower default max_tokens → fewer billed tokens.
OPENROUTER_BUDGET = os.environ.get("OPEN_ROUTER_BUDGET", "1") == "1"
DEFAULT_MAX_TOKENS = int(
    os.environ.get(
        "OPEN_ROUTER_MAX_TOKENS",
        str(_SELECTED_PROFILE["max_tokens"] if OPENROUTER_BUDGET else max(320, int(_SELECTED_PROFILE["max_tokens"]))),
    )
)
# HTTP read timeout for OpenRouter (LLM latency). Default allows completion without Axios dying first.
OPENROUTER_TIMEOUT_MAX_S = int(os.environ.get("OPEN_ROUTER_TIMEOUT_MAX_S", "28"))
DEFAULT_TIMEOUT_S = int(os.environ.get("OPEN_ROUTER_TIMEOUT_S", str(min(25, OPENROUTER_TIMEOUT_MAX_S))))
DEFAULT_CACHE_TTL_S = int(os.environ.get("OPEN_ROUTER_CACHE_TTL_S", "900"))
# When budget mode: skip heavy analytics aggregation unless OPEN_ROUTER_INCLUDE_ANALYTICS=1
_DEFAULT_INCLUDE_ANALYTICS = os.environ.get(
    "OPEN_ROUTER_INCLUDE_ANALYTICS",
    "1" if _SELECTED_PROFILE["include_analytics"] and not OPENROUTER_BUDGET else "0",
)
INCLUDE_ANALYTICS = _DEFAULT_INCLUDE_ANALYTICS == "1"


class OpenRouterService:
    def __init__(self):
        self.base_url = OPENROUTER_BASE_URL
        self.api_key = os.environ.get("OPEN_ROUTER_API_KEY") or os.environ.get("OPENROUTER_API_KEY")
        self.model = DEFAULT_OPENROUTER_MODEL
        self.profile = OPENROUTER_PROFILE if OPENROUTER_PROFILE in _PROFILE_DEFAULTS else "cheap"
        self.budget_mode = OPENROUTER_BUDGET
        self.include_analytics = INCLUDE_ANALYTICS
        self.max_tokens = min(max(64, DEFAULT_MAX_TOKENS), ABSOLUTE_MAX_OUTPUT_TOKENS)
        self.timeout_s = min(max(5, DEFAULT_TIMEOUT_S), OPENROUTER_TIMEOUT_MAX_S)
        self.cache_ttl_s = DEFAULT_CACHE_TTL_S

        # Optional metadata recommended by OpenRouter (harmless if unset)
        self.app_url = os.environ.get("OPENROUTER_APP_URL")
        self.app_name = os.environ.get("OPENROUTER_APP_NAME", "Graceland Soccer Analytics")

    def effective_max_tokens(self) -> int:
        """Output token budget sent to the API (clamped)."""
        return min(max(64, self.max_tokens), ABSOLUTE_MAX_OUTPUT_TOKENS)

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def get_status(self) -> Dict[str, Any]:
        return {
            "available": self.is_configured(),
            "status": "ready" if self.is_configured() else "missing_api_key",
            "baseUrl": self.base_url,
            "profile": self.profile,
            "defaultModel": self.model,
            "maxTokens": self.effective_max_tokens(),
            "maxTokensCap": ABSOLUTE_MAX_OUTPUT_TOKENS,
            "budgetMode": self.budget_mode,
            "includeAnalytics": self.include_analytics,
            "timeoutSeconds": self.timeout_s,
            "timeoutMaxSeconds": OPENROUTER_TIMEOUT_MAX_S,
            "cacheTtlSeconds": self.cache_ttl_s,
            "cacheEntries": len(_OPENROUTER_CACHE),
            "message": "OpenRouter ready" if self.is_configured() else "Set OPEN_ROUTER_API_KEY in backend/.env",
        }

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if self.app_url:
            headers["HTTP-Referer"] = self.app_url
        if self.app_name:
            headers["X-Title"] = self.app_name
        return headers

    def _format_player_context(
        self,
        player_name: str,
        player_data: Dict[str, Any],
        risk_level: str,
        risk_factors: List[str],
        analytics: Optional[Dict[str, Any]] = None,
    ) -> str:
        metrics = player_data.get("metrics", {}) or {}
        extended = player_data.get("extendedStats", {}) or {}
        is_team_agg = player_data.get("id") == "team_average"
        position = (player_data.get("position") or "").strip()

        load_stats = extended.get("playerLoad", {}) or {}
        load_std = float(load_stats.get("std", 0) or 0)
        load_avg = float(load_stats.get("avg", metrics.get("Player Load", 0) or 0) or 0)
        load_variability = (load_std / load_avg * 100) if load_avg > 0 else 0

        if self.budget_mode:
            # Minimal input tokens: same decision signals, fewer lines.
            rf = risk_factors[:4] if risk_factors else ["None flagged"]
            agg_line = (
                "CONTEXT: TEAM AGGREGATE (squad-level benchmark; not one athlete)."
                if is_team_agg
                else f"CONTEXT: INDIVIDUAL | Position: {position or 'unknown'}"
            )
            return "\n".join([
                agg_line,
                f"PLAYER: {player_name} | RISK: {risk_level.upper()}",
                f"Sessions(45d): {int(player_data.get('recentSessionCount', 0) or 0)} | "
                f"Recent data: {'yes' if player_data.get('hasRecentData') else 'no'} | "
                f"Last: {player_data.get('lastSession', 'unknown')}",
                f"Load {float(metrics.get('Player Load', 0) or 0):.1f} (var {load_variability:.0f}%) | "
                f"Dist {float(metrics.get('Distance (miles)', 0) or 0):.2f}mi | "
                f"Sprint {float(metrics.get('Sprint Distance (yards)', 0) or 0):.0f}yd | "
                f"Top {float(metrics.get('Top Speed (mph)', 0) or 0):.1f}mph | "
                f"WR {float(metrics.get('Work Ratio', 0) or 0):.1f}% | "
                f"HRload {float(metrics.get('Hr Load', 0) or 0):.1f}",
                "RISK FACTORS: " + "; ".join(rf),
            ])

        header = (
            f"TEAM AGGREGATE PROFILE: {player_name} (squad-level averages — prescribe rotation, group load, and team trends, not one-player RTP)."
            if is_team_agg
            else f"PLAYER PROFILE: {player_name}" + (f" | Position: {position}" if position else "")
        )
        lines = [
            header,
            f"INJURY RISK ASSESSMENT: {risk_level.upper()} RISK",
            "",
            "PERFORMANCE METRICS (Last 45 days - Averages):",
            f"- Player Load: {float(metrics.get('Player Load', 0) or 0):.1f} (Load variability: {load_variability:.1f}%)",
            f"- Total Distance: {float(metrics.get('Distance (miles)', 0) or 0):.2f} miles per session",
            f"- Sprint Distance: {float(metrics.get('Sprint Distance (yards)', 0) or 0):.1f} yards",
            f"- Top Speed: {float(metrics.get('Top Speed (mph)', 0) or 0):.1f} mph",
            f"- Work Ratio: {float(metrics.get('Work Ratio', 0) or 0):.1f}% (fatigue indicator)",
            f"- Energy Expenditure: {float(metrics.get('Energy (kcal)', 0) or 0):.0f} kcal per session",
            f"- Heart Rate Load: {float(metrics.get('Hr Load', 0) or 0):.1f}",
            f"- Max Acceleration: {float(metrics.get('Max Acceleration (yd/s/s)', 0) or 0):.1f} yd/s²",
            f"- Max Deceleration: {float(metrics.get('Max Deceleration (yd/s/s)', 0) or 0):.1f} yd/s²",
            "",
            "TRAINING HISTORY:",
            f"- Total Training Sessions (all-time): {int(player_data.get('sessions', 0) or 0)}",
            f"- Recent Data Available (last 45 days): {'Yes' if player_data.get('hasRecentData', False) else 'No'}",
            f"- Sessions in last 45 days: {int(player_data.get('recentSessionCount', 0) or 0)}",
            f"- Last Session Date: {player_data.get('lastSession', 'Unknown')}",
            "",
            "RISK FACTORS IDENTIFIED:",
        ]
        if risk_factors:
            lines.extend([f"- {f}" for f in risk_factors])
        else:
            lines.append("- No significant risk factors detected")

        if analytics:
            # Include decision-relevant analytics as a compact summary (faster + more readable).
            rolling = analytics.get("rollingLoad") or []
            acwr = analytics.get("acwr") or []
            outliers = analytics.get("outlierTimeline") or []
            percentiles = analytics.get("percentiles") or []

            def _last_num(items, key):
                try:
                    return float(items[-1].get(key)) if items else None
                except Exception:
                    return None

            def _trend(items, key, n=7):
                try:
                    if not items:
                        return None
                    window = items[-n:] if len(items) >= n else items
                    a = float(window[0].get(key) or 0)
                    b = float(window[-1].get(key) or 0)
                    return b - a
                except Exception:
                    return None

            rolling7 = _last_num(rolling, "rolling7")
            rolling28 = _last_num(rolling, "rolling28")
            rolling7_trend = _trend(rolling, "rolling7", 7)
            acwr_now = _last_num(acwr, "acuteChronicRatio")
            acwr_trend = _trend(acwr, "acuteChronicRatio", 7)
            outlier_count = len(outliers) if isinstance(outliers, list) else 0

            # percentiles is already a summary list; keep as-is but bounded.
            lines.extend([
                "",
                "ADVANCED ANALYTICS (derived from dataset):",
                f"- Rolling load: 7d={rolling7 if rolling7 is not None else 'N/A'} (Δ7d={round(rolling7_trend,2) if rolling7_trend is not None else 'N/A'}), 28d={rolling28 if rolling28 is not None else 'N/A'}",
                f"- ACWR: now={acwr_now if acwr_now is not None else 'N/A'} (Δ7d={round(acwr_trend,2) if acwr_trend is not None else 'N/A'})",
                f"- Outliers detected: {outlier_count}",
                f"- Percentiles summary: {percentiles[:6] if isinstance(percentiles, list) else percentiles}",
            ])
        return "\n".join(lines)

    def get_player_recommendations(
        self,
        player_name: str,
        player_data: Dict[str, Any],
        risk_level: str,
        risk_factors: List[str],
        analytics: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured():
            return {
                "success": False,
                "error": "OpenRouter is not configured (missing OPEN_ROUTER_API_KEY).",
                "recommendations": "",
                "source": "openrouter",
                "model": self.model,
            }

        context = self._format_player_context(player_name, player_data, risk_level, risk_factors, analytics)
        is_team_agg = player_data.get("id") == "team_average"

        cache_key_payload = {
            "model": self.model,
            "max_tokens": self.effective_max_tokens(),
            "player_name": player_name,
            "risk_level": risk_level,
            "risk_factors": risk_factors,
            "context": context,
        }
        cache_key = hashlib.sha256(json.dumps(cache_key_payload, sort_keys=True).encode("utf-8")).hexdigest()
        now = time.time()
        cached = _OPENROUTER_CACHE.get(cache_key)
        if cached and (now - cached[0]) < self.cache_ttl_s:
            out = dict(cached[1])
            out["source"] = "openrouter-cache"
            return out

        system_prompt = (
            "You are an elite professional soccer coach and sports scientist writing for a head coach. "
            "Use professional terminology, be specific, and ground recommendations in the provided data. "
            "Prefer concise, actionable bullets over long narrative."
        )
        squad_vs_individual = (
            "This selection is TEAM AVERAGE (aggregate). Emphasize squad load management, rotation, positional groups, "
            "and how to interpret the benchmark vs individuals. Do not write as if one named athlete is returning from injury.\n"
            "End with ## SQUAD-LEVEL NEXT STEPS (4-6 bullets: data workflow, monitoring, session design).\n"
            if is_team_agg
            else (
                "This selection is ONE ATHLETE. End with ## PLAYER-SPECIFIC EXTRAS (5-8 bullets): "
                "tie actions to their position/role if known, their listed risk factors, and recent load/sprint exposure; "
                "include one 'if-then' trigger the staff can watch in the next 7 days.\n"
            )
        )

        if self.budget_mode:
            user_prompt = (
                "COACHING REPORT (concise; stay within output budget)\n\n"
                f"{context}\n\n"
                f"{squad_vs_individual}"
                "Write a tight professional report.\n"
                "- Target ~160–240 words total. Use bullets.\n"
                "- Do NOT invent metrics; if unknown, say so briefly.\n\n"
                "## EXECUTIVE SUMMARY (2 short bullets)\n"
                "## TOP RISK DRIVERS (3-4 bullets)\n"
                "## NEXT 3 TRAINING ACTIONS (3 bullets)\n"
                "## RECOVERY & MONITORING (3-4 bullets)\n"
            )
        else:
            user_prompt = (
                "COACHING REPORT REQUEST\n\n"
                f"{context}\n\n"
                f"{squad_vs_individual}"
                "Write a professional coaching report.\n"
                "- Keep it detailed but bounded: target 650–950 words.\n"
                "- Use bullets and concrete numbers (intensity %, volume, frequency, rest).\n"
                "- Do NOT invent missing metrics; if a metric is missing, note it and propose how to capture it.\n\n"
                "Sections:\n"
                "## EXECUTIVE SUMMARY (3-4 sentences)\n"
                "## KEY METRICS SNAPSHOT (8-12 bullets)\n"
                "## RISK DRIVERS (8-12 bullets referencing metrics/trends)\n"
                "## 7-DAY MICRO-CYCLE (Day 1..Day 7 bullets; include session focus + intensity)\n"
                "## RECOVERY & MONITORING (10-14 bullets incl. red flags)\n"
            )

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.45 if self.budget_mode else 0.6,
            "top_p": 0.85 if self.budget_mode else 0.9,
            "max_tokens": self.effective_max_tokens(),
        }
        if self.profile == "cheap":
            payload["temperature"] = 0.35

        url = f"{self.base_url}/chat/completions"
        try:
            resp = requests.post(url, headers=self._headers(), json=payload, timeout=self.timeout_s)
            if resp.status_code >= 400:
                try:
                    err = resp.json()
                except Exception:
                    err = {"error": resp.text}
                return {
                    "success": False,
                    "error": f"OpenRouter error ({resp.status_code}): {err}",
                    "recommendations": "",
                    "source": "openrouter",
                    "model": self.model,
                }

            data = resp.json()
            content: Optional[str] = None
            try:
                content = data["choices"][0]["message"]["content"]
            except Exception:
                content = None

            if not content:
                return {
                    "success": False,
                    "error": f"OpenRouter returned empty content: {data}",
                    "recommendations": "",
                    "source": "openrouter",
                    "model": self.model,
                }

            result = {
                "success": True,
                "recommendations": content.strip(),
                "source": "openrouter",
                "model": self.model,
            }
            _OPENROUTER_CACHE[cache_key] = (now, result)
            return result
        except Exception as e:
            logger.warning(f"OpenRouter request failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "recommendations": "",
                "source": "openrouter",
                "model": self.model,
            }



openrouter_service = OpenRouterService()
