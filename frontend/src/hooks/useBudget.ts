import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, BudgetVarianceEntry, BudgetForecast, BudgetAlert, BudgetVarianceTrendEntry } from '@/types';

export const budgetKeys = {
  all: ['budget'] as const,
  fleetVariance: (params?: { dateFrom?: string; dateTo?: string }) => [...budgetKeys.all, 'fleet-variance', params] as const,
  ccVariance: (params?: { dateFrom?: string; dateTo?: string }) => [...budgetKeys.all, 'cost-centre-variance', params] as const,
  trend: (entityType: string, entityId: string, months: number) =>
    [...budgetKeys.all, 'trend', entityType, entityId, months] as const,
  forecast: (entityType: string, entityId: string) =>
    [...budgetKeys.all, 'forecast', entityType, entityId] as const,
  alerts: () => [...budgetKeys.all, 'alerts'] as const,
};

interface DateParams {
  dateFrom?: string;
  dateTo?: string;
}

export function useFleetBudgetVariance(params?: DateParams) {
  return useQuery({
    queryKey: budgetKeys.fleetVariance(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
      if (params?.dateTo) qs.set('dateTo', params.dateTo);
      const query = qs.toString();
      const res = await api.get<ApiResponse<BudgetVarianceEntry[]>>(`/budget/fleet-variance${query ? `?${query}` : ''}`);
      return res.data;
    },
  });
}

export function useCostCentreBudgetVariance(params?: DateParams) {
  return useQuery({
    queryKey: budgetKeys.ccVariance(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
      if (params?.dateTo) qs.set('dateTo', params.dateTo);
      const query = qs.toString();
      const res = await api.get<ApiResponse<BudgetVarianceEntry[]>>(`/budget/cost-centre-variance${query ? `?${query}` : ''}`);
      return res.data;
    },
  });
}

export function useBudgetTrend(entityType: string, entityId: string, months = 6) {
  return useQuery({
    queryKey: budgetKeys.trend(entityType, entityId, months),
    queryFn: async () => {
      const res = await api.get<ApiResponse<BudgetVarianceTrendEntry[]>>(
        `/budget/trend/${entityType}/${entityId}?months=${months}`,
      );
      return res.data;
    },
    enabled: !!entityId,
  });
}

export function useBudgetForecast(entityType: string, entityId: string) {
  return useQuery({
    queryKey: budgetKeys.forecast(entityType, entityId),
    queryFn: async () => {
      const res = await api.get<ApiResponse<BudgetForecast>>(
        `/budget/forecast/${entityType}/${entityId}`,
      );
      return res.data;
    },
    enabled: !!entityId,
  });
}

export function useBudgetAlerts() {
  return useQuery({
    queryKey: budgetKeys.alerts(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<BudgetAlert[]>>('/budget/alerts');
      return res.data;
    },
  });
}
