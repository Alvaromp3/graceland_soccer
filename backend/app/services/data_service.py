import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
import logging
import json
import re
import os
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

RECENT_DATA_DAYS = 45
BACKEND_DIR = Path(__file__).resolve().parents[2]


def _pick_writable_data_store_dir() -> Path:
    """
    Prefer DATA_STORE_DIR / backend/data_store. If the configured path is not writable
    (missing disk mount, read-only FS), fall back so the API still binds and /health passes.
    """
    override = (os.environ.get("DATA_STORE_DIR") or "").strip()
    candidates: List[Path] = []
    if override:
        candidates.append(Path(override))
    candidates.append(BACKEND_DIR / "data_store")
    for p in candidates:
        try:
            p.mkdir(parents=True, exist_ok=True)
            probe = p / ".graceland_write_probe"
            probe.write_text("1", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return p
        except OSError as exc:
            logger.warning("data store path not usable %s: %s", p, exc)
            continue
    fb = Path(tempfile.gettempdir()) / "graceland_data_store"
    fb.mkdir(parents=True, exist_ok=True)
    logger.warning("using ephemeral fallback data store at %s", fb)
    return fb


DATA_STORE_DIR = _pick_writable_data_store_dir()
STATE_FILE = DATA_STORE_DIR / "state.json"
TEAM_FILES = {
    "mens": DATA_STORE_DIR / "mens.csv",
    "womens": DATA_STORE_DIR / "womens.csv",
}


class DataService:
    def __init__(self):
        self.df: Optional[pd.DataFrame] = None
        self.df_original: Optional[pd.DataFrame] = None
        self.players: List[str] = []
        self.columns: List[str] = []
        self.excluded_players: set = set()
        self.is_cleaned: bool = False
        self.cleaning_stats: Dict[str, Any] = {}
        self.use_today_as_reference: bool = True
        self.current_team: str = 'mens'  # 'mens' or 'womens'
        self.team_data: Dict[str, Optional[pd.DataFrame]] = {
            'mens': None,
            'womens': None
        }
        # Store custom player positions: {team: {player_name: position}}
        self.player_positions: Dict[str, Dict[str, str]] = {
            'mens': {},
            'womens': {}
        }
        
        self.key_columns = {
            'player_name': 'Player Name',
            'player_load': 'Player Load',
            'date': 'Date',
            'session_title': 'Session Title',
            'duration': 'Duration',
            'distance': 'Distance (miles)',
            'sprint_distance': 'Sprint Distance (yards)',
            'top_speed': 'Top Speed (mph)',
            'max_acceleration': 'Max Acceleration (yd/s/s)',
            'max_deceleration': 'Max Deceleration (yd/s/s)',
            'work_ratio': 'Work Ratio',
            'energy': 'Energy (kcal)',
            'hr_load': 'Hr Load',
            'impacts': 'Impacts',
            'power_plays': 'Power Plays',
            'power_score': 'Power Score (w/kg)',
            'distance_per_min': 'Distance Per Min (yd/min)',
        }
        
        self.risk_thresholds = {'high_load': 500, 'low_load': 200}
        self._ensure_store()

        # Default behavior: start with NO data loaded. This forces the user to upload a CSV
        # (or explicitly call the load-sample endpoint) each time the app starts.
        # You can override this with:
        # - PERSIST_DATA=1 to load persisted datasets/state from data_store/
        # - RESET_DATA_ON_START=0 to keep existing files on disk
        reset_on_start = os.environ.get("RESET_DATA_ON_START", "1") == "1"
        persist_data = os.environ.get("PERSIST_DATA", "0") == "1"

        if reset_on_start:
            self._reset_store_files()

        if persist_data and not reset_on_start:
            try:
                self._load_persisted_state()
            except MemoryError:
                logger.exception(
                    "Out of memory loading persisted CSV/state at startup — continuing empty. "
                    "Typical on Render free tier: shrink CSVs, clear the data disk, set PERSIST_DATA=0, or upgrade RAM."
                )
                self._clear_loaded_workspace_after_oom()

    def _clear_loaded_workspace_after_oom(self) -> None:
        """Reset in-memory workspace after OOM so the API process can still serve /health and uploads."""
        self.df = None
        self.df_original = None
        self.players = []
        self.columns = []
        self.team_data = {"mens": None, "womens": None}

    def _ensure_store(self) -> None:
        DATA_STORE_DIR.mkdir(parents=True, exist_ok=True)

    def _reset_store_files(self) -> None:
        """Delete persisted datasets/state so the app boots with an empty workspace."""
        try:
            for fp in TEAM_FILES.values():
                try:
                    fp.unlink(missing_ok=True)
                except Exception:
                    pass
            try:
                STATE_FILE.unlink(missing_ok=True)
            except Exception:
                pass
        except Exception as exc:
            logger.warning(f"Could not reset data store files: {exc}")

    def _state_payload(self) -> Dict[str, Any]:
        return {
            'useTodayAsReference': self.use_today_as_reference,
            'currentTeam': self.current_team,
            'excludedPlayers': sorted(self.excluded_players),
            'playerPositions': self.player_positions,
            'isCleaned': self.is_cleaned,
            'cleaningStats': self.cleaning_stats,
        }

    def _save_state(self) -> None:
        self._ensure_store()
        STATE_FILE.write_text(json.dumps(self._state_payload(), indent=2), encoding='utf-8')

    def _save_team_dataframe(self, team: str) -> None:
        if team not in TEAM_FILES or self.team_data.get(team) is None:
            return
        self._ensure_store()
        self.team_data[team].to_csv(TEAM_FILES[team], index=False)

    def _load_persisted_state(self) -> None:
        self._ensure_store()

        for team, file_path in TEAM_FILES.items():
            if file_path.exists():
                try:
                    self.team_data[team] = pd.read_csv(file_path)
                except MemoryError:
                    logger.exception(
                        "OOM reading persisted CSV for team=%s path=%s — skipping file",
                        team,
                        file_path,
                    )
                    self.team_data[team] = None
                except Exception as exc:
                    logger.warning(f"Could not load persisted dataset for {team}: {exc}")

        if STATE_FILE.exists():
            try:
                state = json.loads(STATE_FILE.read_text(encoding='utf-8'))
                self.use_today_as_reference = bool(state.get('useTodayAsReference', True))
                self.current_team = state.get('currentTeam', 'mens') if state.get('currentTeam') in ('mens', 'womens') else 'mens'
                self.excluded_players = set(state.get('excludedPlayers', []))
                self.player_positions = state.get('playerPositions', self.player_positions)
                self.is_cleaned = bool(state.get('isCleaned', False))
                self.cleaning_stats = state.get('cleaningStats', {})
            except Exception as exc:
                logger.warning(f"Could not load persisted app state: {exc}")

        active_df = self.team_data.get(self.current_team)
        if active_df is not None:
            try:
                self.df = active_df.copy()
                self.df_original = active_df.copy()
            except MemoryError:
                logger.exception("OOM copying persisted active team dataframe — skipping in-memory load")
                self.df = None
                self.df_original = None
                return
            try:
                self._process_loaded_data()
            except MemoryError:
                logger.exception("OOM processing persisted active team data — clearing workspace")
                self._clear_loaded_workspace_after_oom()
            except Exception as exc:
                logger.warning(f"Could not process persisted active team data: {exc}")

    def _normalize_player_name(self, player_name: str) -> str:
        return re.sub(r'\s+', ' ', str(player_name or '').strip())

    def _build_player_id(self, player_name: str, team: Optional[str] = None) -> str:
        team_name = team or self.current_team
        normalized = self._normalize_player_name(player_name).lower()
        slug = re.sub(r'[^a-z0-9]+', '-', normalized).strip('-')
        return f"{team_name}_{slug or 'player'}"

    def _resolve_player_name_from_id(self, player_id: str) -> Optional[str]:
        normalized_id = str(player_id or '').strip()
        if not normalized_id:
            return None

        for player_name in self.players:
            if self._build_player_id(player_name) == normalized_id:
                return player_name

        # Backward compatibility for older index-based ids.
        if normalized_id.startswith('player_'):
            try:
                idx = int(normalized_id.replace('player_', ''))
                if 0 <= idx < len(self.players):
                    return self.players[idx]
            except Exception:
                return None

        return None
    
    def load_csv(self, file_path: str, team: str = 'mens') -> Dict[str, Any]:
        """Load CSV file for a specific team"""
        self.current_team = team
        self.df = pd.read_csv(file_path)
        self.df_original = self.df.copy()
        self.team_data[team] = self.df.copy()
        self.excluded_players = set()
        self.is_cleaned = False
        self.cleaning_stats = {}
        result = self._process_loaded_data()
        self._save_team_dataframe(team)
        self._save_state()
        return result
    
    def load_from_upload(self, content: bytes, team: str = 'mens') -> Dict[str, Any]:
        """Load CSV from upload for a specific team"""
        from io import BytesIO
        self.current_team = team
        for encoding in ('utf-8-sig', 'utf-8', 'latin-1', 'cp1252'):
            try:
                self.df = pd.read_csv(BytesIO(content), encoding=encoding)
                break
            except Exception as e:
                logger.debug(f"Failed with encoding {encoding}: {e}")
                continue
        else:
            try:
                self.df = pd.read_csv(BytesIO(content))
            except Exception as e:
                logger.error(f"Failed to read CSV: {e}")
                raise ValueError(f"Could not parse CSV file. Check encoding and format: {str(e)}")
        
        if self.df is None or self.df.empty:
            raise ValueError("CSV file is empty")
        
        # Normalize column names: strip BOM, whitespace, and try to match expected names
        try:
            self.df.columns = self.df.columns.str.strip().str.replace('\ufeff', '', regex=False)
            # Map common variants to canonical names (only when different to avoid duplicates)
            col_map = {}
            for c in self.df.columns:
                c_clean = c.strip().replace('\ufeff', '')
                if c_clean.lower() == 'player name' and c_clean != 'Player Name':
                    col_map[c] = 'Player Name'
                elif c_clean.lower() == 'date' and c_clean != 'Date':
                    col_map[c] = 'Date'
                elif c_clean.lower() == 'player load' and c_clean != 'Player Load':
                    col_map[c] = 'Player Load'
            if col_map:
                self.df = self.df.rename(columns=col_map)
        except Exception as e:
            logger.warning(f"Could not normalize column names: {e}")
        
        self.df_original = self.df.copy()
        self.excluded_players = set()
        self.is_cleaned = False
        self.cleaning_stats = {}
        
        try:
            result = self._process_loaded_data()
            self.team_data[team] = self.df.copy()
            self._save_team_dataframe(team)
            self._save_state()
            return result
        except Exception as e:
            logger.error(f"Error processing loaded data: {e}", exc_info=True)
            raise ValueError(f"Error processing CSV data: {str(e)}")
    
    def switch_team(self, team: str) -> Dict[str, Any]:
        """Switch between men's and women's team data"""
        if team not in ['mens', 'womens']:
            raise ValueError("Team must be 'mens' or 'womens'")
        
        self.current_team = team
        if self.team_data[team] is not None:
            self.df = self.team_data[team].copy()
            self.df_original = self.team_data[team].copy()
            self._process_loaded_data()
            self._save_state()
            return {'success': True, 'team': team, 'message': f'Switched to {team} team'}
        else:
            self.df = None
            self.df_original = None
            self.players = []
            self.columns = []
            self.excluded_players = set()
            self.is_cleaned = False
            self.cleaning_stats = {}
            self._save_state()
            return {'success': False, 'team': team, 'message': f'No data loaded for {team} team'}
    
    def get_current_team(self) -> str:
        """Get current team"""
        return self.current_team
    
    def get_team_status(self) -> Dict[str, Any]:
        """Get status of both teams"""
        return {
            'currentTeam': self.current_team,
            'mens': {
                'loaded': self.team_data['mens'] is not None,
                'rowCount': len(self.team_data['mens']) if self.team_data['mens'] is not None else 0
            },
            'womens': {
                'loaded': self.team_data['womens'] is not None,
                'rowCount': len(self.team_data['womens']) if self.team_data['womens'] is not None else 0
            }
        }
    
    def _process_loaded_data(self) -> Dict[str, Any]:
        if self.df is None or self.df.empty:
            raise ValueError("DataFrame is empty or None")
        
        self.columns = self.df.columns.tolist()
        self.players = []
        player_col = self.key_columns['player_name']
        
        if player_col in self.df.columns:
            try:
                self.players = self.df[player_col].astype(str).str.strip().unique().tolist()
                self.players = [p for p in self.players if p and p.lower() != 'nan' and p.lower() != 'none']
            except Exception as e:
                logger.warning(f"Could not extract players from column {player_col}: {e}")
                self.players = []
        
        try:
            self._convert_numeric_columns()
        except Exception as e:
            logger.warning(f"Error converting numeric columns: {e}")
        
        try:
            self._parse_dates()
        except Exception as e:
            logger.warning(f"Error parsing dates: {e}")
        
        try:
            date_range = self._get_date_range()
        except Exception as e:
            logger.warning(f"Error getting date range: {e}")
            date_range = {'start': 'Unknown', 'end': 'Unknown'}
        
        return {
            'rowCount': len(self.df),
            'columnCount': len(self.columns),
            'columns': self.columns,
            'players': self.players,
            'dateRange': date_range
        }
    
    def _convert_numeric_columns(self):
        numeric_cols = ['Player Load', 'Duration', 'Distance (miles)', 'Sprint Distance (yards)',
            'Top Speed (mph)', 'Max Acceleration (yd/s/s)', 'Max Deceleration (yd/s/s)',
            'Work Ratio', 'Energy (kcal)', 'Hr Load', 'Impacts', 'Power Plays',
            'Power Score (w/kg)', 'Distance Per Min (yd/min)']
        for col in numeric_cols:
            if col in self.df.columns:
                self.df[col] = pd.to_numeric(self.df[col], errors='coerce')
    
    def _parse_dates(self):
        date_col = self.key_columns['date']
        if date_col in self.df.columns:
            self.df['ParsedDate'] = pd.to_datetime(self.df[date_col], errors='coerce')
    
    def _get_date_range(self) -> Dict[str, str]:
        if 'ParsedDate' not in self.df.columns:
            return {'start': 'Unknown', 'end': 'Unknown'}
        if not self.df['ParsedDate'].notna().any():
            return {'start': 'Unknown', 'end': 'Unknown'}
        try:
            min_date = self.df['ParsedDate'].min()
            max_date = self.df['ParsedDate'].max()
            if pd.isna(min_date) or pd.isna(max_date):
                return {'start': 'Unknown', 'end': 'Unknown'}
            return {
                'start': min_date.strftime('%Y-%m-%d'),
                'end': max_date.strftime('%Y-%m-%d')
            }
        except Exception:
            return {'start': 'Unknown', 'end': 'Unknown'}
    
    def _get_recent_data_for_player(self, player_name: str) -> pd.DataFrame:
        """Get data from the last 45 days (1.5 months) from TODAY's date for a player"""
        if self.df is None:
            return pd.DataFrame()
        
        pdata = self.df[self.df[self.key_columns['player_name']].str.strip() == player_name]
        
        if pdata.empty or 'ParsedDate' not in pdata.columns:
            return pd.DataFrame()
        
        # Determine reference date based on configuration
        if self.use_today_as_reference:
            # Use TODAY's actual date as reference
            reference_date = datetime.now()
        else:
            # Use the last training date from the CSV dataset
            max_date = self.df['ParsedDate'].max()
            if pd.isna(max_date):
                # Fallback to today if no valid dates
                reference_date = datetime.now()
            else:
                reference_date = max_date
        
        cutoff_date = reference_date - timedelta(days=RECENT_DATA_DAYS)
        
        # Filter for last 45 days from reference date
        recent_data = pdata[pdata['ParsedDate'] >= cutoff_date]
        
        return recent_data
    
    def has_recent_data(self, player_name: str) -> bool:
        """Check if player has data within the last 45 days"""
        recent = self._get_recent_data_for_player(player_name)
        return len(recent) > 0
    
    def _get_active_players(self) -> List[str]:
        """Get list of players excluding removed ones"""
        return [p for p in self.players if p not in self.excluded_players]
    
    def exclude_player(self, player_name: str) -> bool:
        """Exclude a player from analysis"""
        if player_name in self.players:
            self.excluded_players.add(player_name)
            self._save_state()
            return True
        return False
    
    def restore_player(self, player_name: str) -> bool:
        """Restore a previously excluded player"""
        if player_name in self.excluded_players:
            self.excluded_players.discard(player_name)
            self._save_state()
            return True
        return False
    
    def delete_player_data(self, player_id: str) -> bool:
        """Permanently delete player data from the dataframe"""
        if self.df is None:
            return False
        try:
            player_name = self._resolve_player_name_from_id(player_id)
            if not player_name:
                return False
            player_col = self.key_columns['player_name']
            
            # Remove from dataframe
            self.df = self.df[self.df[player_col].str.strip() != player_name]
            self.df_original = self.df.copy()
            self.team_data[self.current_team] = self.df.copy()
            
            # Update players list
            self.players = [p for p in self.players if p != player_name]
            self.excluded_players.discard(player_name)
            self._save_team_dataframe(self.current_team)
            self._save_state()
            
            return True
        except Exception as e:
            logger.error(f"Error deleting player: {e}")
            return False
    
    def get_dashboard_kpis(self) -> Dict[str, Any]:
        if self.df is None:
            return {'totalPlayers': 0, 'totalPlayersChange': 0, 'avgTeamLoad': 0, 
                    'avgTeamLoadChange': 0, 'highRiskPlayers': 0, 'highRiskPlayersChange': 0,
                    'avgTeamSpeed': 0, 'avgTeamSpeedChange': 0}
        
        active_players = self._get_active_players()
        player_col = self.key_columns['player_name']
        active_df = self.df[self.df[player_col].str.strip().isin(active_players)]
        
        load_col, speed_col = self.key_columns['player_load'], self.key_columns['top_speed']
        
        # Calculate real averages from data - ensure numeric and handle NaN
        if load_col in active_df.columns and len(active_df) > 0:
            load_values = pd.to_numeric(active_df[load_col], errors='coerce').dropna()
            avg_load = float(load_values.mean()) if len(load_values) > 0 else 0.0
        else:
            avg_load = 0.0
        
        if speed_col in active_df.columns and len(active_df) > 0:
            speed_values = pd.to_numeric(active_df[speed_col], errors='coerce').dropna()
            avg_speed = float(speed_values.mean()) if len(speed_values) > 0 else 0.0
        else:
            avg_speed = 0.0
        
        # Count high risk players (real calculation)
        high_risk_count = self._count_high_risk_players()
        
        # Calculate changes based on recent vs older data if available
        # For now, set to 0 since we don't have historical comparison data
        # In a real scenario, you'd compare current period vs previous period
        total_players = len(active_players)
        total_players_change = 0.0  # No historical data to compare
        
        # Calculate load change: compare recent 15 days vs previous 15 days if possible
        avg_load_change = 0.0
        if 'ParsedDate' in active_df.columns and len(active_df) > 0:
            recent_cutoff = datetime.now() - timedelta(days=15)
            recent_df = active_df[active_df['ParsedDate'] >= recent_cutoff] if active_df['ParsedDate'].notna().any() else pd.DataFrame()
            older_df = active_df[active_df['ParsedDate'] < recent_cutoff] if active_df['ParsedDate'].notna().any() else pd.DataFrame()
            
            if len(recent_df) > 0 and len(older_df) > 0:
                recent_load = float(recent_df[load_col].mean()) if load_col in recent_df.columns else avg_load
                older_load = float(older_df[load_col].mean()) if load_col in older_df.columns else avg_load
                if older_load > 0:
                    avg_load_change = round(((recent_load - older_load) / older_load) * 100, 1)
        
        # Calculate speed change similarly
        avg_speed_change = 0.0
        if 'ParsedDate' in active_df.columns and len(active_df) > 0:
            recent_cutoff = datetime.now() - timedelta(days=15)
            recent_df = active_df[active_df['ParsedDate'] >= recent_cutoff] if active_df['ParsedDate'].notna().any() else pd.DataFrame()
            older_df = active_df[active_df['ParsedDate'] < recent_cutoff] if active_df['ParsedDate'].notna().any() else pd.DataFrame()
            
            if len(recent_df) > 0 and len(older_df) > 0:
                recent_speed = float(recent_df[speed_col].mean()) if speed_col in recent_df.columns else avg_speed
                older_speed = float(older_df[speed_col].mean()) if speed_col in older_df.columns else avg_speed
                if older_speed > 0:
                    avg_speed_change = round(((recent_speed - older_speed) / older_speed) * 100, 1)
        
        return {
            'totalPlayers': total_players,
            'totalPlayersChange': total_players_change,
            'avgTeamLoad': round(avg_load, 1),
            'avgTeamLoadChange': avg_load_change,
            'highRiskPlayers': high_risk_count,
            'highRiskPlayersChange': 0.0,  # No historical comparison available
            'avgTeamSpeed': round(avg_speed, 1),
            'avgTeamSpeedChange': avg_speed_change
        }
    
    def _count_high_risk_players(self) -> int:
        """Count high risk players based on LAST 45 DAYS from TODAY only"""
        if self.df is None: 
            return 0
        load_col = self.key_columns['player_load']
        if load_col not in self.df.columns: 
            return 0
        
        active_players = self._get_active_players()
        if not active_players:
            return 0
        
        high_risk_count = 0
        
        for player_name in active_players:
            recent_data = self._get_recent_data_for_player(player_name)
            # Only count as high risk if they have recent data AND high load
            if len(recent_data) > 0:
                if load_col in recent_data.columns:
                    avg_load = float(pd.to_numeric(recent_data[load_col], errors='coerce').mean())
                    if pd.isna(avg_load):
                        avg_load = 0.0
                else:
                    avg_load = 0.0
                
                if avg_load > self.risk_thresholds['high_load']:
                    high_risk_count += 1
        
        return high_risk_count
    
    def get_risk_distribution(self) -> Dict[str, int]:
        """Get risk distribution based on LAST 45 DAYS from TODAY only"""
        if self.df is None: 
            return {'low': 0, 'medium': 0, 'high': 0}
        player_col, load_col = self.key_columns['player_name'], self.key_columns['player_load']
        if load_col not in self.df.columns: 
            return {'low': 0, 'medium': 0, 'high': 0}
        
        active_players = self._get_active_players()
        if not active_players:
            return {'low': 0, 'medium': 0, 'high': 0}
        
        # Count risk for each player based on recent data only
        low, medium, high = 0, 0, 0
        
        for player_name in active_players:
            recent_data = self._get_recent_data_for_player(player_name)
            
            # If no recent data (last 45 days from TODAY), player is LOW risk
            if len(recent_data) == 0:
                low += 1
            else:
                # Calculate average load from recent data only - ensure numeric
                if load_col in recent_data.columns:
                    avg_load = float(pd.to_numeric(recent_data[load_col], errors='coerce').mean())
                    if pd.isna(avg_load):
                        avg_load = 0.0
                else:
                    avg_load = 0.0
                
                # Classify based on thresholds
                if avg_load < self.risk_thresholds['low_load']:
                    low += 1
                elif avg_load > self.risk_thresholds['high_load']:
                    high += 1
                else:
                    medium += 1
        
        return {'low': low, 'medium': medium, 'high': high}
    
    def get_load_history(self, days: int = 15) -> List[Dict[str, Any]]:
        if self.df is None or 'ParsedDate' not in self.df.columns: 
            return []
        load_col = self.key_columns['player_load']
        if load_col not in self.df.columns: 
            return []
        
        player_col = self.key_columns['player_name']
        active_players = self._get_active_players()
        if not active_players:
            return []
        
        active_df = self.df[self.df[player_col].str.strip().isin(active_players)].copy()
        
        # Filter out rows with invalid dates
        active_df = active_df[active_df['ParsedDate'].notna()]
        if len(active_df) == 0:
            return []
        
        # Ensure ParsedDate is datetime
        if not pd.api.types.is_datetime64_any_dtype(active_df['ParsedDate']):
            active_df['ParsedDate'] = pd.to_datetime(active_df['ParsedDate'], errors='coerce')
            active_df = active_df[active_df['ParsedDate'].notna()]
        
        if len(active_df) == 0:
            return []
        
        # Group by date and calculate real averages
        active_df['date_only'] = active_df['ParsedDate'].dt.date
        daily = active_df.groupby('date_only').agg({
            load_col: 'mean',
            player_col: 'count'
        }).reset_index()
        
        daily.columns = ['date', 'avgLoad', 'sessionCount']
        
        # Ensure numeric values
        daily['avgLoad'] = pd.to_numeric(daily['avgLoad'], errors='coerce').fillna(0)
        daily['sessionCount'] = pd.to_numeric(daily['sessionCount'], errors='coerce').fillna(0).astype(int)
        
        # Sort by date and get last N days
        daily = daily.sort_values('date', ascending=True).tail(days)
        
        # Return real data with properly formatted dates
        result = []
        for _, r in daily.iterrows():
            try:
                date_val = r['date']
                # Ensure date is a date object, not string
                if isinstance(date_val, str):
                    date_val = pd.to_datetime(date_val).date()
                elif pd.isna(date_val):
                    continue
                
                avg_load_val = float(r['avgLoad']) if not pd.isna(r['avgLoad']) else 0.0
                session_count_val = int(r['sessionCount']) if not pd.isna(r['sessionCount']) else 0
                
                result.append({
                    'date': date_val.isoformat() if hasattr(date_val, 'isoformat') else str(date_val), 
                    'avgLoad': round(avg_load_val, 1), 
                    'sessionCount': session_count_val
                })
            except Exception as e:
                logger.warning(f"Error formatting load history row: {e}")
                continue
        
        return result
    
    def get_all_players(self) -> List[Dict[str, Any]]:
        """Get all players with risk based on LAST 45 DAYS from TODAY"""
        if self.df is None: return []
        player_col, load_col, speed_col = self.key_columns['player_name'], self.key_columns['player_load'], self.key_columns['top_speed']
        positions = ['GK', 'CB', 'LB', 'RB', 'CM', 'CDM', 'CAM', 'LW', 'RW', 'ST', 'CF']
        players = []
        
        for i, name in enumerate(self.players):
            if name in self.excluded_players:
                continue
            
            # Get all data for historical stats
            pdata = self.df[self.df[player_col].str.strip() == name]
            
            # Calculate averages with proper numeric handling
            if load_col in pdata.columns:
                load_values = pd.to_numeric(pdata[load_col], errors='coerce').dropna()
                avg_load = float(load_values.mean()) if len(load_values) > 0 else 0.0
            else:
                avg_load = 0.0
            
            if speed_col in pdata.columns:
                speed_values = pd.to_numeric(pdata[speed_col], errors='coerce').dropna()
                avg_speed = float(speed_values.mean()) if len(speed_values) > 0 else 0.0
            else:
                avg_speed = 0.0
            
            # Get recent data for risk calculation (last 45 days from TODAY)
            recent_data = self._get_recent_data_for_player(name)
            
            # Calculate risk based on recent data ONLY
            if len(recent_data) == 0:
                # No recent data = LOW risk
                risk = 'low'
            else:
                # Ensure numeric calculation
                if load_col in recent_data.columns:
                    load_values = pd.to_numeric(recent_data[load_col], errors='coerce').dropna()
                    recent_avg_load = float(load_values.mean()) if len(load_values) > 0 else 0.0
                else:
                    recent_avg_load = 0.0
                
                # Classify risk based on thresholds
                if recent_avg_load > self.risk_thresholds['high_load']:
                    risk = 'high'
                elif recent_avg_load < self.risk_thresholds['low_load']:
                    risk = 'low'
                else:
                    risk = 'medium'
            
            last = str(pdata['ParsedDate'].max().date()) if 'ParsedDate' in pdata.columns and pdata['ParsedDate'].notna().any() else None
            
            # Use custom position if set, otherwise use default circular assignment
            player_name_clean = self._normalize_player_name(name)
            custom_position = self.player_positions.get(self.current_team, {}).get(player_name_clean)
            position = custom_position if custom_position else positions[i % len(positions)]
            
            players.append({
                'id': self._build_player_id(player_name_clean),
                'name': player_name_clean, 
                'position': position,
                'number': i + 1, 
                'riskLevel': risk, 
                'avgLoad': round(avg_load, 1), 
                'avgSpeed': round(avg_speed, 1),
                'sessions': len(pdata), 
                'lastSession': last,
                'hasRecentData': len(recent_data) > 0,
                'recentSessions': len(recent_data)
            })
        return players
    
    def get_player_detail(self, player_id: str) -> Optional[Dict[str, Any]]:
        if self.df is None:
            return None
        player_name = self._resolve_player_name_from_id(player_id)
        if not player_name or player_name in self.excluded_players:
            return None
        
        pdata = self.df[self.df[self.key_columns['player_name']].str.strip() == player_name]
        if pdata.empty: return None
        
        base = next((p for p in self.get_all_players() if p['id'] == player_id), None)
        if not base: return None
        
        # Check if player has recent data (last 45 days)
        recent_data = self._get_recent_data_for_player(player_name)
        has_recent = len(recent_data) > 0
        
        # Use recent data for metrics if available, otherwise use all data
        data_for_metrics = recent_data if has_recent else pdata
        
        def safe_mean(col, data=data_for_metrics): 
            return round(float(data[col].mean()), 2) if col in data.columns and data[col].notna().any() else 0.0
        def safe_max(col, data=data_for_metrics): 
            return round(float(data[col].max()), 2) if col in data.columns and data[col].notna().any() else 0.0
        def safe_min(col, data=data_for_metrics): 
            return round(float(data[col].min()), 2) if col in data.columns and data[col].notna().any() else 0.0
        def safe_std(col, data=data_for_metrics): 
            return round(float(data[col].std()), 2) if col in data.columns and data[col].notna().any() and len(data) > 1 else 0.0
        
        # Build metrics with original column names for ML model compatibility
        # Use recent data (last 45 days) for risk prediction
        metrics = {
            'Player Load': safe_mean(self.key_columns['player_load']),
            'Duration': safe_mean(self.key_columns['duration']),
            'Distance (miles)': safe_mean(self.key_columns['distance']),
            'Sprint Distance (yards)': safe_mean(self.key_columns['sprint_distance']),
            'Top Speed (mph)': safe_mean(self.key_columns['top_speed']),
            'Max Acceleration (yd/s/s)': safe_mean(self.key_columns['max_acceleration']),
            'Max Deceleration (yd/s/s)': safe_mean(self.key_columns['max_deceleration']),
            'Work Ratio': safe_mean(self.key_columns['work_ratio']),
            'Energy (kcal)': safe_mean(self.key_columns['energy']),
            'Hr Load': safe_mean(self.key_columns['hr_load']),
            'Impacts': safe_mean(self.key_columns['impacts']),
            'Power Plays': safe_mean(self.key_columns['power_plays']),
            'Power Score (w/kg)': safe_mean(self.key_columns['power_score']),
            'Distance Per Min (yd/min)': safe_mean(self.key_columns['distance_per_min']),
        }
        
        # Extended stats for display (use all data for historical context)
        extended_stats = {
            'playerLoad': {'avg': safe_mean(self.key_columns['player_load'], pdata), 'max': safe_max(self.key_columns['player_load'], pdata), 'min': safe_min(self.key_columns['player_load'], pdata), 'std': safe_std(self.key_columns['player_load'], pdata)},
            'distance': {'avg': safe_mean(self.key_columns['distance'], pdata), 'max': safe_max(self.key_columns['distance'], pdata), 'min': safe_min(self.key_columns['distance'], pdata)},
            'sprintDistance': {'avg': safe_mean(self.key_columns['sprint_distance'], pdata), 'max': safe_max(self.key_columns['sprint_distance'], pdata)},
            'topSpeed': {'avg': safe_mean(self.key_columns['top_speed'], pdata), 'max': safe_max(self.key_columns['top_speed'], pdata)},
            'workRatio': {'avg': safe_mean(self.key_columns['work_ratio'], pdata), 'max': safe_max(self.key_columns['work_ratio'], pdata)},
            'energy': {'avg': safe_mean(self.key_columns['energy'], pdata), 'total': round(float(pdata[self.key_columns['energy']].sum()) if self.key_columns['energy'] in pdata.columns else 0, 0)},
        }
        
        # Session history for charts
        history = []
        for _, r in pdata.iterrows():
            session = {
                'date': str(r.get('ParsedDate', 'Unknown')).split(' ')[0] if pd.notna(r.get('ParsedDate')) else 'Unknown',
                'sessionTitle': str(r.get(self.key_columns['session_title'], 'Session')),
                'playerLoad': float(r.get(self.key_columns['player_load'], 0)) if pd.notna(r.get(self.key_columns['player_load'])) else 0,
                'distance': float(r.get(self.key_columns['distance'], 0)) if pd.notna(r.get(self.key_columns['distance'])) else 0,
                'duration': float(r.get(self.key_columns['duration'], 0)) if pd.notna(r.get(self.key_columns['duration'])) else 0,
                'topSpeed': float(r.get(self.key_columns['top_speed'], 0)) if pd.notna(r.get(self.key_columns['top_speed'])) else 0,
                'sprintDistance': float(r.get(self.key_columns['sprint_distance'], 0)) if pd.notna(r.get(self.key_columns['sprint_distance'])) else 0,
            }
            history.append(session)
        
        # Sort by date and limit
        history = sorted(history, key=lambda x: x['date'])[-30:]
        
        return {
            **base, 
            'metrics': metrics, 
            'extendedStats': extended_stats, 
            'history': history,
            'hasRecentData': has_recent,
            'recentSessionCount': len(recent_data)
        }
    
    def get_player_comparison_data(self, player_ids: List[str]) -> List[Dict[str, Any]]:
        """Get comparison data for multiple players"""
        results = []
        for pid in player_ids:
            detail = self.get_player_detail(pid)
            if detail:
                results.append({
                    'id': detail['id'],
                    'name': detail['name'],
                    'avgLoad': detail['avgLoad'],
                    'avgSpeed': detail['avgSpeed'],
                    'sessions': detail['sessions'],
                    'riskLevel': detail['riskLevel'],
                    'extendedStats': detail.get('extendedStats', {})
                })
        return results
    
    def get_high_risk_players(self) -> List[Dict[str, Any]]:
        return [p for p in self.get_all_players() if p['riskLevel'] == 'high']
    
    def get_top_performers(self, limit: int = 5) -> List[Dict[str, Any]]:
        return sorted(self.get_all_players(), key=lambda x: x['avgLoad'], reverse=True)[:limit]
    
    def get_team_average_metrics(self) -> Optional[Dict[str, Any]]:
        """Calculate average metrics for the entire team"""
        if self.df is None:
            return None
        
        all_players = self.get_all_players()
        if not all_players:
            return None
        
        # Get all player details with metrics
        player_details = []
        for player in all_players:
            detail = self.get_player_detail(player['id'])
            if detail and detail.get('hasRecentData', False):
                player_details.append(detail)
        
        if not player_details:
            return None
        
        # Calculate averages across all metrics using the same structure as individual players
        # We need to calculate metrics from recent data for all players combined
        all_recent_data = []
        for player_name in [p['name'] for p in all_players]:
            recent_data = self._get_recent_data_for_player(player_name)
            if not recent_data.empty:
                all_recent_data.append(recent_data)
        
        if all_recent_data:
            combined_recent = pd.concat(all_recent_data, ignore_index=True)
        else:
            combined_recent = pd.DataFrame()
        
        def safe_mean(col, data=combined_recent): 
            if data.empty or col not in data.columns:
                return 0.0
            return round(float(pd.to_numeric(data[col], errors='coerce').mean()), 2) if data[col].notna().any() else 0.0
        
        # Build metrics with original column names for ML model compatibility
        avg_metrics = {
            'Player Load': safe_mean(self.key_columns['player_load']),
            'Duration': safe_mean(self.key_columns['duration']),
            'Distance (miles)': safe_mean(self.key_columns['distance']),
            'Sprint Distance (yards)': safe_mean(self.key_columns['sprint_distance']),
            'Top Speed (mph)': safe_mean(self.key_columns['top_speed']),
            'Max Acceleration (yd/s/s)': safe_mean(self.key_columns['max_acceleration']),
            'Max Deceleration (yd/s/s)': safe_mean(self.key_columns['max_deceleration']),
            'Work Ratio': safe_mean(self.key_columns['work_ratio']),
            'Energy (kcal)': safe_mean(self.key_columns['energy']),
            'Hr Load': safe_mean(self.key_columns['hr_load']),
            'Impacts': safe_mean(self.key_columns['impacts']),
            'Power Plays': safe_mean(self.key_columns['power_plays']),
            'Power Score (w/kg)': safe_mean(self.key_columns['power_score']),
            'Distance Per Min (yd/min)': safe_mean(self.key_columns['distance_per_min']),
        }
        
        # Calculate average risk level (weighted by number of players)
        risk_counts = {'low': 0, 'medium': 0, 'high': 0}
        total_sessions = 0
        total_load = 0.0
        total_speed = 0.0
        
        for player in all_players:
            risk = player.get('riskLevel', 'low')
            risk_counts[risk] += 1
            total_sessions += player.get('sessions', 0)
            total_load += player.get('avgLoad', 0)
            total_speed += player.get('avgSpeed', 0)
        
        # Use ML model to predict risk based on average metrics
        try:
            risk_level, _, _, _ = ml_service.predict_risk(avg_metrics)
        except:
            # Fallback to majority rule if ML prediction fails
            if risk_counts['high'] > 0:
                risk_level = 'high'
            elif risk_counts['medium'] > risk_counts['low']:
                risk_level = 'medium'
            else:
                risk_level = 'low'
        
        # Calculate extended stats
        load_values = []
        for player in player_details:
            load_val = player.get('metrics', {}).get('Player Load', 0)
            if load_val > 0:
                load_values.append(load_val)
        
        load_std = float(pd.Series(load_values).std()) if len(load_values) > 1 else 0.0
        
        # Create team average player object
        team_avg = {
            'id': 'team_average',
            'name': 'Team Average',
            'position': 'TEAM',
            'number': 0,
            'riskLevel': risk_level,
            'avgLoad': round(avg_metrics.get('Player Load', 0), 1),
            'avgSpeed': round(avg_metrics.get('Top Speed (mph)', 0), 1),
            'sessions': total_sessions,
            'lastSession': None,
            'hasRecentData': len(player_details) > 0,
            'recentSessionCount': sum(p.get('recentSessionCount', 0) for p in player_details),
            'metrics': avg_metrics,
            'extendedStats': {
                'playerLoad': {
                    'avg': avg_metrics.get('Player Load', 0),
                    'max': max(load_values, default=0),
                    'min': min(load_values, default=0),
                    'std': load_std
                }
            },
            'teamStats': {
                'totalPlayers': len(all_players),
                'playersWithRecentData': len(player_details),
                'riskDistribution': risk_counts
            }
        }
        
        return team_avg

    def _classify_session_type(self, value: Any) -> str:
        session_text = str(value or '').strip().lower()
        if any(token in session_text for token in ('match', 'game', 'vs', 'fixture')):
            return 'match'
        return 'training'

    def _group_position_family(self, position: str) -> str:
        position_upper = str(position or '').upper()
        if position_upper == 'GK':
            return 'Goalkeepers'
        if position_upper in {'CB', 'LB', 'RB'}:
            return 'Defenders'
        if position_upper in {'CM', 'CDM', 'CAM'}:
            return 'Midfielders'
        if position_upper in {'LW', 'RW', 'ST', 'CF'}:
            return 'Forwards'
        return 'Unassigned'

    def _with_session_type(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty:
            return df.copy()
        prepared = df.copy()
        prepared['SessionType'] = prepared.get(
            self.key_columns['session_title'],
            pd.Series(index=prepared.index, dtype='object')
        ).apply(self._classify_session_type)
        return prepared

    def _rolling_average(self, grouped: pd.Series, window_days: int) -> pd.Series:
        if grouped.empty:
            return pd.Series(dtype=float)
        return grouped.rolling(window=window_days, min_periods=1).mean()

    def _acwr_series(self, grouped: pd.Series) -> pd.Series:
        if grouped.empty:
            return pd.Series(dtype=float)
        acute = grouped.rolling(window=7, min_periods=1).mean()
        chronic = grouped.rolling(window=28, min_periods=7).mean().replace(0, np.nan)
        return (acute / chronic).replace([np.inf, -np.inf], np.nan).fillna(0)

    def _player_position_map(self) -> Dict[str, str]:
        return {player['name']: player['position'] for player in self.get_all_players()}

    def get_analytics_overview(self, player_id: Optional[str] = None) -> Dict[str, Any]:
        if self.df is None or self.df.empty:
            return {
                'rollingLoad': [],
                'acwr': [],
                'sessionSplit': [],
                'positionComparison': [],
                'percentiles': [],
                'variability': [],
                'correlations': [],
                'scatterLoadWorkRatio': [],
                'scatterSprintSpeed': [],
                'outlierTimeline': [],
                'trainingDensity': [],
                'playerScope': None,
            }

        dataset = self.df.copy()
        player_scope = None
        if player_id and player_id != 'team_average':
            player_name = self._resolve_player_name_from_id(player_id)
            if player_name:
                dataset = dataset[dataset[self.key_columns['player_name']].astype(str).str.strip() == player_name]
                player_scope = player_name

        if dataset.empty:
            return {
                'rollingLoad': [],
                'acwr': [],
                'sessionSplit': [],
                'positionComparison': [],
                'percentiles': [],
                'variability': [],
                'correlations': [],
                'scatterLoadWorkRatio': [],
                'scatterSprintSpeed': [],
                'outlierTimeline': [],
                'trainingDensity': [],
                'playerScope': player_scope,
            }

        dataset = self._with_session_type(dataset)
        player_col = self.key_columns['player_name']
        load_col = self.key_columns['player_load']
        speed_col = self.key_columns['top_speed']
        sprint_col = self.key_columns['sprint_distance']
        work_ratio_col = self.key_columns['work_ratio']
        energy_col = self.key_columns['energy']
        impacts_col = self.key_columns['impacts']

        analytics: Dict[str, Any] = {
            'playerScope': player_scope,
            'rollingLoad': [],
            'acwr': [],
            'sessionSplit': [],
            'positionComparison': [],
            'percentiles': [],
            'variability': [],
            'correlations': [],
            'scatterLoadWorkRatio': [],
            'scatterSprintSpeed': [],
            'outlierTimeline': [],
            'trainingDensity': [],
        }

        if 'ParsedDate' in dataset.columns and dataset['ParsedDate'].notna().any():
            dated = dataset[dataset['ParsedDate'].notna()].copy().sort_values('ParsedDate')
            daily = dated.groupby(dated['ParsedDate'].dt.date)[load_col].mean()
            roll7 = self._rolling_average(daily, 7)
            roll14 = self._rolling_average(daily, 14)
            roll28 = self._rolling_average(daily, 28)
            acwr = self._acwr_series(daily)
            upper_band = (roll28 * 1.3).fillna(0)
            lower_band = (roll28 * 0.8).fillna(0)

            analytics['rollingLoad'] = [
                {
                    'date': str(idx),
                    'load': round(float(daily.loc[idx]), 2),
                    'rolling7': round(float(roll7.loc[idx]), 2),
                    'rolling14': round(float(roll14.loc[idx]), 2),
                    'rolling28': round(float(roll28.loc[idx]), 2),
                    'upperBand': round(float(upper_band.loc[idx]), 2),
                    'lowerBand': round(float(lower_band.loc[idx]), 2),
                }
                for idx in daily.index
            ]
            analytics['acwr'] = [
                {
                    'date': str(idx),
                    'acuteChronicRatio': round(float(acwr.loc[idx]), 3),
                    'acuteLoad': round(float(roll7.loc[idx]), 2),
                    'chronicLoad': round(float(roll28.loc[idx]), 2),
                }
                for idx in daily.index
            ]

            day_counts = dated.groupby(dated['ParsedDate'].dt.date).size()
            analytics['trainingDensity'] = [
                {'date': str(idx), 'sessions': int(count)}
                for idx, count in day_counts.items()
            ]

        split_metrics = dataset.groupby('SessionType').agg({
            load_col: 'mean',
            speed_col: 'mean',
            sprint_col: 'mean',
            energy_col: 'mean',
            player_col: 'count',
        }).reset_index()
        analytics['sessionSplit'] = [
            {
                'sessionType': row['SessionType'],
                'avgLoad': round(float(row.get(load_col, 0) or 0), 2),
                'avgTopSpeed': round(float(row.get(speed_col, 0) or 0), 2),
                'avgSprintDistance': round(float(row.get(sprint_col, 0) or 0), 2),
                'avgEnergy': round(float(row.get(energy_col, 0) or 0), 2),
                'sessions': int(row.get(player_col, 0) or 0),
            }
            for _, row in split_metrics.iterrows()
        ]

        position_map = self._player_position_map()
        if not player_scope:
            positioned = dataset.copy()
            positioned['PositionGroup'] = positioned[player_col].astype(str).str.strip().map(
                lambda name: self._group_position_family(position_map.get(name, ''))
            )
            pos_group = positioned.groupby('PositionGroup').agg({
                load_col: 'mean',
                speed_col: 'mean',
                sprint_col: 'mean',
                work_ratio_col: 'mean',
                player_col: pd.Series.nunique,
            }).reset_index()
            analytics['positionComparison'] = [
                {
                    'positionGroup': row['PositionGroup'],
                    'avgLoad': round(float(row.get(load_col, 0) or 0), 2),
                    'avgTopSpeed': round(float(row.get(speed_col, 0) or 0), 2),
                    'avgSprintDistance': round(float(row.get(sprint_col, 0) or 0), 2),
                    'avgWorkRatio': round(float(row.get(work_ratio_col, 0) or 0), 2),
                    'players': int(row.get(player_col, 0) or 0),
                }
                for _, row in pos_group.iterrows()
            ]

            percentile_source = self.get_all_players()
            if percentile_source:
                loads = pd.Series([player['avgLoad'] for player in percentile_source], dtype=float)
                speeds = pd.Series([player['avgSpeed'] for player in percentile_source], dtype=float)
                sessions = pd.Series([player['sessions'] for player in percentile_source], dtype=float)
                analytics['percentiles'] = [
                    {
                        'playerId': player['id'],
                        'playerName': player['name'],
                        'loadPercentile': round(float((loads <= player['avgLoad']).mean() * 100), 1),
                        'speedPercentile': round(float((speeds <= player['avgSpeed']).mean() * 100), 1),
                        'sessionPercentile': round(float((sessions <= player['sessions']).mean() * 100), 1),
                        'riskLevel': player['riskLevel'],
                    }
                    for player in percentile_source
                ]

            variability_rows = []
            for player in self.get_all_players():
                name = player['name']
                pdata = self.df[self.df[player_col].astype(str).str.strip() == name]
                load_values = pd.to_numeric(pdata.get(load_col), errors='coerce').dropna()
                if load_values.empty:
                    continue
                mean_load = float(load_values.mean())
                std_load = float(load_values.std()) if len(load_values) > 1 else 0.0
                cv = (std_load / mean_load * 100) if mean_load else 0.0
                variability_rows.append({
                    'playerId': player['id'],
                    'playerName': name,
                    'meanLoad': round(mean_load, 2),
                    'stdLoad': round(std_load, 2),
                    'coefficientOfVariation': round(cv, 2),
                    'riskLevel': player['riskLevel'],
                })
            analytics['variability'] = sorted(
                variability_rows,
                key=lambda item: item['coefficientOfVariation'],
                reverse=True
            )[:20]

        corr_columns = [
            load_col,
            sprint_col,
            speed_col,
            work_ratio_col,
            impacts_col,
            energy_col,
        ]
        corr_source = dataset[[col for col in corr_columns if col in dataset.columns]].apply(
            pd.to_numeric,
            errors='coerce'
        )
        if not corr_source.empty and corr_source.shape[1] > 1:
            corr_matrix = corr_source.corr().fillna(0)
            analytics['correlations'] = [
                {
                    'x': row_name,
                    'y': col_name,
                    'value': round(float(corr_matrix.loc[row_name, col_name]), 3),
                }
                for row_name in corr_matrix.index
                for col_name in corr_matrix.columns
            ]

        scatter_df = dataset.copy()
        scatter_df['RiskColor'] = scatter_df[player_col].astype(str).str.strip().map(
            lambda name: next(
                (player['riskLevel'] for player in self.get_all_players() if player['name'] == name),
                'low'
            )
        )
        analytics['scatterLoadWorkRatio'] = [
            {
                'playerName': str(row.get(player_col, '')).strip(),
                'playerLoad': round(float(pd.to_numeric(row.get(load_col), errors='coerce') or 0), 2),
                'workRatio': round(float(pd.to_numeric(row.get(work_ratio_col), errors='coerce') or 0), 2),
                'riskLevel': row.get('RiskColor', 'low'),
                'date': str(row.get('ParsedDate', '')).split(' ')[0] if pd.notna(row.get('ParsedDate')) else None,
            }
            for _, row in scatter_df.iterrows()
            if pd.notna(row.get(load_col)) and pd.notna(row.get(work_ratio_col))
        ][:250]
        analytics['scatterSprintSpeed'] = [
            {
                'playerName': str(row.get(player_col, '')).strip(),
                'sprintDistance': round(float(pd.to_numeric(row.get(sprint_col), errors='coerce') or 0), 2),
                'topSpeed': round(float(pd.to_numeric(row.get(speed_col), errors='coerce') or 0), 2),
                'energy': round(float(pd.to_numeric(row.get(energy_col), errors='coerce') or 0), 2),
                'riskLevel': row.get('RiskColor', 'low'),
            }
            for _, row in scatter_df.iterrows()
            if pd.notna(row.get(sprint_col)) and pd.notna(row.get(speed_col))
        ][:250]

        load_values = pd.to_numeric(dataset.get(load_col), errors='coerce').dropna()
        if not load_values.empty and 'ParsedDate' in dataset.columns:
            q1 = load_values.quantile(0.25)
            q3 = load_values.quantile(0.75)
            iqr = q3 - q1
            upper_bound = q3 + 3.0 * iqr
            outliers = dataset[pd.to_numeric(dataset.get(load_col), errors='coerce') > upper_bound].copy()
            analytics['outlierTimeline'] = [
                {
                    'date': str(row.get('ParsedDate', '')).split(' ')[0] if pd.notna(row.get('ParsedDate')) else 'Unknown',
                    'playerName': str(row.get(player_col, '')).strip(),
                    'playerLoad': round(float(pd.to_numeric(row.get(load_col), errors='coerce') or 0), 2),
                    'sessionTitle': str(row.get(self.key_columns['session_title'], 'Session')),
                }
                for _, row in outliers.sort_values('ParsedDate').iterrows()
            ]

        return analytics

    def get_team_comparison(self) -> Dict[str, Any]:
        comparison: Dict[str, Any] = {'teams': {}, 'metrics': []}
        metric_names = [
            ('totalPlayers', 'Total Players'),
            ('avgTeamLoad', 'Average Team Load'),
            ('highRiskPlayers', 'High Risk Players'),
            ('avgTeamSpeed', 'Average Team Speed'),
        ]
        original_team = self.current_team

        for team in ('mens', 'womens'):
            team_df = self.team_data.get(team)
            if team_df is None or team_df.empty:
                comparison['teams'][team] = {'loaded': False, 'players': [], 'kpis': None}
                continue

            self.current_team = team
            self.df = team_df.copy()
            self.df_original = team_df.copy()
            self._process_loaded_data()
            kpis = self.get_dashboard_kpis()
            players = self.get_all_players()
            comparison['teams'][team] = {
                'loaded': True,
                'players': players,
                'kpis': kpis,
                'topPerformers': sorted(players, key=lambda item: item['avgLoad'], reverse=True)[:5],
            }

        for key, label in metric_names:
            mens_value = comparison['teams'].get('mens', {}).get('kpis', {}).get(key, 0) if comparison['teams'].get('mens', {}).get('kpis') else 0
            womens_value = comparison['teams'].get('womens', {}).get('kpis', {}).get(key, 0) if comparison['teams'].get('womens', {}).get('kpis') else 0
            comparison['metrics'].append({
                'key': key,
                'label': label,
                'mensValue': mens_value,
                'womensValue': womens_value,
                'difference': round(float(mens_value - womens_value), 2) if isinstance(mens_value, (int, float)) and isinstance(womens_value, (int, float)) else 0,
            })

        self.current_team = original_team
        restored_df = self.team_data.get(original_team)
        self.df = restored_df.copy() if restored_df is not None else None
        self.df_original = restored_df.copy() if restored_df is not None else None
        if self.df is not None:
            self._process_loaded_data()

        return comparison
    
    def get_player_rankings(self, metric: str = 'player_load') -> List[Dict[str, Any]]:
        """Get player rankings sorted by different metrics"""
        if self.df is None:
            return []
        
        player_col = self.key_columns['player_name']
        active_players = self._get_active_players()
        if not active_players:
            return []
        
        rankings = []
        
        for player_name in active_players:
            pdata = self.df[self.df[player_col].str.strip() == player_name]
            if len(pdata) == 0:
                continue
            
            # Calculate all metrics
            metrics = {}
            
            # Player Load
            load_col = self.key_columns['player_load']
            if load_col in pdata.columns:
                load_values = pd.to_numeric(pdata[load_col], errors='coerce').dropna()
                metrics['player_load'] = float(load_values.mean()) if len(load_values) > 0 else 0.0
                metrics['total_load'] = float(load_values.sum()) if len(load_values) > 0 else 0.0
                metrics['max_load'] = float(load_values.max()) if len(load_values) > 0 else 0.0
            else:
                metrics['player_load'] = 0.0
                metrics['total_load'] = 0.0
                metrics['max_load'] = 0.0
            
            # Distance
            distance_col = self.key_columns['distance']
            if distance_col in pdata.columns:
                distance_values = pd.to_numeric(pdata[distance_col], errors='coerce').dropna()
                metrics['distance'] = float(distance_values.mean()) if len(distance_values) > 0 else 0.0
                metrics['total_distance'] = float(distance_values.sum()) if len(distance_values) > 0 else 0.0
                metrics['max_distance'] = float(distance_values.max()) if len(distance_values) > 0 else 0.0
            else:
                metrics['distance'] = 0.0
                metrics['total_distance'] = 0.0
                metrics['max_distance'] = 0.0
            
            # Sprint Distance
            sprint_col = self.key_columns['sprint_distance']
            if sprint_col in pdata.columns:
                sprint_values = pd.to_numeric(pdata[sprint_col], errors='coerce').dropna()
                metrics['sprint_distance'] = float(sprint_values.mean()) if len(sprint_values) > 0 else 0.0
                metrics['total_sprints'] = float(sprint_values.sum()) if len(sprint_values) > 0 else 0.0
                metrics['max_sprints'] = float(sprint_values.max()) if len(sprint_values) > 0 else 0.0
            else:
                metrics['sprint_distance'] = 0.0
                metrics['total_sprints'] = 0.0
                metrics['max_sprints'] = 0.0
            
            # Top Speed
            speed_col = self.key_columns['top_speed']
            if speed_col in pdata.columns:
                speed_values = pd.to_numeric(pdata[speed_col], errors='coerce').dropna()
                metrics['top_speed'] = float(speed_values.mean()) if len(speed_values) > 0 else 0.0
                metrics['max_speed'] = float(speed_values.max()) if len(speed_values) > 0 else 0.0
            else:
                metrics['top_speed'] = 0.0
                metrics['max_speed'] = 0.0
            
            # Work Ratio (Intensity)
            work_ratio_col = self.key_columns['work_ratio']
            if work_ratio_col in pdata.columns:
                work_values = pd.to_numeric(pdata[work_ratio_col], errors='coerce').dropna()
                metrics['work_ratio'] = float(work_values.mean()) if len(work_values) > 0 else 0.0
                metrics['max_intensity'] = float(work_values.max()) if len(work_values) > 0 else 0.0
            else:
                metrics['work_ratio'] = 0.0
                metrics['max_intensity'] = 0.0
            
            # Energy
            energy_col = self.key_columns['energy']
            if energy_col in pdata.columns:
                energy_values = pd.to_numeric(pdata[energy_col], errors='coerce').dropna()
                metrics['energy'] = float(energy_values.mean()) if len(energy_values) > 0 else 0.0
                metrics['total_energy'] = float(energy_values.sum()) if len(energy_values) > 0 else 0.0
            else:
                metrics['energy'] = 0.0
                metrics['total_energy'] = 0.0
            
            # Power Score
            power_col = self.key_columns['power_score']
            if power_col in pdata.columns:
                power_values = pd.to_numeric(pdata[power_col], errors='coerce').dropna()
                metrics['power_score'] = float(power_values.mean()) if len(power_values) > 0 else 0.0
                metrics['max_power'] = float(power_values.max()) if len(power_values) > 0 else 0.0
            else:
                metrics['power_score'] = 0.0
                metrics['max_power'] = 0.0
            
            # Max Acceleration
            accel_col = self.key_columns['max_acceleration']
            if accel_col in pdata.columns:
                accel_values = pd.to_numeric(pdata[accel_col], errors='coerce').dropna()
                metrics['max_acceleration'] = float(accel_values.max()) if len(accel_values) > 0 else 0.0
                metrics['avg_acceleration'] = float(accel_values.mean()) if len(accel_values) > 0 else 0.0
            else:
                metrics['max_acceleration'] = 0.0
                metrics['avg_acceleration'] = 0.0
            
            # Max Deceleration
            decel_col = self.key_columns['max_deceleration']
            if decel_col in pdata.columns:
                decel_values = pd.to_numeric(pdata[decel_col], errors='coerce').dropna()
                metrics['max_deceleration'] = float(decel_values.max()) if len(decel_values) > 0 else 0.0
            else:
                metrics['max_deceleration'] = 0.0
            
            # Distance per Minute
            dist_per_min_col = self.key_columns['distance_per_min']
            if dist_per_min_col in pdata.columns:
                dist_per_min_values = pd.to_numeric(pdata[dist_per_min_col], errors='coerce').dropna()
                metrics['distance_per_min'] = float(dist_per_min_values.mean()) if len(dist_per_min_values) > 0 else 0.0
            else:
                metrics['distance_per_min'] = 0.0
            
            # Impacts
            impacts_col = self.key_columns.get('impacts', 'Impacts')
            if impacts_col in pdata.columns:
                impacts_values = pd.to_numeric(pdata[impacts_col], errors='coerce').dropna()
                metrics['impacts'] = float(impacts_values.mean()) if len(impacts_values) > 0 else 0.0
                metrics['total_impacts'] = float(impacts_values.sum()) if len(impacts_values) > 0 else 0.0
            else:
                metrics['impacts'] = 0.0
                metrics['total_impacts'] = 0.0
            
            # Sessions count
            metrics['sessions'] = len(pdata)
            
            rankings.append({
                'name': player_name.strip(),
                'metrics': metrics
            })
        
        # Sort by requested metric
        metric_map = {
            'player_load': 'player_load',
            'total_distance': 'total_distance',
            'distance': 'distance',
            'sprint_distance': 'sprint_distance',
            'total_sprints': 'total_sprints',
            'top_speed': 'top_speed',
            'max_speed': 'max_speed',
            'work_ratio': 'work_ratio',
            'intensity': 'work_ratio',
            'max_intensity': 'max_intensity',
            'energy': 'energy',
            'total_energy': 'total_energy',
            'power_score': 'power_score',
            'max_power': 'max_power',
            'max_acceleration': 'max_acceleration',
            'max_deceleration': 'max_deceleration',
            'distance_per_min': 'distance_per_min',
            'impacts': 'impacts',
            'total_impacts': 'total_impacts',
        }
        
        sort_key = metric_map.get(metric, 'player_load')
        
        # Sort descending (highest first)
        rankings.sort(key=lambda x: x['metrics'].get(sort_key, 0), reverse=True)
        
        # Add rank position
        for i, player in enumerate(rankings, 1):
            player['rank'] = i
        
        return rankings
    
    def get_data_for_training(self) -> Tuple[pd.DataFrame, List[str]]:
        if self.df is None: return pd.DataFrame(), []
        feature_cols = ['Duration', 'Distance (miles)', 'Sprint Distance (yards)', 'Top Speed (mph)',
            'Max Acceleration (yd/s/s)', 'Max Deceleration (yd/s/s)', 'Work Ratio', 'Energy (kcal)',
            'Power Plays', 'Power Score (w/kg)', 'Distance Per Min (yd/min)']
        return self.df, [c for c in feature_cols if c in self.df.columns]
    
    def get_data_audit(self) -> Dict[str, Any]:
        """Get comprehensive data quality audit"""
        if self.df is None:
            return {}
        
        audit = {
            'totalRows': len(self.df),
            'totalColumns': len(self.df.columns),
            'totalPlayers': len(self.players),
            'isCleaned': self.is_cleaned,
            'cleaningStats': self.cleaning_stats,
            'beforeAfterCleaning': [],
            'missingValues': {},
            'outliers': {},
            'columnStats': {},
            'dataQualityScore': 100,
            'warnings': [],
            'recommendations': []
        }
        
        # Check for missing values
        total_missing = 0
        for col in self.df.columns:
            missing = int(self.df[col].isna().sum())
            if missing > 0:
                missing_pct = round(missing / len(self.df) * 100, 2)
                audit['missingValues'][col] = {'count': missing, 'percentage': missing_pct}
                total_missing += missing
                if missing_pct > 5:
                    audit['warnings'].append(f"{col}: {missing_pct}% missing values")
        
        # Check for outliers in numeric columns (using 3.0 IQR for permissive detection)
        numeric_cols = self.df.select_dtypes(include=[np.number]).columns.tolist()
        key_metrics = ['Player Load', 'Energy (kcal)', 'Distance (miles)', 'Top Speed (mph)', 
                       'Sprint Distance (yards)', 'Work Ratio', 'Duration']
        
        # Use 3.0 IQR threshold for more permissive outlier detection
        outlier_threshold = 3.0
        
        total_outliers = 0
        for col in numeric_cols:
            if col in key_metrics or col in self.df.columns:
                try:
                    Q1 = self.df[col].quantile(0.25)
                    Q3 = self.df[col].quantile(0.75)
                    IQR = Q3 - Q1
                    if IQR > 0:
                        # More permissive: only flag extreme outliers (3.0 IQR)
                        lower_bound = Q1 - outlier_threshold * IQR
                        upper_bound = Q3 + outlier_threshold * IQR
                        outliers_mask = (self.df[col] < lower_bound) | (self.df[col] > upper_bound)
                        outlier_count = int(outliers_mask.sum())
                        if outlier_count > 0:
                            outlier_pct = round(outlier_count / len(self.df) * 100, 2)
                            audit['outliers'][col] = {
                                'count': outlier_count,
                                'percentage': outlier_pct,
                                'lowerBound': round(lower_bound, 2),
                                'upperBound': round(upper_bound, 2),
                                'min': round(float(self.df[col].min()), 2),
                                'max': round(float(self.df[col].max()), 2)
                            }
                            total_outliers += outlier_count
                            # Only warn if more than 10% are outliers (since we're using 3.0 IQR)
                            if outlier_pct > 10:
                                audit['warnings'].append(f"{col}: {outlier_pct}% extreme outliers detected")
                except Exception as e:
                    logger.warning(f"Error checking outliers for {col}: {e}")
        
        # Column statistics for key metrics
        for col in key_metrics:
            if col in self.df.columns:
                try:
                    audit['columnStats'][col] = {
                        'mean': round(float(self.df[col].mean()), 2),
                        'std': round(float(self.df[col].std()), 2),
                        'min': round(float(self.df[col].min()), 2),
                        'max': round(float(self.df[col].max()), 2),
                        'median': round(float(self.df[col].median()), 2),
                        'q25': round(float(self.df[col].quantile(0.25)), 2),
                        'q75': round(float(self.df[col].quantile(0.75)), 2),
                    }
                except:
                    pass
        
        # Calculate data quality score
        score = 100
        if total_missing > 0:
            score -= min(20, (total_missing / (len(self.df) * len(self.df.columns)) * 100))
        if total_outliers > 0:
            score -= min(30, (total_outliers / len(self.df) * 10))
        
        audit['dataQualityScore'] = max(0, round(score, 1))
        
        # Recommendations
        if audit['outliers']:
            audit['recommendations'].append("Click 'Clean Outliers' to remove extreme values using IQR method")
        if audit['missingValues']:
            audit['recommendations'].append("Consider filling missing values before training models")
        if not self.is_cleaned and audit['outliers']:
            audit['recommendations'].append("Data cleaning recommended for better model performance")

        if self.is_cleaned and self.df_original is not None:
            compare_columns = ['Player Load', 'Distance (miles)', 'Sprint Distance (yards)', 'Top Speed (mph)', 'Work Ratio']
            for col in compare_columns:
                if col in self.df.columns and col in self.df_original.columns:
                    before = pd.to_numeric(self.df_original[col], errors='coerce')
                    after = pd.to_numeric(self.df[col], errors='coerce')
                    audit['beforeAfterCleaning'].append({
                        'metric': col,
                        'beforeMean': round(float(before.mean()), 2) if before.notna().any() else 0.0,
                        'afterMean': round(float(after.mean()), 2) if after.notna().any() else 0.0,
                        'beforeMax': round(float(before.max()), 2) if before.notna().any() else 0.0,
                        'afterMax': round(float(after.max()), 2) if after.notna().any() else 0.0,
                    })
        
        return audit
    
    def clean_outliers(self, method: str = 'iqr', threshold: float = 3.0) -> Dict[str, Any]:
        """Clean outliers using IQR method - More permissive (threshold 3.0 by default)"""
        if self.df is None:
            return {'error': 'No data loaded'}
        
        df_before = len(self.df)
        rows_modified = 0
        column_changes = {}
        
        numeric_cols = self.df.select_dtypes(include=[np.number]).columns.tolist()
        
        for col in numeric_cols:
            try:
                Q1 = self.df[col].quantile(0.25)
                Q3 = self.df[col].quantile(0.75)
                IQR = Q3 - Q1
                
                if IQR > 0:
                    # More permissive: use 3.0 IQR by default (only cap extreme outliers)
                    # This is more conservative and preserves more data
                    lower_bound = Q1 - threshold * IQR
                    upper_bound = Q3 + threshold * IQR
                    
                    # Only cap values that are truly extreme (beyond 3 IQR)
                    # This is much more permissive than standard 1.5 IQR
                    outliers_low = (self.df[col] < lower_bound).sum()
                    outliers_high = (self.df[col] > upper_bound).sum()
                    total_outliers = outliers_low + outliers_high
                    
                    if total_outliers > 0:
                        # Cap only extreme outliers (more permissive approach)
                        self.df[col] = np.where(
                            self.df[col] < lower_bound, lower_bound,
                            np.where(self.df[col] > upper_bound, upper_bound, self.df[col])
                        )
                        column_changes[col] = {
                            'outliersCapped': int(total_outliers),
                            'lowerBound': round(lower_bound, 2),
                            'upperBound': round(upper_bound, 2)
                        }
                        rows_modified += total_outliers
            except Exception as e:
                logger.warning(f"Error cleaning outliers for {col}: {e}")
        
        self.is_cleaned = True
        self.cleaning_stats = {
            'method': method,
            'threshold': threshold,
            'rowsBefore': df_before,
            'rowsAfter': len(self.df),
            'totalOutliersCapped': int(rows_modified),
            'columnsAffected': len(column_changes),
            'columnDetails': column_changes
        }
        
        # Refresh player list and data
        self._process_loaded_data()
        self.team_data[self.current_team] = self.df.copy()
        self._save_team_dataframe(self.current_team)
        self._save_state()
        
        return {
            'success': True,
            'message': f'Cleaned {rows_modified} outlier values across {len(column_changes)} columns',
            'stats': self.cleaning_stats
        }
    
    def reset_to_original(self) -> Dict[str, Any]:
        """Reset data to original (undo cleaning)"""
        if self.df_original is None:
            return {'error': 'No original data available'}
        
        self.df = self.df_original.copy()
        self.is_cleaned = False
        self.cleaning_stats = {}
        self._process_loaded_data()
        self.team_data[self.current_team] = self.df.copy()
        self._save_team_dataframe(self.current_team)
        self._save_state()
        
        return {
            'success': True,
            'message': 'Data reset to original',
            'rowCount': len(self.df)
        }
    
    def get_date_reference_setting(self) -> Dict[str, Any]:
        """Get current date reference setting"""
        return {
            'useTodayAsReference': self.use_today_as_reference,
            'description': 'Use today\'s date' if self.use_today_as_reference else 'Use last training date from CSV'
        }
    
    def set_date_reference_setting(self, use_today: bool) -> Dict[str, Any]:
        """Set date reference setting"""
        self.use_today_as_reference = use_today
        self._save_state()
        label = "Today's date" if use_today else "Last training date from CSV"
        return {
            'success': True,
            'useTodayAsReference': self.use_today_as_reference,
            'message': f'Date reference set to: {label}'
        }
    
    def update_player_position(self, player_name: str, position: str, team: str = None) -> Dict[str, Any]:
        """Update player position for a specific team"""
        team = team or self.current_team
        player_name = self._normalize_player_name(player_name)
        if team not in ['mens', 'womens']:
            raise ValueError("Team must be 'mens' or 'womens'")
        
        valid_positions = ['GK', 'CB', 'LB', 'RB', 'CM', 'CDM', 'CAM', 'LW', 'RW', 'ST', 'CF']
        if position not in valid_positions:
            raise ValueError(f"Position must be one of: {', '.join(valid_positions)}")
        
        if team not in self.player_positions:
            self.player_positions[team] = {}
        
        self.player_positions[team][player_name] = position
        self._save_state()
        
        return {
            'success': True,
            'playerName': player_name,
            'position': position,
            'team': team,
            'message': f'Position updated to {position} for {player_name}'
        }
    
    def get_player_position(self, player_name: str, team: str = None) -> Optional[str]:
        """Get player position for a specific team"""
        team = team or self.current_team
        return self.player_positions.get(team, {}).get(player_name)


data_service = DataService()
