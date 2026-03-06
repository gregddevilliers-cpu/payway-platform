'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useState, use } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';

const REPORT_META: Record<string, { name: string; description: string; groupByOptions?: string[] }> = {
  'fuel-consumption': { name: 'Fuel Consumption', description: 'Total litres and cost', groupByOptions: ['vehicle', 'driver', 'fleet'] },
  'spend-analysis': { name: 'Spend Analysis', description: 'Month-over-month spend by fleet' },
  'driver-performance': { name: 'Driver Performance', description: 'Drivers ranked by efficiency' },
  'vehicle-performance': { name: 'Vehicle Performance', description: 'Vehicles ranked by total cost' },
  'compliance': { name: 'Compliance', description: 'Expiring and expired documents' },
  'budget-variance': { name: 'Budget Variance', description: 'Actual vs budgeted spend' },
  'anomaly-report': { name: 'Anomaly Report', description: 'Flagged transactions by type' },
  'forecourt-analysis': { name: 'Forecourt Analysis', description: 'Spend by fuel station' },
  'cost-allocation': { name: 'Cost Allocation', description: 'Costs allocated by fleet' },
};

function getDefaultDates() {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return {
    dateFrom: from.toISOString().split('T')[0],
    dateTo: now.toISOString().split('T')[0],
  };
}

function formatVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'number') {
    return v.toLocaleString('en-ZA', { maximumFractionDigits: 2 });
  }
  if (typeof v === 'string') {
    // ISO date
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString('en-ZA');
    return v.replace(/_/g, ' ');
  }
  return String(v);
}

function flattenData(type: string, data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (type === 'spend-analysis') {
    const d = data as { byFleet?: Record<string, unknown>[] };
    return d.byFleet ?? [];
  }
  if (type === 'compliance') {
    const d = data as { items?: Record<string, unknown>[] };
    return d.items ?? [];
  }
  if (type === 'anomaly-report') {
    const d = data as { byType?: Record<string, unknown>[] };
    return d.byType ?? [];
  }
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return [];
}

function summaryCards(type: string, data: unknown): { label: string; value: string }[] {
  if (!data) return [];
  if (type === 'spend-analysis') {
    const d = data as { currentTotal: number; previousTotal: number; percentageChange: number | null };
    return [
      { label: 'Current Period', value: `R ${d.currentTotal?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` },
      { label: 'Previous Period', value: `R ${d.previousTotal?.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` },
      { label: 'Change', value: d.percentageChange != null ? `${d.percentageChange > 0 ? '+' : ''}${d.percentageChange}%` : '—' },
    ];
  }
  if (type === 'compliance') {
    const d = data as { summary: { expired: number; expiring30: number; expiring60: number }; totalDrivers: number };
    return [
      { label: 'Expired', value: String(d.summary?.expired ?? 0) },
      { label: 'Expiring < 30 days', value: String(d.summary?.expiring30 ?? 0) },
      { label: 'Expiring < 60 days', value: String(d.summary?.expiring60 ?? 0) },
      { label: 'Total Drivers', value: String(d.totalDrivers ?? 0) },
    ];
  }
  return [];
}

export default function ReportViewerPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = use(params);
  const meta = REPORT_META[type] ?? { name: type, description: '' };
  const defaults = getDefaultDates();
  const [filters, setFilters] = useState({ dateFrom: defaults.dateFrom, dateTo: defaults.dateTo, groupBy: '' });
  const [applied, setApplied] = useState<typeof filters | null>(null);

  const { data: reportData, isLoading, isError } = useQuery({
    queryKey: ['report', type, applied],
    queryFn: () => {
      const qs = new URLSearchParams({ dateFrom: applied!.dateFrom, dateTo: applied!.dateTo });
      if (applied!.groupBy) qs.set('groupBy', applied!.groupBy);
      return api.get(`/reports/${type}?${qs}`);
    },
    enabled: applied != null,
  });

  const exportMutation = useMutation({
    mutationFn: ({ format }: { format: 'csv' | 'excel' | 'pdf' }) =>
      api.post(`/reports/${type}/export`, { format, filters: applied }),
  });

  const rows = flattenData(type, (reportData as { data?: unknown })?.data);
  const headers = rows.length > 0 ? Object.keys(rows[0]).filter((k) => k !== 'id' && !k.toLowerCase().includes('id')) : [];
  const cards = summaryCards(type, (reportData as { data?: unknown })?.data);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/reports" className="hover:text-gray-700">Reports</Link>
          <span>/</span>
          <span className="font-medium text-gray-900">{meta.name}</span>
        </div>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{meta.name}</h1>
            <p className="mt-1 text-sm text-gray-500">{meta.description}</p>
          </div>
          {applied && rows.length > 0 && (
            <div className="flex gap-2">
              {(['csv', 'excel', 'pdf'] as const).map((fmt) => (
                <button key={fmt} onClick={() => exportMutation.mutate({ format: fmt })}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter bar */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
            {meta.groupByOptions && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Group by</label>
                <select value={filters.groupBy}
                  onChange={(e) => setFilters((f) => ({ ...f, groupBy: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                  {meta.groupByOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setApplied({ ...filters })}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Run Report
            </button>
            {applied && (
              <button onClick={() => setApplied(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Clear</button>
            )}
          </div>
        </div>

        {/* Results */}
        {applied && (
          <>
            {isLoading && <div className="py-16 text-center text-sm text-gray-500">Running report…</div>}
            {isError && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Failed to run report.</div>}

            {!isLoading && !isError && (
              <>
                {/* Summary cards */}
                {cards.length > 0 && (
                  <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {cards.map((c) => (
                      <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                        <p className="text-xs text-gray-500">{c.label}</p>
                        <p className="mt-1 text-xl font-bold text-gray-900">{c.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Data table */}
                {rows.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
                    No data for the selected period.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            {headers.map((h) => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                                {h.replace(/([A-Z])/g, ' $1').trim()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {rows.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              {headers.map((h) => (
                                <td key={h} className="px-4 py-3 text-gray-700">{formatVal(row[h])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
                      {rows.length} rows · {applied.dateFrom} to {applied.dateTo}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
