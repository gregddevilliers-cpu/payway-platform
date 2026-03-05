'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Tag,
  TagListParams,
  TagSummary,
  TagHistoryEntry,
  ApiResponse,
  BlockedReason,
} from '@/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const tagKeys = {
  all: ['tags'] as const,
  lists: () => [...tagKeys.all, 'list'] as const,
  list: (params: TagListParams) => [...tagKeys.lists(), params] as const,
  detail: (id: string) => [...tagKeys.all, 'detail', id] as const,
  history: (id: string) => [...tagKeys.all, 'history', id] as const,
  summary: () => [...tagKeys.all, 'summary'] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useTagSummary() {
  return useQuery({
    queryKey: tagKeys.summary(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<TagSummary>>('/tags/summary');
      return res.data;
    },
  });
}

export function useTags(params: TagListParams = {}) {
  return useQuery({
    queryKey: tagKeys.list(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.status) qs.set('status', params.status);
      if (params.vehicleId) qs.set('vehicleId', params.vehicleId);
      if (params.search) qs.set('search', params.search);
      if (params.page) qs.set('page', String(params.page));
      if (params.limit) qs.set('limit', String(params.limit));
      const query = qs.toString();
      const res = await api.get<ApiResponse<Tag[]>>(`/tags${query ? `?${query}` : ''}`);
      return res;
    },
  });
}

export function useTag(id: string) {
  return useQuery({
    queryKey: tagKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<ApiResponse<Tag>>(`/tags/${id}`);
      return res.data;
    },
    enabled: Boolean(id),
  });
}

export function useTagHistory(tagId: string) {
  return useQuery({
    queryKey: tagKeys.history(tagId),
    queryFn: async () => {
      const res = await api.get<ApiResponse<TagHistoryEntry[]>>(`/tags/${tagId}/history`);
      return res.data;
    },
    enabled: Boolean(tagId),
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { tagNumber: string; expiryDate?: string; notes?: string }) =>
      api.post<ApiResponse<Tag>>('/tags', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useUpdateTag(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { notes?: string; expiryDate?: string }) =>
      api.patch<ApiResponse<Tag>>(`/tags/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tagKeys.detail(id) });
      qc.invalidateQueries({ queryKey: tagKeys.lists() });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useAssignTag(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: string) =>
      api.post<ApiResponse<Tag>>(`/tags/${id}/assign`, { vehicleId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useUnassignTag(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      api.post<ApiResponse<Tag>>(`/tags/${id}/unassign`, { reason }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useBlockTag(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: BlockedReason) =>
      api.post<ApiResponse<Tag>>(`/tags/${id}/block`, { reason }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useUnblockTag(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<ApiResponse<Tag>>(`/tags/${id}/unblock`, {}).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useReportLost(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<ApiResponse<Tag>>(`/tags/${id}/report-lost`, {}).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useReplaceTag(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (newTagId: string) =>
      api.post<ApiResponse<{ oldTagId: string; newTagId: string; vehicleId: string | null }>>(
        `/tags/${id}/replace`,
        { newTagId },
      ).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useTransferTag(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toVehicleId: string) =>
      api.post<ApiResponse<Tag>>(`/tags/${id}/transfer`, { toVehicleId }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useDecommissionTag(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<ApiResponse<Tag>>(`/tags/${id}/decommission`, {}).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}

export function useBulkTagAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      ids: string[];
      action: 'block' | 'decommission';
      params?: { reason?: string };
    }) =>
      api
        .post<ApiResponse<{ processed: number; failed: number; errors: unknown[] }>>(
          '/tags/bulk-action',
          payload,
        )
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tagKeys.all }),
  });
}
