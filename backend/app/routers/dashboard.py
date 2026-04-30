from fastapi import APIRouter, HTTPException
from ..models.schemas import ApiResponse, DashboardKPIs, RiskDistribution, LoadHistory
from ..services.data_service import data_service
from typing import List

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/kpis", response_model=ApiResponse)
async def get_kpis():
    """Get dashboard KPIs"""
    try:
        kpis = data_service.get_dashboard_kpis()
        return ApiResponse(success=True, data=kpis)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/load-history", response_model=ApiResponse)
async def get_load_history(days: int = 15):
    """Get load history for chart"""
    try:
        history = data_service.get_load_history(days)
        return ApiResponse(success=True, data=history)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk-distribution", response_model=ApiResponse)
async def get_risk_distribution():
    """Get risk distribution"""
    try:
        distribution = data_service.get_risk_distribution()
        return ApiResponse(success=True, data=distribution)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
