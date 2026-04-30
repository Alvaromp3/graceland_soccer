from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from ..models.schemas import ApiResponse
from ..services.data_service import data_service
from ..middleware_config import is_destructive_data_disabled
import os
import pandas as pd
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/data", tags=["Data"])

# Path to sample data
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAMPLE_DATA_PATH = os.path.join(BACKEND_DIR, 'sample_catapult_data.csv')


class CleanDataRequest(BaseModel):
    method: str = 'iqr'  # 'iqr' or 'zscore'
    threshold: float = 3.0  # IQR multiplier (more permissive - only extreme outliers)

class UploadRequest(BaseModel):
    team: str = 'mens'  # 'mens' or 'womens'

class UpdatePositionRequest(BaseModel):
    playerName: str
    position: str
    team: Optional[str] = None


# Max upload size 15 MB
MAX_CSV_SIZE_BYTES = 15 * 1024 * 1024


@router.post("/upload", response_model=ApiResponse)
async def upload_data(file: UploadFile = File(...), team: str = 'mens'):
    """Upload CSV file for a specific team"""
    try:
        logger.info(f"Upload request: team={team}, filename={file.filename or 'none'}")
        if team not in ['mens', 'womens']:
            raise HTTPException(status_code=400, detail="Team must be 'mens' or 'womens'")
        
        if not file.filename or not file.filename.lower().endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are accepted")
        
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        if len(content) > MAX_CSV_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size is {MAX_CSV_SIZE_BYTES // (1024*1024)} MB"
            )
        
        logger.info(f"CSV size: {len(content)} bytes, processing...")
        result = data_service.load_from_upload(content, team)
        logger.info(f"Upload success: {result.get('rowCount', 0)} rows, {len(result.get('players', []))} players")
        return ApiResponse(success=True, data=result)
    except HTTPException:
        raise
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="CSV file is empty or invalid")
    except pd.errors.ParserError as e:
        logger.warning(f"CSV parse error: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid CSV format: {str(e)}")
    except ValueError as e:
        logger.error(f"Upload validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        logger.error(f"Upload error: {str(e)}\n{tb}")
        detail = str(e)
        if len(detail) > 200:
            detail = detail[:200] + "..."
        raise HTTPException(status_code=500, detail=f"Error processing file: {detail}")


@router.post("/load-sample", response_model=ApiResponse)
async def load_sample_data():
    """Load sample Catapult data"""
    try:
        if not os.path.exists(SAMPLE_DATA_PATH):
            raise HTTPException(status_code=404, detail=f"Sample data file not found")
        
        result = data_service.load_csv(SAMPLE_DATA_PATH)
        return ApiResponse(success=True, data=result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=ApiResponse)
async def get_data_status():
    """Get current data status"""
    try:
        return ApiResponse(success=True, data={
            'loaded': data_service.df is not None,
            'rowCount': len(data_service.df) if data_service.df is not None else 0,
            'players': data_service.players if data_service.df is not None else []
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit", response_model=ApiResponse)
async def get_data_audit():
    """Get data quality audit report"""
    try:
        if data_service.df is None:
            raise HTTPException(status_code=400, detail="No data loaded")
        
        audit = data_service.get_data_audit()
        return ApiResponse(success=True, data=audit)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clean-outliers", response_model=ApiResponse)
async def clean_outliers(request: CleanDataRequest):
    """Remove outliers from data using IQR method"""
    try:
        if is_destructive_data_disabled():
            raise HTTPException(
                status_code=403,
                detail="Data cleaning is disabled on this deployment (DISABLE_DESTRUCTIVE_DATA_ENDPOINTS).",
            )
        if data_service.df is None:
            raise HTTPException(status_code=400, detail="No data loaded")
        
        result = data_service.clean_outliers(method=request.method, threshold=request.threshold)
        return ApiResponse(success=True, data=result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset", response_model=ApiResponse)
async def reset_data():
    """Reset data to original (undo cleaning)"""
    try:
        if is_destructive_data_disabled():
            raise HTTPException(
                status_code=403,
                detail="Data reset is disabled on this deployment (DISABLE_DESTRUCTIVE_DATA_ENDPOINTS).",
            )
        if data_service.df is None:
            raise HTTPException(status_code=400, detail="No data loaded")
        
        result = data_service.reset_to_original()
        return ApiResponse(success=True, data=result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update-position", response_model=ApiResponse)
async def update_player_position(request: UpdatePositionRequest):
    """Update player position"""
    try:
        result = data_service.update_player_position(
            player_name=request.playerName,
            position=request.position,
            team=request.team
        )
        return ApiResponse(success=True, data=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating player position: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
