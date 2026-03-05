import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, VehicleContract, ContractPayment, ContractSummary, ContractListParams } from '@/types';

export const contractKeys = {
  all: ['contracts'] as const,
  list: (params?: ContractListParams) => [...contractKeys.all, 'list', params] as const,
  detail: (id: string) => [...contractKeys.all, 'detail', id] as const,
  payments: (id: string) => [...contractKeys.all, 'payments', id] as const,
  expiring: (days?: number) => [...contractKeys.all, 'expiring', days] as const,
  renewalsDue: () => [...contractKeys.all, 'renewals-due'] as const,
  summary: () => [...contractKeys.all, 'summary'] as const,
};

export function useContracts(params?: ContractListParams) {
  return useQuery({
    queryKey: contractKeys.list(params),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params?.vehicleId) qs.set('vehicleId', params.vehicleId);
      if (params?.contractType) qs.set('contractType', params.contractType);
      if (params?.status) qs.set('status', params.status);
      if (params?.provider) qs.set('provider', params.provider);
      if (params?.expiringDays) qs.set('expiringDays', String(params.expiringDays));
      if (params?.page) qs.set('page', String(params.page));
      if (params?.limit) qs.set('limit', String(params.limit));
      const query = qs.toString();
      const res = await api.get<ApiResponse<VehicleContract[]>>(`/contracts${query ? `?${query}` : ''}`);
      return res;
    },
  });
}

export function useContract(id: string) {
  return useQuery({
    queryKey: contractKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<ApiResponse<VehicleContract>>(`/contracts/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useContractPayments(contractId: string) {
  return useQuery({
    queryKey: contractKeys.payments(contractId),
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ContractPayment[]; meta: { totalPaid: number } }>(
        `/contracts/${contractId}/payments`,
      );
      return res;
    },
    enabled: !!contractId,
  });
}

export function useExpiringContracts(days = 30) {
  return useQuery({
    queryKey: contractKeys.expiring(days),
    queryFn: async () => {
      const res = await api.get<ApiResponse<VehicleContract[]>>(`/contracts/expiring?days=${days}`);
      return res.data;
    },
  });
}

export function useContractSummary() {
  return useQuery({
    queryKey: contractKeys.summary(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<ContractSummary>>('/contracts/summary');
      return res.data;
    },
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<VehicleContract>) => {
      const res = await api.post<ApiResponse<VehicleContract>>('/contracts', data);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contractKeys.all }),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<VehicleContract>) => {
      const res = await api.patch<ApiResponse<VehicleContract>>(`/contracts/${id}`, data);
      return res.data;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: contractKeys.all });
      qc.invalidateQueries({ queryKey: contractKeys.detail(id) });
    },
  });
}

export function useTerminateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, terminationReason }: { id: string; terminationReason: string }) => {
      const res = await api.post<ApiResponse<VehicleContract>>(`/contracts/${id}/terminate`, { terminationReason });
      return res.data;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: contractKeys.all });
      qc.invalidateQueries({ queryKey: contractKeys.detail(id) });
    },
  });
}

export function useRenewContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiResponse<VehicleContract>>(`/contracts/${id}/renew`, {});
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contractKeys.all }),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      ...data
    }: {
      contractId: string;
      paymentDate: string;
      amount: number;
      vatAmount?: number;
      paymentMethod?: string;
      reference?: string;
      notes?: string;
    }) => {
      const res = await api.post<ApiResponse<ContractPayment>>(
        `/contracts/${contractId}/payments`,
        data,
      );
      return res.data;
    },
    onSuccess: (_data, { contractId }) => {
      qc.invalidateQueries({ queryKey: contractKeys.payments(contractId) });
      qc.invalidateQueries({ queryKey: contractKeys.detail(contractId) });
    },
  });
}
