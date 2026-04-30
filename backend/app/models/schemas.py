from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


# Player schemas
class PlayerBase(BaseModel):
    id: str
    name: str
    position: str
    number: int
    riskLevel: RiskLevel
    avgLoad: float
    avgSpeed: float
    sessions: int
    lastSession: Optional[str] = None


class PlayerMetrics(BaseModel):
    playerLoad: float
    distance: float
    sprintDistance: float
    topSpeed: float
    maxAcceleration: float
    maxDeceleration: float
    workRatio: float
    energy: float
    hrLoad: float
    impacts: float
    powerPlays: float


class SessionData(BaseModel):
    date: str
    sessionTitle: str
    playerLoad: float
    distance: float
    duration: float
    avgSpeed: float
    topSpeed: float


class PlayerDetail(PlayerBase):
    metrics: PlayerMetrics
    history: List[SessionData]


# Dashboard schemas
class DashboardKPIs(BaseModel):
    totalPlayers: int
    totalPlayersChange: float
    avgTeamLoad: float
    avgTeamLoadChange: float
    highRiskPlayers: int
    highRiskPlayersChange: float
    avgTeamSpeed: float
    avgTeamSpeedChange: float


class RiskDistribution(BaseModel):
    low: int
    medium: int
    high: int


class LoadHistory(BaseModel):
    date: str
    avgLoad: float
    sessionCount: int


# Analysis schemas
class PredictLoadRequest(BaseModel):
    playerId: str
    features: Optional[Dict[str, float]] = None
    sessionType: Optional[str] = 'match'  # 'match' or 'training'


class LoadPrediction(BaseModel):
    playerId: str
    playerName: str
    predictedLoad: float
    confidence: float
    features: Dict[str, float]


class PredictRiskRequest(BaseModel):
    playerId: str


class RiskPrediction(BaseModel):
    playerId: str
    playerName: str
    riskLevel: RiskLevel
    probability: float
    factors: List[str]
    recommendations: List[str]


class CompareRequest(BaseModel):
    playerIds: List[str]


# Training schemas
class TrainRequest(BaseModel):
    algorithm: str


class ModelMetrics(BaseModel):
    r2Score: float
    mae: float
    rmse: float
    mse: float


class ClassificationMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1Score: float


class TrainingResult(BaseModel):
    modelType: str
    algorithm: str
    metrics: Dict[str, float]
    trainingTime: float
    timestamp: str


class ModelStatus(BaseModel):
    loadModel: bool
    riskModel: bool


# Data schemas
class UploadResult(BaseModel):
    rowCount: int
    columnCount: int
    columns: List[str]
    players: List[str]
    dateRange: Dict[str, str]


class DataStatus(BaseModel):
    loaded: bool
    rowCount: int
    players: List[str]


# API Response wrapper
class ApiResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
