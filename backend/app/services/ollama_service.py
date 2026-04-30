import os
import logging
import requests
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
DEFAULT_MODEL = "llama3.2"

try:
    import ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False
    logger.warning("Ollama not available. Install with: pip install ollama")


class OllamaService:
    def __init__(self):
        self.base_url = OLLAMA_HOST.rstrip('/')
        self.model = DEFAULT_MODEL
        self.available = OLLAMA_AVAILABLE
    
    def is_reachable(self) -> bool:
        if not self.available:
            return False
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except Exception:
            return False
    
    def get_status(self) -> Dict[str, Any]:
        if not self.available:
            return {
                'available': False,
                'status': 'not_installed',
                'message': 'Ollama library not installed. Run: pip install ollama'
            }
        
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                data = response.json()
                models = [m.get('name', '') for m in data.get('models', [])]
                has_model = self.model in models or f"{self.model}:latest" in models
                
                return {
                    'available': True,
                    'status': 'ready' if has_model else 'model_missing',
                    'models': models,
                    'defaultModel': self.model,
                    'hasDefaultModel': has_model,
                    'message': 'Ollama ready' if has_model else f'Model {self.model} not found. Run: ollama pull {self.model}'
                }
            else:
                return {
                    'available': False,
                    'status': 'server_error',
                    'message': f'Ollama server returned status {response.status_code}'
                }
        except requests.exceptions.ConnectionError:
            return {
                'available': False,
                'status': 'not_running',
                'message': 'Ollama server not running. Run: ollama serve'
            }
        except Exception as e:
            return {
                'available': False,
                'status': 'error',
                'message': str(e)
            }
    
    def get_player_recommendations(
        self, 
        player_name: str, 
        player_data: Dict[str, Any],
        risk_level: str,
        risk_factors: List[str]
    ) -> Dict[str, Any]:
        status = self.get_status()
        logger.info(f"Ollama status check: available={status.get('available')}, status={status.get('status')}")
        
        if not status.get('available') or status.get('status') != 'ready':
            error_msg = status.get('message', 'Ollama not available')
            logger.warning(f"Ollama not ready: {error_msg}")
            return {
                'success': False,
                'error': error_msg,
                'recommendations': self._get_fallback_recommendations(risk_level, player_data),
                'source': 'fallback'
            }
        
        # Double-check that Ollama is actually reachable
        if not self.is_reachable():
            logger.warning("Ollama status says ready but server is not reachable")
            return {
                'success': False,
                'error': 'Ollama server is not reachable',
                'recommendations': self._get_fallback_recommendations(risk_level, player_data),
                'source': 'fallback'
            }
        
        try:
            # Format player context
            context = self._format_player_context(player_name, player_data, risk_level, risk_factors)
            
            # Build professional coach-focused prompt
            system_prompt = """You are an elite professional soccer coach and sports scientist with extensive experience in high-performance athletics. 
Your expertise includes injury prevention, load management, periodization, and athlete optimization.

When providing recommendations:
- Use professional coaching terminology and scientific principles
- Be specific with training prescriptions (intensity, volume, frequency)
- Reference sports science research and best practices
- Provide actionable, measurable recommendations
- Consider the athlete's current risk level and training history
- Focus on evidence-based interventions

Structure your response professionally as a coaching report with clear sections."""

            user_prompt = f"""COACHING ANALYSIS REQUEST

Analyze the following player's performance data and provide a comprehensive coaching report:

{context}

Provide a professional coaching assessment in the following format:

## PERFORMANCE ASSESSMENT
Provide a 2-3 sentence professional assessment of the player's current physical status, training load, and injury risk profile. Reference specific metrics and their clinical significance.

## TRAINING PRESCRIPTION
Provide 3-4 specific, actionable training recommendations:
- Specify exact training intensity (% of max capacity)
- Recommend training volume adjustments (if needed)
- Suggest training frequency and session structure
- Include specific drills or training modalities

## LOAD MANAGEMENT STRATEGY
- Recommended weekly training load progression
- Recovery day placement and intensity
- Periodization approach for next 2-4 weeks

## RECOVERY & REGENERATION PROTOCOLS
- Specific recovery interventions (cold therapy, massage, sleep targets)
- Nutritional recommendations for recovery
- Mobility and flexibility work prescription

## MONITORING & FOLLOW-UP
- Key metrics to track in next 7-14 days
- Warning signs to watch for
- Recommended follow-up assessment timeline

Be professional, specific, and reference the actual data values provided. Use coaching terminology appropriate for elite-level soccer."""

            # Call Ollama with timeout
            logger.info(f"Calling Ollama with model: {self.model}")
            try:
                response = ollama.chat(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    options={
                        'temperature': 0.7,
                        'num_predict': 800,  # Increased for more detailed professional responses
                        'top_k': 40,
                        'top_p': 0.9
                    }
                )
                logger.info(f"Ollama response received: {bool(response)}")
            except Exception as ollama_error:
                logger.error(f"Ollama chat error: {ollama_error}", exc_info=True)
                raise
            
            if response and 'message' in response and 'content' in response['message']:
                content = response['message']['content'].strip()
                logger.info(f"Ollama generated {len(content)} characters of recommendations")
                return {
                    'success': True,
                    'recommendations': content,
                    'model': self.model,
                    'source': 'ollama'
                }
            else:
                logger.warning(f"Unexpected Ollama response format: {response}")
                return {
                    'success': False,
                    'error': 'Invalid response format from Ollama',
                    'recommendations': self._get_fallback_recommendations(risk_level, player_data)
                }
                
        except Exception as e:
            logger.error(f"Ollama error: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'recommendations': self._get_fallback_recommendations(risk_level, player_data),
                'source': 'fallback'
            }
    
    def _format_player_context(
        self, 
        player_name: str, 
        player_data: Dict[str, Any],
        risk_level: str,
        risk_factors: List[str]
    ) -> str:
        """Format player data as context for the AI"""
        metrics = player_data.get('metrics', {})
        extended = player_data.get('extendedStats', {})
        
        # Calculate load variability if available
        load_stats = extended.get('playerLoad', {})
        load_std = load_stats.get('std', 0)
        load_avg = load_stats.get('avg', metrics.get('Player Load', 0))
        load_variability = (load_std / load_avg * 100) if load_avg > 0 else 0
        
        context = f"""PLAYER PROFILE: {player_name}
INJURY RISK ASSESSMENT: {risk_level.upper()} RISK

PERFORMANCE METRICS (Last 45 days - Averages):
- Player Load: {metrics.get('Player Load', 0):.1f} (Load variability: {load_variability:.1f}%)
- Total Distance: {metrics.get('Distance (miles)', 0):.2f} miles per session
- Sprint Distance: {metrics.get('Sprint Distance (yards)', 0):.1f} yards
- Top Speed: {metrics.get('Top Speed (mph)', 0):.1f} mph
- Work Ratio: {metrics.get('Work Ratio', 0):.1f}% (fatigue indicator)
- Energy Expenditure: {metrics.get('Energy (kcal)', 0):.0f} kcal per session
- Heart Rate Load: {metrics.get('Hr Load', 0):.1f}
- Max Acceleration: {metrics.get('Max Acceleration (yd/s/s)', 0):.1f} yd/s²
- Max Deceleration: {metrics.get('Max Deceleration (yd/s/s)', 0):.1f} yd/s²

LOAD STATISTICS:
- Average Load: {load_stats.get('avg', 0):.1f}
- Peak Load: {load_stats.get('max', 0):.1f}
- Minimum Load: {load_stats.get('min', 0):.1f}
- Load Standard Deviation: {load_std:.1f}

TRAINING HISTORY:
- Total Training Sessions (all-time): {player_data.get('sessions', 0)}
- Recent Data Available (last 45 days): {'Yes' if player_data.get('hasRecentData', False) else 'No'}
- Sessions in last 45 days: {player_data.get('recentSessionCount', 0)}
- Last Session Date: {player_data.get('lastSession', 'Unknown')}

RISK FACTORS IDENTIFIED:
{chr(10).join(f'• {f}' for f in risk_factors) if risk_factors else '• No significant risk factors detected'}

CLINICAL NOTES:
- Risk level based on 45-day rolling window analysis
- Metrics reflect recent training load patterns
- Recommendations should consider current risk status and training history
"""
        return context
    
    def _get_fallback_recommendations(self, risk_level: str, player_data: Dict[str, Any]) -> str:
        """Provide basic recommendations when Ollama is not available"""
        metrics = player_data.get('metrics', {})
        load = metrics.get('Player Load', 0)
        
        if risk_level == 'high':
            return f"""## Assessment
Player shows elevated risk indicators. Current load ({load:.0f}) requires immediate attention.

## Recommendations
1. **Reduce training intensity by 25-30%** for the next 3-5 sessions
2. **Focus on active recovery** - light swimming, yoga, or mobility work
3. **Increase sleep to 9+ hours** and optimize nutrition with anti-inflammatory foods

## Training Intensity: 60-70% of max

## Recovery Priorities
- Soft tissue work and massage
- Cold water immersion post-training
- Monitor for any pain or discomfort"""
        
        elif risk_level == 'medium':
            return f"""## Assessment
Player is in moderate condition with current load at {load:.0f}. Monitoring recommended.

## Recommendations  
1. **Maintain current training load** but monitor fatigue closely
2. **Include 2 recovery sessions per week** - focus on mobility and flexibility
3. **Ensure adequate hydration** (3-4L daily) and protein intake

## Training Intensity: 75-85% of max

## Recovery Priorities
- Consistent sleep schedule (8+ hours)
- Post-training stretching routine
- Weekly soft tissue maintenance"""
        
        else:
            return f"""## Assessment
Player is in good condition with optimal load ({load:.0f}). Ready for high-performance work.

## Recommendations
1. **Safe to increase training intensity** if performance goals require
2. **Continue current recovery protocols** - they're working well
3. **Focus on skill development** and tactical work

## Training Intensity: 85-100% of max

## Recovery Priorities
- Maintain current recovery routine
- Sleep 8+ hours consistently
- Stay consistent with nutrition plan"""


ollama_service = OllamaService()
