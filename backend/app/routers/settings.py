from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..models.schemas import ApiResponse
from ..services.data_service import data_service

router = APIRouter(prefix="/settings", tags=["Settings"])


class DateReferenceRequest(BaseModel):
    useTodayAsReference: bool

class TeamSwitchRequest(BaseModel):
    team: str  # 'mens' or 'womens'


@router.get("/date-reference", response_model=ApiResponse)
async def get_date_reference_setting():
    """Get current date reference setting"""
    try:
        setting = data_service.get_date_reference_setting()
        return ApiResponse(success=True, data=setting)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/date-reference", response_model=ApiResponse)
async def set_date_reference_setting(request: DateReferenceRequest):
    """Set date reference setting"""
    try:
        result = data_service.set_date_reference_setting(request.useTodayAsReference)
        return ApiResponse(success=True, data=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team-status", response_model=ApiResponse)
async def get_team_status():
    """Get status of both teams"""
    try:
        status = data_service.get_team_status()
        return ApiResponse(success=True, data=status)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error getting team status: {e}", exc_info=True)
        # Return default structure on error instead of raising
        return ApiResponse(success=True, data={
            'currentTeam': 'mens',
            'mens': { 'loaded': False, 'rowCount': 0 },
            'womens': { 'loaded': False, 'rowCount': 0 }
        })


@router.post("/switch-team", response_model=ApiResponse)
async def switch_team(request: TeamSwitchRequest):
    """Switch between men's and women's team"""
    try:
        if request.team not in ['mens', 'womens']:
            raise HTTPException(status_code=400, detail="Team must be 'mens' or 'womens'")
        result = data_service.switch_team(request.team)
        return ApiResponse(success=True, data=result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
