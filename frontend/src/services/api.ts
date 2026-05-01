import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import type {
  DashboardKPIs,
  RiskDistribution,
  LoadHistory,
  Player,
  PlayerDetail,
  LoadPrediction,
  RiskPrediction,
  TrainingResult,
  UploadResult,
  ApiResponse,
  AnalyticsOverview,
  TeamComparisonData,
} from '../types';

export type RankingRow = {
  name: string;
  rank: number;
  metrics: Record<string, number>;
};

export type AIRecommendationBundle = {
  playerId: string;
  playerName: string;
  aiRecommendations: string;
  aiSource?: string;
  aiSuccess: boolean;
  aiError?: string;
  // Risk payload returned by the backend
  riskLevel: 'low' | 'medium' | 'high';
  probability?: number;
  factors?: string[];
  recommendations?: string[];
  hasRecentData?: boolean;
  recentSessionCount?: number;
};

export type OpenRouterStatus = {
  status: 'ready' | 'not_configured' | 'error' | string;
  message?: string;
  defaultModel?: string;
};

export type TeamAverageResponse = {
  riskLevel?: 'low' | 'medium' | 'high';
  avgLoad?: number;
  avgSpeed?: number;
  sessions?: number;
  hasRecentData?: boolean;
  recentSessionCount?: number;
  teamStats?: {
    totalPlayers: number;
    riskDistribution: { low: number; medium: number; high: number };
  };
};

export type DataAuditOutlier = { count: number; percentage: number };
export type DataAuditColumnStats = { mean: number; std: number; min: number; max: number };

export type DataAuditReport = {
  dataQualityScore?: number;
  totalRows?: number;
  totalPlayers?: number;
  outliers?: Record<string, DataAuditOutlier>;
  beforeAfterCleaning?: Array<Record<string, unknown>>;
  warnings?: string[];
  recommendations?: string[];
  isCleaned?: boolean;
  columnStats?: Record<string, DataAuditColumnStats>;
};

function sanitizeApiBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v) return null;
  // Only allow http(s) absolute URLs to avoid weird schemes in build-time env.
  if (!/^https?:\/\//i.test(v)) return null;
  try {
    const u = new URL(v);
    return u.origin;
  } catch {
    return null;
  }
}

/** Production: set to backend origin only, e.g. https://graceland-backend.onrender.com (no trailing slash). */
const API_BASE_URL = sanitizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const API_BASE = API_BASE_URL ? `${API_BASE_URL}/api` : '/api';

const api = axios.create({
  baseURL: API_BASE,
  // Keep bounded so a dead/slow backend does not block the whole UI for minutes.
  // Long operations (coach report) override per-request.
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const viteApiKey =
  typeof import.meta.env.VITE_API_KEY === 'string' ? import.meta.env.VITE_API_KEY.trim() : '';
if (viteApiKey) {
  api.defaults.headers.common['X-API-Key'] = viteApiKey;
}

// Normalize API errors into a short useful message for the UI.
api.interceptors.response.use(
  (r) => r,
  (err: unknown) => {
    const ax = err as { response?: { data?: unknown; status?: number }; message?: string };
    const detail = (ax.response?.data as { detail?: unknown } | undefined)?.detail;
    const msg =
      Array.isArray(detail)
        ? String(detail[0] ?? 'Request failed')
        : typeof detail === 'string'
          ? detail
          : ax.message || 'Request failed';
    const status = ax.response?.status;
    const cleaned = String(msg).replace(/\s+/g, ' ').trim().slice(0, 280);
    const e = new Error(status ? `${cleaned} (HTTP ${status})` : cleaned);
    throw e;
  },
);

// Dashboard endpoints
export const dashboardApi = {
  getKPIs: async (): Promise<DashboardKPIs> => {
    const { data } = await api.get<ApiResponse<DashboardKPIs>>('/dashboard/kpis');
    return data.data!;
  },

  getLoadHistory: async (days: number = 15): Promise<LoadHistory[]> => {
    const { data } = await api.get<ApiResponse<LoadHistory[]>>(`/dashboard/load-history?days=${days}`);
    return data.data!;
  },

  getRiskDistribution: async (): Promise<RiskDistribution> => {
    const { data } = await api.get<ApiResponse<RiskDistribution>>('/dashboard/risk-distribution');
    return data.data!;
  },
};

// Players endpoints
export const playersApi = {
  getAll: async (): Promise<Player[]> => {
    const { data } = await api.get<ApiResponse<Player[]>>('/players');
    return data.data!;
  },

  getById: async (id: string): Promise<PlayerDetail> => {
    const { data } = await api.get<ApiResponse<PlayerDetail>>(`/players/detail/${id}`);
    return data.data!;
  },

  getHighRisk: async (): Promise<Player[]> => {
    const { data } = await api.get<ApiResponse<Player[]>>('/players/high-risk');
    return data.data!;
  },

  getTopPerformers: async (limit: number = 5): Promise<Player[]> => {
    const { data } = await api.get<ApiResponse<Player[]>>(`/players/top-performers?limit=${limit}`);
    return data.data!;
  },

  getDetail: async (playerId: string): Promise<PlayerDetail> => {
    const { data } = await api.get<ApiResponse<PlayerDetail>>(`/players/detail/${playerId}`);
    return data.data!;
  },

  getExcluded: async (): Promise<string[]> => {
    const { data } = await api.get<ApiResponse<string[]>>('/players/excluded');
    return data.data!;
  },

  excludePlayer: async (playerName: string): Promise<{ message: string; playerName: string }> => {
    const { data } = await api.post<ApiResponse<{ message: string; playerName: string }>>('/players/exclude', { playerName });
    return data.data!;
  },

  restorePlayer: async (playerName: string): Promise<{ message: string; playerName: string }> => {
    const { data } = await api.post<ApiResponse<{ message: string; playerName: string }>>('/players/restore', { playerName });
    return data.data!;
  },

  deletePlayer: async (playerId: string): Promise<{ message: string; playerId: string }> => {
    const { data } = await api.delete<ApiResponse<{ message: string; playerId: string }>>(`/players/${playerId}`);
    return data.data!;
  },

  getRankings: async (metric: string): Promise<RankingRow[]> => {
    const { data } = await api.get<ApiResponse<RankingRow[]>>(`/players/rankings/${metric}`);
    return data.data!;
  },

  updatePosition: async (playerName: string, position: string, team?: string): Promise<{ message: string; playerName: string; position: string }> => {
    const { data } = await api.post<ApiResponse<{ message: string; playerName: string; position: string }>>('/data/update-position', {
      playerName,
      position,
      team,
    });
    return data.data!;
  },
};

// Analysis endpoints
export const analysisApi = {
  predictLoad: async (params: { playerId: string; features: Record<string, number>; sessionType?: string }): Promise<LoadPrediction & { predictedLoad: number; confidence?: number; method?: string; sessionType?: string }> => {
    const { data } = await api.post<ApiResponse<LoadPrediction & { predictedLoad: number; confidence?: number; method?: string; sessionType?: string }>>('/analysis/predict-load', {
      playerId: params.playerId,
      features: params.features,
      sessionType: params.sessionType ?? 'match',
    });
    return data.data!;
  },

  predictRisk: async (playerId: string): Promise<RiskPrediction> => {
    const { data } = await api.post<ApiResponse<RiskPrediction>>('/analysis/predict-risk', {
      playerId,
    });
    return data.data!;
  },

  comparePlayersLoad: async (playerIds: string[]): Promise<LoadPrediction[]> => {
    const { data } = await api.post<ApiResponse<LoadPrediction[]>>('/analysis/compare', {
      playerIds,
    });
    return data.data!;
  },

  getOllamaStatus: async (): Promise<unknown> => {
    const { data } = await api.get<ApiResponse<unknown>>('/analysis/ollama-status');
    return data.data!;
  },

  getOpenRouterStatus: async (): Promise<OpenRouterStatus> => {
    const { data } = await api.get<ApiResponse<OpenRouterStatus>>('/analysis/openrouter-status');
    return data.data!;
  },

  getAIRecommendations: async (playerId: string): Promise<AIRecommendationBundle> => {
    // LLM generation can be slow on cold starts; keep a higher per-request timeout here.
    const { data } = await api.post<ApiResponse<AIRecommendationBundle>>(
      '/analysis/ai-recommendations',
      { playerId },
      { timeout: 120000 }
    );
    return data.data!;
  },

  getTeamAverage: async (): Promise<TeamAverageResponse> => {
    const { data } = await api.get<ApiResponse<TeamAverageResponse>>('/analysis/team-average');
    return data.data!;
  },

  getAnalytics: async (playerId?: string): Promise<AnalyticsOverview> => {
    const suffix = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
    const { data } = await api.get<ApiResponse<AnalyticsOverview>>(`/analysis/analytics${suffix}`);
    return data.data!;
  },

  getTeamComparison: async (): Promise<TeamComparisonData> => {
    const { data } = await api.get<ApiResponse<TeamComparisonData>>('/analysis/team-comparison');
    return data.data!;
  },
};

// Training endpoints
export const trainingApi = {
  trainLoadModel: async (algorithm: string): Promise<TrainingResult> => {
    const { data } = await api.post<ApiResponse<TrainingResult>>('/training/train-load', {
      algorithm,
    });
    return data.data!;
  },

  trainRiskModel: async (algorithm: string): Promise<TrainingResult> => {
    const { data } = await api.post<ApiResponse<TrainingResult>>('/training/train-risk', {
      algorithm,
    });
    return data.data!;
  },

  getModelStatus: async (): Promise<unknown> => {
    const { data } = await api.get<ApiResponse<unknown>>('/training/status');
    return data.data!;
  },

  predictLoad: async (params: { playerId: string; sessionType: string; features: Record<string, number> }): Promise<unknown> => {
    const { data } = await api.post<ApiResponse<unknown>>('/training/predict-load', params);
    return data.data!;
  },
};

// Data endpoints
export const dataApi = {
  upload: async (file: File, team: string = 'mens'): Promise<UploadResult> => {
    const MAX_SIZE_MB = 15;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      throw new Error(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const { data } = await api.post<ApiResponse<UploadResult>>(`/data/upload?team=${team}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        // Upload + pandas parse on a cold Render instance can exceed the default 45s axios timeout.
        timeout: 180000,
      });
      return data.data!;
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string | string[] } }; message?: string };
      const detail = ax.response?.data?.detail;
      const message = Array.isArray(detail) ? detail[0] : typeof detail === 'string' ? detail : ax.message || 'Upload failed';
      throw new Error(message);
    }
  },

  getStatus: async (): Promise<{ loaded: boolean; rowCount: number; players: string[] }> => {
    const { data } = await api.get<ApiResponse<{ loaded: boolean; rowCount: number; players: string[] }>>('/data/status');
    return data.data!;
  },

  loadSample: async (): Promise<UploadResult> => {
    const { data } = await api.post<ApiResponse<UploadResult>>('/data/load-sample', undefined, {
      timeout: 180000,
    });
    return data.data!;
  },

  getAudit: async (): Promise<DataAuditReport> => {
    const { data } = await api.get<ApiResponse<DataAuditReport>>('/data/audit');
    return data.data!;
  },

  cleanOutliers: async (method: string = 'iqr', threshold: number = 1.5): Promise<{ success: boolean; message?: string; stats?: Record<string, unknown> }> => {
    const { data } = await api.post<ApiResponse<{ success: boolean; message?: string; stats?: Record<string, unknown> }>>('/data/clean-outliers', { method, threshold });
    return data.data!;
  },

  resetData: async (): Promise<{ success: boolean; message?: string }> => {
    const { data } = await api.post<ApiResponse<{ success: boolean; message?: string }>>('/data/reset');
    return data.data!;
  },
};

// Settings endpoints
export const settingsApi = {
  getDateReference: async (): Promise<{ useTodayAsReference: boolean; description: string }> => {
    const { data } = await api.get<ApiResponse<{ useTodayAsReference: boolean; description: string }>>('/settings/date-reference');
    return data.data!;
  },

  setDateReference: async (useTodayAsReference: boolean): Promise<{ success: boolean; message?: string }> => {
    const { data } = await api.post<ApiResponse<{ success: boolean; message?: string }>>('/settings/date-reference', { useTodayAsReference });
    return data.data!;
  },

  getTeamStatus: async (): Promise<unknown> => {
    const { data } = await api.get<ApiResponse<unknown>>('/settings/team-status');
    return data.data!;
  },

  switchTeam: async (team: string): Promise<{ success: boolean; message?: string }> => {
    const { data } = await api.post<ApiResponse<{ success: boolean; message?: string }>>('/settings/switch-team', { team });
    return data.data!;
  },
};

// React Query hooks for data status
export const useDataStatus = () => {
  return useQuery({
    queryKey: ['data', 'status'],
    queryFn: dataApi.getStatus,
  });
};

export default api;
