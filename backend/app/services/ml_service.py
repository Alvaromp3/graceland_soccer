import numpy as np
import pandas as pd
from typing import Optional, Dict, Any, List, Tuple
import warnings
import joblib
import pickle
import os
import time
import logging
import threading
from datetime import datetime

# Heavy ML stack is imported lazily on first use so Render cold-starts stay fast
# and `/health` does not pull sklearn + optional boosters into memory.
_ml_import_lock = threading.Lock()
_ml_imports_ready = False
StandardScaler: Any = None  # type: ignore[assignment]
train_test_split: Any = None
cross_val_score: Any = None
r2_score: Any = None
mean_absolute_error: Any = None
mean_squared_error: Any = None
accuracy_score: Any = None
precision_score: Any = None
recall_score: Any = None
f1_score: Any = None
GradientBoostingRegressor: Any = None
RandomForestClassifier: Any = None
RandomForestRegressor: Any = None
GradientBoostingClassifier: Any = None
Pipeline: Any = None
XGBOOST_AVAILABLE = False
LIGHTGBM_AVAILABLE = False
CATBOOST_AVAILABLE = False
LGBMClassifier: Any = None
LGBMRegressor: Any = None


def _ensure_ml_imports() -> None:
    global _ml_imports_ready
    global StandardScaler, train_test_split, cross_val_score, r2_score, mean_absolute_error, mean_squared_error
    global accuracy_score, precision_score, recall_score, f1_score
    global GradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, Pipeline
    global XGBOOST_AVAILABLE, LIGHTGBM_AVAILABLE, CATBOOST_AVAILABLE, LGBMClassifier, LGBMRegressor

    if _ml_imports_ready:
        return
    with _ml_import_lock:
        if _ml_imports_ready:
            return
        try:
            from sklearn.exceptions import InconsistentVersionWarning  # type: ignore

            warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
        except Exception:
            pass

        from sklearn.preprocessing import StandardScaler as _StandardScaler
        from sklearn.model_selection import train_test_split as _train_test_split, cross_val_score as _cross_val_score
        from sklearn.metrics import r2_score as _r2_score, mean_absolute_error as _mean_absolute_error, mean_squared_error as _mean_squared_error
        from sklearn.metrics import accuracy_score as _accuracy_score, precision_score as _precision_score, recall_score as _recall_score, f1_score as _f1_score
        from sklearn.ensemble import GradientBoostingRegressor as _GradientBoostingRegressor
        from sklearn.ensemble import RandomForestClassifier as _RandomForestClassifier, RandomForestRegressor as _RandomForestRegressor
        from sklearn.ensemble import GradientBoostingClassifier as _GradientBoostingClassifier
        from sklearn.pipeline import Pipeline as _Pipeline

        StandardScaler = _StandardScaler
        train_test_split = _train_test_split
        cross_val_score = _cross_val_score
        r2_score = _r2_score
        mean_absolute_error = _mean_absolute_error
        mean_squared_error = _mean_squared_error
        accuracy_score = _accuracy_score
        precision_score = _precision_score
        recall_score = _recall_score
        f1_score = _f1_score
        GradientBoostingRegressor = _GradientBoostingRegressor
        RandomForestClassifier = _RandomForestClassifier
        RandomForestRegressor = _RandomForestRegressor
        GradientBoostingClassifier = _GradientBoostingClassifier
        Pipeline = _Pipeline

        try:
            import xgboost  # noqa: F401

            XGBOOST_AVAILABLE = True
        except ImportError:
            XGBOOST_AVAILABLE = False

        try:
            from lightgbm import LGBMClassifier as _LGBMClassifier, LGBMRegressor as _LGBMRegressor

            LGBMClassifier = _LGBMClassifier
            LGBMRegressor = _LGBMRegressor
            LIGHTGBM_AVAILABLE = True
        except ImportError:
            LIGHTGBM_AVAILABLE = False
            LGBMClassifier = None
            LGBMRegressor = None

        try:
            import catboost  # noqa: F401

            CATBOOST_AVAILABLE = True
        except ImportError:
            CATBOOST_AVAILABLE = False

        _ml_imports_ready = True


logger = logging.getLogger(__name__)

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(BACKEND_DIR, 'modelos_graceland')


class MLService:
    def __init__(self, *, load_on_init: bool = False):
        self.load_pipeline: Optional[Any] = None
        self.risk_pipeline: Optional[Any] = None
        self.feature_columns: List[str] = []
        self.load_features: List[str] = []
        self.risk_features: List[str] = []
        self.load_metrics: Optional[Dict] = None
        self.risk_metrics: Optional[Dict] = None
        self.load_diagnostics: Dict[str, Any] = {}
        self.risk_diagnostics: Dict[str, Any] = {}
        self._models_loaded: bool = False
        self._load_lock = threading.Lock()
        if load_on_init:
            self._ensure_models_loaded()

    def _ensure_models_loaded(self) -> None:
        if self._models_loaded:
            return
        with self._load_lock:
            if self._models_loaded:
                return
            self._load_saved_models()
            self._models_loaded = True
    
    def _load_saved_models(self):
        _ensure_ml_imports()
        # Ensure models directory exists
        os.makedirs(MODELS_DIR, exist_ok=True)
        
        regression_path = os.path.join(MODELS_DIR, 'regression_model.pkl')
        classification_path = os.path.join(MODELS_DIR, 'classification_model.pkl')
        load_joblib_path = os.path.join(MODELS_DIR, 'load_model.joblib')
        risk_joblib_path = os.path.join(MODELS_DIR, 'risk_model.joblib')
        
        logger.info(f"Looking for models in: {MODELS_DIR}")
        logger.info(f"Regression path exists: {os.path.exists(regression_path)}")
        logger.info(f"Load joblib exists: {os.path.exists(load_joblib_path)}")
        
        # Try loading regression model (pickle format)
        if os.path.exists(regression_path):
            try:
                with open(regression_path, 'rb') as f:
                    data = pickle.load(f)
                self.load_pipeline = data.get('model')
                self.load_metrics = data.get('metrics')
                self.load_features = data.get('features', [])
                logger.info(f"✓ Loaded regression model from {regression_path}")
            except Exception as e:
                logger.warning(f"Could not load regression model: {e}")
        
        # Try loading load model (joblib format) if pickle didn't work
        if self.load_pipeline is None and os.path.exists(load_joblib_path):
            try:
                self.load_pipeline = joblib.load(load_joblib_path)
                cols_path = os.path.join(MODELS_DIR, 'load_feature_cols.joblib')
                if os.path.exists(cols_path):
                    self.load_features = joblib.load(cols_path)
                logger.info(f"✓ Loaded load model from {load_joblib_path}")
            except Exception as e:
                logger.warning(f"Could not load load model: {e}")
        
        # Try loading classification model (pickle format)
        if os.path.exists(classification_path):
            try:
                with open(classification_path, 'rb') as f:
                    data = pickle.load(f)
                self.risk_pipeline = data.get('model')
                self.risk_metrics = data.get('metrics')
                self.risk_features = data.get('features', [])
                logger.info(f"✓ Loaded classification model from {classification_path}")
            except Exception as e:
                logger.warning(f"Could not load classification model: {e}")
        
        # Try loading risk model (joblib format) if pickle didn't work
        if self.risk_pipeline is None and os.path.exists(risk_joblib_path):
            try:
                self.risk_pipeline = joblib.load(risk_joblib_path)
                cols_path = os.path.join(MODELS_DIR, 'risk_feature_cols.joblib')
                if os.path.exists(cols_path):
                    self.risk_features = joblib.load(cols_path)
                logger.info(f"✓ Loaded risk model from {risk_joblib_path}")
            except Exception as e:
                logger.warning(f"Could not load risk model: {e}")
        
        # Final status log
        logger.info(f"Model loading complete - Load: {self.load_pipeline is not None}, Risk: {self.risk_pipeline is not None}")
    
    def get_available_algorithms(self) -> Dict[str, List[Dict[str, str]]]:
        _ensure_ml_imports()
        regression_algos = [
            {'id': 'gradient_boosting', 'name': 'Gradient Boosting', 'available': True},
            {'id': 'random_forest', 'name': 'Random Forest', 'available': True},
            {'id': 'xgboost', 'name': 'XGBoost', 'available': XGBOOST_AVAILABLE},
            {'id': 'lightgbm', 'name': 'LightGBM', 'available': LIGHTGBM_AVAILABLE},
            {'id': 'catboost', 'name': 'CatBoost', 'available': CATBOOST_AVAILABLE},
        ]
        
        classification_algos = [
            {'id': 'random_forest', 'name': 'Random Forest', 'available': True},
            {'id': 'gradient_boosting', 'name': 'Gradient Boosting', 'available': True},
            {'id': 'xgboost', 'name': 'XGBoost', 'available': XGBOOST_AVAILABLE},
            {'id': 'lightgbm', 'name': 'LightGBM', 'available': LIGHTGBM_AVAILABLE},
            {'id': 'catboost', 'name': 'CatBoost', 'available': CATBOOST_AVAILABLE},
        ]
        
        return {
            'regression': regression_algos,
            'classification': classification_algos
        }
    
    def _get_regressor(self, algorithm: str = 'gradient_boosting'):
        return GradientBoostingRegressor(n_estimators=100, max_depth=5, random_state=42)
    
    def _get_classifier(self, algorithm: str = 'lightgbm'):
        if LIGHTGBM_AVAILABLE and LGBMClassifier is not None:
            return LGBMClassifier(n_estimators=100, max_depth=5, random_state=42, verbose=-1)
        else:
            return GradientBoostingClassifier(n_estimators=100, max_depth=5, random_state=42)
    
    def train_load_model(self, df: pd.DataFrame, feature_cols: List[str], 
                         algorithm: str = 'gradient_boosting') -> Dict[str, Any]:
        _ensure_ml_imports()
        start_time = time.time()
        
        target_col = 'Player Load'
        if target_col not in df.columns:
            raise ValueError(f"Target column '{target_col}' not found in data")
        
        available_features = [c for c in feature_cols if c in df.columns and c != target_col]
        X = df[available_features].copy()
        y = df[target_col].copy()
        
        for col in X.columns:
            X[col] = pd.to_numeric(X[col], errors='coerce')
        y = pd.to_numeric(y, errors='coerce')
        
        mask = ~(X.isna().any(axis=1) | y.isna())
        X, y = X[mask], y[mask]
        
        if len(X) < 10:
            raise ValueError(f"Not enough valid data points for training (got {len(X)}, need at least 10)")
        
        self.load_features = available_features
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        model = self._get_regressor(algorithm)
        
        self.load_pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('model', model)
        ])
        
        self.load_pipeline.fit(X_train, y_train)
        
        y_pred_test = self.load_pipeline.predict(X_test)
        y_pred_train = self.load_pipeline.predict(X_train)
        
        test_metrics = {
            'r2Score': round(r2_score(y_test, y_pred_test), 4),
            'mae': round(mean_absolute_error(y_test, y_pred_test), 4),
            'rmse': round(np.sqrt(mean_squared_error(y_test, y_pred_test)), 4),
            'mse': round(mean_squared_error(y_test, y_pred_test), 4)
        }
        
        train_metrics = {
            'r2Score': round(r2_score(y_train, y_pred_train), 4),
            'mae': round(mean_absolute_error(y_train, y_pred_train), 4),
            'rmse': round(np.sqrt(mean_squared_error(y_train, y_pred_train)), 4),
        }
        
        cv_scores = cross_val_score(self.load_pipeline, X, y, cv=5, scoring='r2')
        cv_metrics = {
            'cvR2Mean': round(np.mean(cv_scores), 4),
            'cvR2Std': round(np.std(cv_scores), 4)
        }
        
        os.makedirs(MODELS_DIR, exist_ok=True)
        joblib.dump(self.load_pipeline, os.path.join(MODELS_DIR, 'load_model.joblib'))
        joblib.dump(self.load_features, os.path.join(MODELS_DIR, 'load_feature_cols.joblib'))
        
        with open(os.path.join(MODELS_DIR, 'regression_model.pkl'), 'wb') as f:
            pickle.dump({
                'model': self.load_pipeline,
                'metrics': test_metrics,
                'features': self.load_features,
                'timestamp': datetime.now().isoformat()
            }, f)
        
        training_time = round(time.time() - start_time, 2)
        self.load_metrics = test_metrics
        self.load_diagnostics = {
            'trainMetrics': train_metrics,
            'cvMetrics': cv_metrics,
            'featureImportance': self._extract_feature_importance(self.load_pipeline, self.load_features),
            'samplesUsed': len(X),
            'residualSummary': {
                'meanResidual': round(float(np.mean(y_test - y_pred_test)), 4),
                'maxAbsoluteResidual': round(float(np.max(np.abs(y_test - y_pred_test))), 4),
            },
        }
        
        return {
            'modelType': 'regression',
            'algorithm': algorithm,
            'metrics': test_metrics,
            'trainMetrics': train_metrics,
            'cvMetrics': cv_metrics,
            'trainingTime': training_time,
            'samplesUsed': len(X),
            'featuresUsed': len(available_features),
            'timestamp': datetime.now().isoformat()
        }
    
    def train_risk_model(self, df: pd.DataFrame, feature_cols: List[str],
                         algorithm: str = 'random_forest') -> Dict[str, Any]:
        _ensure_ml_imports()
        start_time = time.time()
        
        load_col = 'Player Load'
        if load_col not in df.columns:
            raise ValueError(f"Column '{load_col}' not found")
        
        df = df.copy()
        
        load_values = pd.to_numeric(df[load_col], errors='coerce').dropna()
        q25 = load_values.quantile(0.25)
        q75 = load_values.quantile(0.75)
        
        df['risk_label'] = pd.cut(
            pd.to_numeric(df[load_col], errors='coerce'),
            bins=[0, q25, q75, float('inf')],
            labels=[0, 1, 2]
        )
        
        available_features = [c for c in feature_cols if c in df.columns and c != load_col and c != 'risk_label']
        X = df[available_features].copy()
        y = df['risk_label'].copy()
        
        for col in X.columns:
            X[col] = pd.to_numeric(X[col], errors='coerce')
        
        mask = ~(X.isna().any(axis=1) | y.isna())
        X, y = X[mask], y[mask].astype(int)
        
        if len(X) < 10:
            raise ValueError(f"Not enough valid data points for training (got {len(X)}, need at least 10)")
        
        self.risk_features = available_features
        
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        
        model = self._get_classifier(algorithm)
        
        self.risk_pipeline = Pipeline([
            ('scaler', StandardScaler()),
            ('model', model)
        ])
        
        self.risk_pipeline.fit(X_train, y_train)
        
        y_pred_test = self.risk_pipeline.predict(X_test)
        y_pred_train = self.risk_pipeline.predict(X_train)
        
        test_metrics = {
            'accuracy': round(accuracy_score(y_test, y_pred_test), 4),
            'precision': round(precision_score(y_test, y_pred_test, average='weighted', zero_division=0), 4),
            'recall': round(recall_score(y_test, y_pred_test, average='weighted', zero_division=0), 4),
            'f1Score': round(f1_score(y_test, y_pred_test, average='weighted', zero_division=0), 4)
        }
        
        train_metrics = {
            'accuracy': round(accuracy_score(y_train, y_pred_train), 4),
            'precision': round(precision_score(y_train, y_pred_train, average='weighted', zero_division=0), 4),
        }
        
        cv_scores = cross_val_score(self.risk_pipeline, X, y, cv=5, scoring='accuracy')
        cv_metrics = {
            'cvAccuracyMean': round(np.mean(cv_scores), 4),
            'cvAccuracyStd': round(np.std(cv_scores), 4)
        }
        
        os.makedirs(MODELS_DIR, exist_ok=True)
        joblib.dump(self.risk_pipeline, os.path.join(MODELS_DIR, 'risk_model.joblib'))
        joblib.dump(self.risk_features, os.path.join(MODELS_DIR, 'risk_feature_cols.joblib'))
        
        with open(os.path.join(MODELS_DIR, 'classification_model.pkl'), 'wb') as f:
            pickle.dump({
                'model': self.risk_pipeline,
                'metrics': test_metrics,
                'features': self.risk_features,
                'timestamp': datetime.now().isoformat()
            }, f)
        
        training_time = round(time.time() - start_time, 2)
        self.risk_metrics = test_metrics
        self.risk_diagnostics = {
            'trainMetrics': train_metrics,
            'cvMetrics': cv_metrics,
            'featureImportance': self._extract_feature_importance(self.risk_pipeline, self.risk_features),
            'samplesUsed': len(X),
            'classDistribution': {
                'low': int((y == 0).sum()),
                'medium': int((y == 1).sum()),
                'high': int((y == 2).sum())
            },
        }
        
        return {
            'modelType': 'classification',
            'algorithm': algorithm,
            'metrics': test_metrics,
            'trainMetrics': train_metrics,
            'cvMetrics': cv_metrics,
            'trainingTime': training_time,
            'samplesUsed': len(X),
            'featuresUsed': len(available_features),
            'classDistribution': {
                'low': int((y == 0).sum()),
                'medium': int((y == 1).sum()),
                'high': int((y == 2).sum())
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def predict_load(self, features: Dict[str, Any], session_type: str = 'match') -> Dict[str, Any]:
        self._ensure_models_loaded()
        if self.load_pipeline is None:
            avg_load = features.get('Player Load', features.get('avgLoad', 300))
            multiplier = 1.15 if session_type == 'match' else 0.9
            return {
                'predictedLoad': float(avg_load) * multiplier,
                'confidence': 0.6,
                'method': 'average_based',
                'sessionType': session_type
            }
        
        feature_cols = self.load_features if self.load_features else list(features.keys())
        
        X = pd.DataFrame([features])
        
        for col in feature_cols:
            if col not in X.columns:
                X[col] = 0
        
        available_cols = [c for c in feature_cols if c in X.columns]
        X = X[available_cols]
        
        for col in X.columns:
            X[col] = pd.to_numeric(X[col], errors='coerce').fillna(0)
        
        prediction = self.load_pipeline.predict(X)[0]
        
        if session_type == 'match':
            prediction *= 1.15
        elif session_type == 'training':
            prediction *= 0.9
        
        return {
            'predictedLoad': float(prediction),
            'confidence': 0.85,
            'method': 'ml_model',
            'sessionType': session_type
        }
    
    def predict_risk(self, features: Dict[str, float]) -> Tuple[str, float, List[str], List[str]]:
        self._ensure_models_loaded()
        if self.risk_pipeline is None:
            return self._rule_based_risk_prediction(features)
        
        try:
            feature_cols = self.risk_features if self.risk_features else list(features.keys())
            
            X = pd.DataFrame([features])
            
            for col in feature_cols:
                if col not in X.columns:
                    X[col] = 0
            
            available_cols = [c for c in feature_cols if c in X.columns]
            
            if not available_cols:
                return self._rule_based_risk_prediction(features)
            
            X = X[available_cols]
            
            for col in X.columns:
                X[col] = pd.to_numeric(X[col], errors='coerce').fillna(0)
            
            prediction = self.risk_pipeline.predict(X)[0]
            proba = self.risk_pipeline.predict_proba(X)[0]
            
            risk_levels = ['low', 'medium', 'high']
            risk_level = risk_levels[int(prediction)]
            probability = float(max(proba))
            
            factors = self._get_risk_factors(features, risk_level)
            recommendations = self._get_recommendations(risk_level, features)
            
            return risk_level, probability, factors, recommendations
            
        except Exception as e:
            logger.warning(f"ML prediction failed, using rule-based: {e}")
            return self._rule_based_risk_prediction(features)
    
    def _rule_based_risk_prediction(self, features: Dict[str, float]) -> Tuple[str, float, List[str], List[str]]:
        player_load = features.get('Player Load', features.get('playerLoad', 0))
        work_ratio = features.get('Work Ratio', features.get('workRatio', 0))
        top_speed = features.get('Top Speed (mph)', features.get('topSpeed', 0))
        sprint_dist = features.get('Sprint Distance (yards)', features.get('sprintDistance', 0))
        
        risk_score = 0
        factors = []
        
        if player_load > 500:
            risk_score += 3
            factors.append(f"High player load ({player_load:.0f}) exceeds safe threshold")
        elif player_load > 300:
            risk_score += 1
            factors.append(f"Moderate player load ({player_load:.0f})")
        
        if work_ratio > 25:
            risk_score += 2
            factors.append(f"High work ratio ({work_ratio:.1f}) indicates fatigue")
        elif work_ratio > 15:
            risk_score += 1
            factors.append(f"Elevated work ratio ({work_ratio:.1f})")
        
        if top_speed > 20:
            risk_score += 1
            factors.append(f"High speed sessions ({top_speed:.1f} mph) increase strain")
        
        if sprint_dist > 600:
            risk_score += 1
            factors.append(f"High sprint distance ({sprint_dist:.0f} yards)")
        
        if risk_score >= 4:
            risk_level = 'high'
            probability = 0.85
        elif risk_score >= 2:
            risk_level = 'medium'
            probability = 0.65
        else:
            risk_level = 'low'
            probability = 0.80
            factors = ["All metrics within normal parameters"]
        
        recommendations = self._get_recommendations(risk_level, features)
        
        return risk_level, probability, factors, recommendations
    
    def _get_risk_factors(self, features: Dict[str, float], risk_level: str) -> List[str]:
        factors = []
        
        work_ratio = features.get('Work Ratio', features.get('workRatio', 0))
        sprint_dist = features.get('Sprint Distance (yards)', features.get('sprintDistance', 0))
        top_speed = features.get('Top Speed (mph)', features.get('topSpeed', 0))
        distance = features.get('Distance (miles)', features.get('distance', 0))
        player_load = features.get('Player Load', features.get('playerLoad', 0))
        
        if work_ratio > 20:
            factors.append(f"High work ratio ({work_ratio:.1f}) indicates fatigue accumulation")
        if sprint_dist > 500:
            factors.append(f"Elevated sprint distance ({sprint_dist:.0f} yards) increases muscle strain risk")
        if top_speed > 18:
            factors.append(f"High top speed ({top_speed:.1f} mph) sessions require adequate recovery")
        if distance > 5:
            factors.append(f"High total distance ({distance:.2f} miles) may lead to overload")
        if player_load > 500:
            factors.append(f"Accumulated load ({player_load:.0f}) above optimal threshold")
        
        if not factors:
            if risk_level == 'low':
                factors.append("All metrics within safe parameters")
            elif risk_level == 'medium':
                factors.append("Moderate training load detected")
            else:
                factors.append("Multiple metrics elevated")
        
        return factors
    
    def _get_recommendations(self, risk_level: str, features: Dict[str, float]) -> List[str]:
        if risk_level == 'high':
            return [
                "Reduce training intensity by 20-30%",
                "Focus on active recovery and regeneration",
                "Consider rest day or low-intensity session",
                "Monitor for signs of fatigue or discomfort",
                "Increase sleep and nutrition focus"
            ]
        elif risk_level == 'medium':
            return [
                "Maintain current training load with monitoring",
                "Ensure adequate recovery between sessions",
                "Monitor work ratio trends closely",
                "Consider preventive mobility work"
            ]
        else:
            return [
                "Player is in optimal condition",
                "Can maintain or slightly increase training load",
                "Continue monitoring key metrics",
                "Good foundation for high-intensity work"
            ]

    def _extract_feature_importance(self, pipeline: Any, feature_names: List[str]) -> List[Dict[str, Any]]:
        if pipeline is None or not feature_names:
            return []
        model = None
        if hasattr(pipeline, 'named_steps'):
            model = pipeline.named_steps.get('model')
        elif hasattr(pipeline, 'steps') and pipeline.steps:
            model = pipeline.steps[-1][1]
        if model is None or not hasattr(model, 'feature_importances_'):
            return []
        try:
            raw_values = getattr(model, 'feature_importances_')
            pairs = []
            for idx, name in enumerate(feature_names):
                if idx < len(raw_values):
                    pairs.append({
                        'feature': name,
                        'importance': round(float(raw_values[idx]), 4),
                    })
            return sorted(pairs, key=lambda item: item['importance'], reverse=True)
        except Exception:
            return []
    
    def get_model_status(self) -> Dict[str, Any]:
        self._ensure_models_loaded()
        load_status = {
            'trained': self.load_pipeline is not None,
            'algorithm': None,
            'metrics': self.load_metrics,
            'features': len(self.load_features) if self.load_features else 0,
            'diagnostics': self.load_diagnostics,
        }
        
        risk_status = {
            'trained': self.risk_pipeline is not None,
            'algorithm': None,
            'metrics': self.risk_metrics,
            'features': len(self.risk_features) if self.risk_features else 0,
            'diagnostics': self.risk_diagnostics,
        }
        
        if self.load_pipeline is not None:
            try:
                if hasattr(self.load_pipeline, 'named_steps') and 'model' in self.load_pipeline.named_steps:
                    load_status['algorithm'] = type(self.load_pipeline.named_steps['model']).__name__
                elif hasattr(self.load_pipeline, 'steps'):
                    load_status['algorithm'] = type(self.load_pipeline.steps[-1][1]).__name__
            except:
                pass
        
        if self.risk_pipeline is not None:
            try:
                if hasattr(self.risk_pipeline, 'named_steps') and 'model' in self.risk_pipeline.named_steps:
                    risk_status['algorithm'] = type(self.risk_pipeline.named_steps['model']).__name__
                elif hasattr(self.risk_pipeline, 'steps'):
                    risk_status['algorithm'] = type(self.risk_pipeline.steps[-1][1]).__name__
            except:
                pass
        
        return {
            'loadModel': load_status['trained'],
            'riskModel': risk_status['trained'],
            'loadModelDetails': load_status,
            'riskModelDetails': risk_status,
            'availableAlgorithms': self.get_available_algorithms()
        }


ml_service = MLService(load_on_init=False)
