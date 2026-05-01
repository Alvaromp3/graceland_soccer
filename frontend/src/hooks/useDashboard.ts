import { useQuery } from '@tanstack/react-query';
import { dashboardApi, playersApi, dataApi } from '../services/api';

const dashboardStale = 45_000;

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: dashboardApi.getKPIs,
    staleTime: dashboardStale,
  });
}

export function useLoadHistory(days: number = 15) {
  return useQuery({
    queryKey: ['dashboard', 'loadHistory', days],
    queryFn: () => dashboardApi.getLoadHistory(days),
    staleTime: dashboardStale,
  });
}

export function useRiskDistribution() {
  return useQuery({
    queryKey: ['dashboard', 'riskDistribution'],
    queryFn: dashboardApi.getRiskDistribution,
    staleTime: dashboardStale,
  });
}

export function useHighRiskPlayers() {
  return useQuery({
    queryKey: ['players', 'highRisk'],
    queryFn: playersApi.getHighRisk,
    staleTime: dashboardStale,
  });
}

export function useTopPerformers(limit: number = 5) {
  return useQuery({
    queryKey: ['players', 'topPerformers', limit],
    queryFn: () => playersApi.getTopPerformers(limit),
    staleTime: dashboardStale,
  });
}

export function useDataStatus() {
  return useQuery({
    queryKey: ['data', 'status'],
    queryFn: dataApi.getStatus,
    staleTime: 30_000,
  });
}
