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
      const qs = new URLSearchParams();
      if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
      if (params?.dateTo) qs.set('dateTo', params.dateTo);
      const query = qs.toString();
      const res = await api.get<ApiResponse<VatSummary>>(`/vat/summary${query ? `?${query}` : ''}`);
      return res.data;
    },
  });
}

export function useVatByFleet(params?: DateParams) {
  return useQuery({
    queryKey: vatKeys.byFleet(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
      if (params?.dateTo) qs.set('dateTo', params.dateTo);
      const query = qs.toString();
      const res = await api.get<ApiResponse<VatByFleetEntry[]>>(`/vat/by-fleet${query ? `?${query}` : ''}`);
      return res.data;
    },
  });
}

export function useVatByCostCentre(params?: DateParams) {
  return useQuery({
    queryKey: vatKeys.byCostCentre(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
      if (params?.dateTo) qs.set('dateTo', params.dateTo);
      const query = qs.toString();
      const res = await api.get<ApiResponse<VatByCostCentreEntry[]>>(`/vat/by-cost-centre${query ? `?${query}` : ''}`);
      return res.data;
    },
  });
}

export function useVatTrend(months = 12) {
  return useQuery({
    queryKey: vatKeys.trend(months),
    queryFn: async () => {
      const res = await api.get<ApiResponse<MonthlyVatTrendEntry[]>>(`/vat/trend?months=${months}`);
      return res.data;
    },
  });
}
