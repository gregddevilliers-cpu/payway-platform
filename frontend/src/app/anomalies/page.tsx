'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { api } from '../../lib/api';

interface AnomalyFlag {
  code: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolution?: 'dismissed' | 'confirmed' | 'under_review' | null;
}

interface FuelTransaction {
  id: string;
  transactionDate: string;
  litresFilled: string;
  totalAmount: string;
  fuelType: string;
  anomalyFlags: AnomalyFlag[];
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
  driver: { id: string; firstName: string; lastName: string } | null;
}

interface ListResponse {
  success: boolean;
  data: FuelTransaction[];
  meta: { nextCursor: string | null; hasMore: boolean; count: number };
}

interface SummaryResponse {
  success: boolean;
  data: {
    summary: { unresolvedHigh: number; unresolvedMedium: number; unresolvedLow: number; resolvedThisMonth: number };
    topAnomalyTypes: { code: string; count: number }[];
  };
}

const SEVERITY_COLOURS: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-orange-100 text-orange-700',
  low: 'bg-yellow-100 text-yellow-700',
};

const RESOLUTION_COLOURS: Record<string, string> = {
  dismissed: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-red-100 text-red-700',
  under_review: 'bg-blue-100 text-blue-700',
};

function buildQs(f: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

const ANOMALY_CODES = [
  'double_fill', 'overfill', 'fuel_type_mismatch', 'off_hours',
  'high_frequency', 'daily_spend_limit_breach', 'monthly_spend_limit_breach',
  'vehicle_daily_limit', 'efficiency_outlier', 'geofence_violation',
];

export default function AnomaliesPage() {
  const [filters, setFilters] = useState({ severity: '', resolved: 'false', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState(filters);
  const [expanded, setExpanded] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: summaryData } = useQuery<SummaryResponse>({
    queryKey: ['anomalies-summary'],
    queryFn: () => api.get('/fuel-transactions/anomalies/summary'),
  });

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ['anomalies', applied],
    queryFn: () => api.get(`/fuel-transactions/anomalies${buildQs(applied)}`),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ txnId, code, resolution }: { txnId: string; code: string; resolution: string }) =>
      api.patch(`/fuel-transactions/${txnId}/anomalies/${code}`, { resolution }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anomalies'] });
      qc.invalidateQueries({ queryKey: ['anomalies-summary'] });
    },
  });

  const handleApply = useCallback(() => setApplied({ ...filters }), [filters]);
  const handleClear = useCallback(() => {
    const e = { severity: '', resolved: 'false', dateFrom: '', dateTo: '' };
    setFilters(e); setApplied(e);
  }, []);

  const txns = data?.data ?? [];
  const summary = summaryData?.data?.summary;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Fuel Anomalies</h1>
          <p className="mt-1 text-sm text-gray-500">Detected irregularities in fuel transactions</p>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-2xl font-bold text-red-700">{summary.unresolvedHigh}</p>
              <p className="text-sm text-red-600">Unresolved High</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
              <p className="text-2xl font-bold text-orange-700">{summary.unresolvedMedium}</p>
              <p className="text-sm text-orange-600">Unresolved Medium</p>
            </div>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-2xl font-bold text-yellow-700">{summary.unresolvedLow}</p>
              <p className="text-sm text-yellow-600">Unresolved Low</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-2xl font-bold text-green-700">{summary.resolvedThisMonth}</p>
              <p className="text-sm text-green-600">Resolved This Month</p>
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Severity</label>
              <select value={filters.severity}
                onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
              <select value={filters.resolved}
                onChange={(e) => setFilters((f) => ({ ...f, resolved: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="false">Unresolved</option>
                <option value="true">Resolved</option>
                <option value="">All</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">From date</label>
              <input type="date" value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">To date</label>
              <input type="date" value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleApply} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Apply</button>
            <button onClick={handleClear} className="rounded-md px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">Clear</button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-3">
          {isLoading && <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-500">Loading…</div>}
          {isError && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load anomalies.</div>}
          {!isLoading && !isError && txns.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">No anomalies found.</div>
          )}

          {txns.map((txn) => (
            <div key={txn.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">
              {/* Header row */}
              <button
                className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
                onClick={() => setExpanded(expanded === txn.id ? null : txn.id)}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{txn.vehicle.registrationNumber}</p>
                    <p className="text-xs text-gray-400">{txn.vehicle.make} {txn.vehicle.model}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">{new Date(txn.transactionDate).toLocaleDateString('en-ZA')}</p>
                    <p className="text-xs text-gray-400">
                      {txn.driver ? `${txn.driver.firstName} ${txn.driver.lastName}` : 'No driver'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {txn.anomalyFlags.map((f) => (
                      <span key={f.code} className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLOURS[f.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                        {f.severity.toUpperCase()} · {f.code.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="text-gray-400">{expanded === txn.id ? '▲' : '▼'}</span>
              </button>

              {/* Expanded detail */}
              {expanded === txn.id && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="mb-3 grid grid-cols-3 gap-4 text-sm">
                    <div><span className="text-gray-500">Litres:</span> <span className="font-medium">{parseFloat(txn.litresFilled).toFixed(1)} L</span></div>
                    <div><span className="text-gray-500">Amount:</span> <span className="font-medium">R {parseFloat(txn.totalAmount).toFixed(2)}</span></div>
                    <div><span className="text-gray-500">Fuel type:</span> <span className="font-medium capitalize">{txn.fuelType}</span></div>
                  </div>
                  <div className="space-y-3">
                    {txn.anomalyFlags.map((f) => (
                      <div key={f.code} className={`rounded-lg border p-4 ${f.severity === 'high' ? 'border-red-200 bg-red-50' : f.severity === 'medium' ? 'border-orange-200 bg-orange-50' : 'border-yellow-200 bg-yellow-50'}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{f.code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                            <p className="mt-1 text-sm text-gray-700">{f.description}</p>
                            {f.resolution && (
                              <span className={`mt-2 inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${RESOLUTION_COLOURS[f.resolution] ?? ''}`}>
                                {f.resolution.replace(/_/g, ' ')}
                                {f.resolvedAt ? ` · ${new Date(f.resolvedAt).toLocaleDateString('en-ZA')}` : ''}
                              </span>
                            )}
                          </div>
                          {!f.resolution && (
                            <div className="flex gap-2 ml-4 shrink-0">
                              {(['dismissed', 'confirmed', 'under_review'] as const).map((res) => (
                                <button
                                  key={res}
                                  onClick={() => resolveMutation.mutate({ txnId: txn.id, code: f.code, resolution: res })}
                                  disabled={resolveMutation.isPending}
                                  className={`rounded px-3 py-1 text-xs font-medium border transition-colors ${
                                    res === 'dismissed' ? 'border-gray-300 text-gray-600 hover:bg-gray-100' :
                                    res === 'confirmed' ? 'border-red-300 text-red-700 hover:bg-red-50' :
                                    'border-blue-300 text-blue-700 hover:bg-blue-50'
                                  }`}
                                >
                                  {res.replace(/_/g, ' ')}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Top anomaly types sidebar summary */}
        {summaryData?.data?.topAnomalyTypes && summaryData.data.topAnomalyTypes.length > 0 && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Top Anomaly Types</h2>
            <div className="space-y-2">
              {summaryData.data.topAnomalyTypes.map(({ code, count }) => (
                <div key={code} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{code.replace(/_/g, ' ')}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
