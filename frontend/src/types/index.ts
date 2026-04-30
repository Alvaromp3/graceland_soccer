// Player types
export interface Player {
  id: string;
  name: string;
  position: string;
  number: number;
  riskLevel: 'low' | 'medium' | 'high';
  avgLoad: number;
  avgSpeed: number;
  sessions: number;
  lastSession?: string;
  hasRecentData?: boolean;
  recentSessions?: number;
}

export interface PlayerDetail extends Player {
  metrics: PlayerMetrics;
  history: SessionData[];
}

export interface PlayerMetrics {
  playerLoad: number;
  distance: number;
  sprintDistance: number;
  topSpeed: number;
  maxAcceleration: number;
  maxDeceleration: number;
  workRatio: number;
  energy: number;
  hrLoad: number;
  impacts: number;
  powerPlays: number;
}

// Session and load data
export interface SessionData {
  date: string;
  sessionTitle: string;
  playerLoad: number;
  distance: number;
  duration: number;
  avgSpeed: number;
  topSpeed: number;
}

export interface LoadHistory {
  date: string;
  avgLoad: number;
  sessionCount: number;
}

// Dashboard KPIs
export interface DashboardKPIs {
  totalPlayers: number;
  totalPlayersChange: number;
  avgTeamLoad: number;
  avgTeamLoadChange: number;
  highRiskPlayers: number;
  highRiskPlayersChange: number;
  avgTeamSpeed: number;
  avgTeamSpeedChange: number;
}

export interface RiskDistribution {
  low: number;
  medium: number;
  high: number;
}

// Analysis and predictions
export interface LoadPrediction {
  playerId: string;
  playerName: string;
  predictedLoad: number;
  confidence: number;
  features: Record<string, number>;
}

export interface RiskPrediction {
  playerId: string;
  playerName: string;
  riskLevel: 'low' | 'medium' | 'high';
  probability: number;
  factors: string[];
  recommendations: string[];
  hasRecentData?: boolean;
  recentSessionCount?: number;
}

// Training
export interface ModelMetrics {
  r2Score: number;
  mae: number;
  rmse: number;
  mse: number;
}

export interface ClassificationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface TrainingResult {
  modelType: 'regression' | 'classification';
  algorithm: string;
  metrics: Record<string, number>;
  trainingTime: number;
  timestamp: string;
}

// API responses
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Data upload
export interface UploadResult {
  rowCount: number;
  columnCount: number;
  columns: string[];
  players: string[];
  dateRange: {
    start: string;
    end: string;
  };
}

export interface RollingLoadPoint {
  date: string;
  load: number;
  rolling7: number;
  rolling14: number;
  rolling28: number;
  upperBand: number;
  lowerBand: number;
}

export interface AnalyticsOverview {
  playerScope?: string | null;
  rollingLoad: RollingLoadPoint[];
  acwr: Array<{ date: string; acuteChronicRatio: number; acuteLoad: number; chronicLoad: number }>;
  sessionSplit: Array<{ sessionType: string; avgLoad: number; avgTopSpeed: number; avgSprintDistance: number; avgEnergy: number; sessions: number }>;
  positionComparison: Array<{ positionGroup: string; avgLoad: number; avgTopSpeed: number; avgSprintDistance: number; avgWorkRatio: number; players: number }>;
  percentiles: Array<{ playerId: string; playerName: string; loadPercentile: number; speedPercentile: number; sessionPercentile: number; riskLevel: 'low' | 'medium' | 'high' }>;
  variability: Array<{ playerId: string; playerName: string; meanLoad: number; stdLoad: number; coefficientOfVariation: number; riskLevel: 'low' | 'medium' | 'high' }>;
  correlations: Array<{ x: string; y: string; value: number }>;
  scatterLoadWorkRatio: Array<{ playerName: string; playerLoad: number; workRatio: number; riskLevel: 'low' | 'medium' | 'high'; date?: string | null }>;
  scatterSprintSpeed: Array<{ playerName: string; sprintDistance: number; topSpeed: number; energy: number; riskLevel: 'low' | 'medium' | 'high' }>;
  outlierTimeline: Array<{ date: string; playerName: string; playerLoad: number; sessionTitle: string }>;
  trainingDensity: Array<{ date: string; sessions: number }>;
}

export interface TeamComparisonData {
  teams: Record<string, {
    loaded: boolean;
    players?: Player[];
    kpis?: DashboardKPIs | null;
    topPerformers?: Player[];
  }>;
  metrics: Array<{ key: string; label: string; mensValue: number; womensValue: number; difference: number }>;
}
