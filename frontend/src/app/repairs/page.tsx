'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { formatZAR } from '../../lib/utils';

interface RepairJob {
  id: string;
  repairNumber: string;
  repairType: string;
  priority: string;
  status: string;
  createdAt: string;
  estimatedCompletion: string | null;
  totalCost: string | null;
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
  repairProvider: { id: string; name: string } | null;
  fleet: { id: string; name: string };
}

interface ListResponse {
  success: boolean;
  data: RepairJob[];
  meta: { total: number; nextCursor: string | null };
}

const STATUS_COLOURS: Record<string, string> = {
  reported: 'bg-gray-100 text-gray-700',
  assessed: 'bg-blue-100 text-blue-800',
  quoted: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-orange-100 text-orange-800',
  quality_check: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const PRIORITY_COLOURS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const REPAIR_TYPES = ['mechanical', 'electrical', 'body_panel', 'tyre', 'windscreen', 'interior', 'other'];
const STATUSES = ['reported', 'assessed', 'quoted', 'in_progress', 'quality_check', 'completed', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

function buildQs(f: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function RepairsPage() {
  const [filters, setFilters] = useState({ status: '', priority: '', repairType: '', search: '' });
  const [applied, setApplied] = useState(filters);

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ['repairs', applied],
    queryFn: () => api.get<ListResponse>(`/repairs${buildQs(applied)}`),
  });

  const handleApply = useCallback(() => setApplied({ ...filters }), [filters]);
  const handleClear = useCallback(() => {
    const e = { status: '', priority: '', repairType: '', search: '' };
    setFilters(e); setApplied(e);
  }, []);

  const repairs = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Repairs</h1>
            <p className="mt-1 text-sm text-gray-500">Vehicle repair lifecycle management</p>
          </div>
          <Link
            href="/repairs/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Log Repair
          </Link>
        </div>

        {/* Filter bar */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
              <select value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Priority</label>
              <select value={filters.priority}
                onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select value={filters.repairType}
                onChange={(e) => setFilters((f) => ({ ...f, repairType: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">All types</option>
                {REPAIR_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Search</label>
              <input type="text" value={filters.search} placeholder="Vehicle reg, repair #…"
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleApply} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Apply</button>
            <button onClick={handleClear} className="rounded-md px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">Clear</button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && <div className="flex items-center justify-center py-16 text-sm text-gray-500">Loading…</div>}
          {isError && (
            <div className="flex items-center justify-center py-12">
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load repairs.</div>
            </div>
          )}
          {!isLoading && !isError && repairs.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">No repairs found.</div>
          )}
          {!isLoading && !isError && repairs.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Repair #', 'Vehicle', 'Type', 'Provider', 'Status', 'Priority', 'Reported', 'Est. Completion', 'Total Cost'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {repairs.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-gray-50"
                    onClick={() => window.location.href = `/repairs/${r.id}`}>
                    <td className="px-4 py-3 font-medium text-blue-600">{r.repairNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{r.vehicle.registrationNumber}</p>
                      <p className="text-xs text-gray-400">{r.vehicle.make} {r.vehicle.model}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.repairType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-gray-600">{r.repairProvider?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOURS[r.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{new Date(r.createdAt).toLocaleDateString('en-ZA')}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.estimatedCompletion ? new Date(r.estimatedCompletion).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{formatZAR(r.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data?.meta?.total != null && (
          <p className="mt-3 text-xs text-gray-400 text-right">{data.meta.total} repair(s) total</p>
        )}
      </div>
    </div>
  );
}
