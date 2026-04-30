import { useQuery } from '@tanstack/react-query';
import { dashboardApi, playersApi, dataApi } from '../services/api';

export function useDashboardKPIs() {
  return useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: dashboardApi.getKPIs,
  });
}

export function useLoadHistory(days: number = 15) {
  return useQuery({
    queryKey: ['dashboard', 'loadHistory', days],
    queryFn: () => dashboardApi.getLoadHistory(days),
  });
}

export function useRiskDistribution() {
  return useQuery({
    queryKey: ['dashboard', 'riskDistribution'],
    queryFn: dashboardApi.getRiskDistribution,
  });
}

export function useHighRiskPlayers() {
  return useQuery({
    queryKey: ['players', 'highRisk'],
    queryFn: playersApi.getHighRisk,
  });
}

export function useTopPerformers(limit: number = 5) {
  return useQuery({
    queryKey: ['players', 'topPerformers', limit],
    queryFn: () => playersApi.getTopPerformers(limit),
  });
}

export function useDataStatus() {
  return useQuery({
    queryKey: ['data', 'status'],
    queryFn: dataApi.getStatus,
  });
}
