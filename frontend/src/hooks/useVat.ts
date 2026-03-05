import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, VatSummary, VatByFleetEntry, VatByCostCentreEntry, MonthlyVatTrendEntry } from '@/types';

export const vatKeys = {
  all: ['vat'] as const,
  summary: (params?: { dateFrom?: string; dateTo?: string }) => [...vatKeys.all, 'summary', params] as const,
  byFleet: (params?: { dateFrom?: string; dateTo?: string }) => [...vatKeys.all, 'by-fleet', params] as const,
  byCostCentre: (params?: { dateFrom?: string; dateTo?: string }) => [...vatKeys.all, 'by-cost-centre', params] as const,
  trend: (months?: number) => [...vatKeys.all, 'trend', months] as const,
};

interface DateParams {
  dateFrom?: string;
  dateTo?: string;
}

export function useVatSummary(params?: DateParams) {
  return useQuery({
    queryKey: vatKeys.summary(params),
    queryFn: async () => {
      const res = await api.get<ApiResponse<VatSummary>>('/vat/summary', { params });
      return res.data.data;
    },
  });
}

export function useVatByFleet(params?: DateParams) {
  return useQuery({
    queryKey: vatKeys.byFleet(params),
    queryFn: async () => {
      const res = await api.get<ApiResponse<VatByFleetEntry[]>>('/vat/by-fleet', { params });
      return res.data.data;
    },
  });
}

export function useVatByCostCentre(params?: DateParams) {
  return useQuery({
    queryKey: vatKeys.byCostCentre(params),
    queryFn: async () => {
      const res = await api.get<ApiResponse<VatByCostCentreEntry[]>>('/vat/by-cost-centre', { params });
      return res.data.data;
    },
  });
}

export function useVatTrend(months = 12) {
  return useQuery({
    queryKey: vatKeys.trend(months),
    queryFn: async () => {
      const res = await api.get<ApiResponse<MonthlyVatTrendEntry[]>>('/vat/trend', { params: { months } });
      return res.data.data;
    },
  });
}
