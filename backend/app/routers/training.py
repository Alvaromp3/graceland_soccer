from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from ..models.schemas import ApiResponse, TrainRequest, ModelStatus
from ..services.ml_service import ml_service
from ..services.data_service import data_service
from ..middleware_config import is_training_disabled

router = APIRouter(prefix="/training", tags=["Training"])


def _ensure_training_allowed():
    if is_training_disabled():
        raise HTTPException(
            status_code=403,
            detail="Model training is disabled on this deployment (DISABLE_MODEL_TRAINING).",
        )


class PredictLoadRequest(BaseModel):
    playerId: str
    sessionType: str  # 'match' or 'training'
    features: Dict[str, Any]


@router.post("/train-load", response_model=ApiResponse)
async def train_load_model(request: TrainRequest):
    """Train load prediction model"""
    _ensure_training_allowed()
    try:
        df, feature_cols = data_service.get_data_for_training()
        if df.empty:
            raise HTTPException(status_code=400, detail="No data loaded. Please upload data first.")
        
        result = ml_service.train_load_model(df, feature_cols, request.algorithm)
        return ApiResponse(success=True, data=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train-risk", response_model=ApiResponse)
async def train_risk_model(request: TrainRequest):
    """Train risk prediction model"""
    _ensure_training_allowed()
    try:
        df, feature_cols = data_service.get_data_for_training()
        if df.empty:
            raise HTTPException(status_code=400, detail="No data loaded. Please upload data first.")
        
        result = ml_service.train_risk_model(df, feature_cols, request.algorithm)
        return ApiResponse(success=True, data=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=ApiResponse)
async def get_model_status():
    """Get model training status"""
    try:
        status = ml_service.get_model_status()
        return ApiResponse(success=True, data=status)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict-load", response_model=ApiResponse)
async def predict_load(request: PredictLoadRequest):
    """Predict player load for next session"""
    try:
        result = ml_service.predict_load(request.features, request.sessionType)
        return ApiResponse(success=True, data=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
