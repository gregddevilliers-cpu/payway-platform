import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, CostCentre, SpendByCostCentre } from '@/types';

export const ccKeys = {
  all: ['cost-centres'] as const,
  list: (params?: Record<string, unknown>) => [...ccKeys.all, 'list', params] as const,
  detail: (id: string) => [...ccKeys.all, 'detail', id] as const,
  spendSummary: (params?: { dateFrom?: string; dateTo?: string }) => [...ccKeys.all, 'spend-summary', params] as const,
  transactions: (id: string, params?: Record<string, unknown>) => [...ccKeys.all, 'transactions', id, params] as const,
};

export function useCostCentres(params?: { format?: 'tree'; isActive?: boolean }) {
  return useQuery({
    queryKey: ccKeys.list(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.format) qs.set('format', params.format);
      if (params?.isActive !== undefined) qs.set('isActive', String(params.isActive));
      const query = qs.toString();
      const res = await api.get<ApiResponse<CostCentre[]>>(`/cost-centres${query ? `?${query}` : ''}`);
      return res;
    },
  });
}

export function useCostCentre(id: string, dateParams?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ccKeys.detail(id),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (dateParams?.dateFrom) qs.set('dateFrom', dateParams.dateFrom);
      if (dateParams?.dateTo) qs.set('dateTo', dateParams.dateTo);
      const query = qs.toString();
      const res = await api.get<ApiResponse<CostCentre>>(`/cost-centres/${id}${query ? `?${query}` : ''}`);
      return res;
    },
    enabled: !!id,
  });
}

export function useSpendSummary(params?: { dateFrom?: string; dateTo?: string }) {
  return useQuery({
    queryKey: ccKeys.spendSummary(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
      if (params?.dateTo) qs.set('dateTo', params.dateTo);
      const query = qs.toString();
      const res = await api.get<ApiResponse<SpendByCostCentre[]>>(`/cost-centres/spend-summary${query ? `?${query}` : ''}`);
      return res;
    },
  });
}

export function useCostCentreTransactions(
  id: string,
  params?: { page?: number; limit?: number },
) {
  return useQuery({
    queryKey: ccKeys.transactions(id, params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString();
      const res = await api.get<ApiResponse<unknown[]>>(`/cost-centres/${id}/transactions${query ? `?${query}` : ''}`);
      return res;
    },
    enabled: !!id,
  });
}

export function useCreateCostCentre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      code: string;
      description?: string;
      budget?: number;
      budgetPeriod?: string;
      parentId?: string;
    }) => {
      const res = await api.post<ApiResponse<CostCentre>>('/cost-centres', data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ccKeys.all }),
  });
}

export function useUpdateCostCentre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: unknown }) => {
      const res = await api.patch<ApiResponse<CostCentre>>(`/cost-centres/${id}`, data);
      return res.data;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ccKeys.all });
      qc.invalidateQueries({ queryKey: ccKeys.detail(id) });
    },
  });
}

export function useDeleteCostCentre() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cost-centres/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ccKeys.all }),
  });
}
