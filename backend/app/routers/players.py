from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from ..models.schemas import ApiResponse
from ..services.data_service import data_service

router = APIRouter(prefix="/players", tags=["Players"])


class ExcludePlayerRequest(BaseModel):
    playerName: str


@router.get("", response_model=ApiResponse)
async def get_all_players():
    """Get all active players (excluding removed ones)"""
    try:
        players = data_service.get_all_players()
        return ApiResponse(success=True, data=players)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/excluded", response_model=ApiResponse)
async def get_excluded_players():
    """Get list of excluded player names"""
    try:
        excluded = list(data_service.excluded_players)
        return ApiResponse(success=True, data=excluded)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/exclude", response_model=ApiResponse)
async def exclude_player(request: ExcludePlayerRequest):
    """Exclude a player from analysis"""
    try:
        success = data_service.exclude_player(request.playerName)
        if not success:
            raise HTTPException(status_code=404, detail="Player not found")
        return ApiResponse(success=True, data={"message": f"Player '{request.playerName}' excluded", "playerName": request.playerName})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore", response_model=ApiResponse)
async def restore_player(request: ExcludePlayerRequest):
    """Restore an excluded player"""
    try:
        success = data_service.restore_player(request.playerName)
        if not success:
            raise HTTPException(status_code=404, detail="Player not in excluded list")
        return ApiResponse(success=True, data={"message": f"Player '{request.playerName}' restored", "playerName": request.playerName})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/high-risk", response_model=ApiResponse)
async def get_high_risk_players():
    """Get players with high risk"""
    try:
        players = data_service.get_high_risk_players()
        return ApiResponse(success=True, data=players)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/top-performers", response_model=ApiResponse)
async def get_top_performers(limit: int = 5):
    """Get top performing players"""
    try:
        players = data_service.get_top_performers(limit)
        return ApiResponse(success=True, data=players)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rankings/{metric}", response_model=ApiResponse)
async def get_player_rankings(metric: str):
    """Get player rankings by metric
    
    Available metrics:
    - player_load: Average player load
    - total_distance: Total distance covered
    - distance: Average distance per session
    - sprint_distance: Average sprint distance
    - total_sprints: Total sprint distance
    - top_speed: Average top speed
    - max_speed: Maximum speed reached
    - work_ratio: Average work ratio (intensity)
    - max_intensity: Maximum intensity
    - energy: Average energy
    - total_energy: Total energy
    - power_score: Average power score
    - max_power: Maximum power
    - max_acceleration: Maximum acceleration
    - max_deceleration: Maximum deceleration
    - distance_per_min: Distance per minute
    - impacts: Average impacts
    - total_impacts: Total impacts
    """
    try:
        rankings = data_service.get_player_rankings(metric)
        return ApiResponse(success=True, data=rankings)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/detail/{player_id}", response_model=ApiResponse)
async def get_player_detail(player_id: str):
    """Get detailed player information"""
    try:
        player = data_service.get_player_detail(player_id)
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        return ApiResponse(success=True, data=player)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{player_id}", response_model=ApiResponse)
async def delete_player(player_id: str):
    """Delete a player permanently from the dataset"""
    try:
        success = data_service.delete_player_data(player_id)
        if not success:
            raise HTTPException(status_code=404, detail="Player not found or could not be deleted")
        return ApiResponse(success=True, data={"message": "Player deleted successfully", "playerId": player_id})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
