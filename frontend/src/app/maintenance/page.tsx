'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  maintenanceType: string;
  provider: string | null;
  cost: string | null;
  odometer: number | null;
  serviceDate: string;
  nextServiceDate: string | null;
  status: string;
  description: string;
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
}

interface ListResponse {
  success: boolean;
  data: MaintenanceRecord[];
  meta: { nextCursor: string | null; hasMore: boolean; count: number };
}

const MAINTENANCE_TYPES = [
  'routine_service', 'oil_change', 'tyre_rotation', 'tyre_replacement',
  'brake_service', 'battery_replacement', 'filter_replacement',
  'transmission_service', 'coolant_flush', 'inspection', 'other',
];

const STATUS_COLOURS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-orange-100 text-orange-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

function formatZAR(val: string | null | undefined): string {
  if (!val) return '—';
  const n = parseFloat(val);
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildQs(f: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ maintenanceType: '', status: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState(filters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkStatus, setBulkStatus] = useState('completed');
  const [showBulkBar, setShowBulkBar] = useState(false);

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ['maintenance', applied],
    queryFn: () => api.get<ListResponse>(`/maintenance${buildQs(applied)}`),
  });

  const handleApply = useCallback(() => setApplied({ ...filters }), [filters]);
  const handleClear = useCallback(() => {
    const e = { maintenanceType: '', status: '', dateFrom: '', dateTo: '' };
    setFilters(e); setApplied(e);
  }, []);

  const records = data?.data ?? [];

  const bulkMutation = useMutation({
    mutationFn: ({ action, payload }: { action: string; payload?: Record<string, unknown> }) =>
      api.post('/maintenance/bulk-action', { ids: Array.from(selected), action, payload }),
    onSuccess: () => {
      setSelected(new Set());
      setShowBulkBar(false);
      setBulkAction('');
      qc.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });

  const toggleSelect = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => { if (selected.size === records.length) setSelected(new Set()); else setSelected(new Set(records.map((r) => r.id))); };
  const handleBulkAction = () => {
    if (!bulkAction) return;
    if (bulkAction === 'change_status') bulkMutation.mutate({ action: 'change_status', payload: { status: bulkStatus } });
    else if (bulkAction === 'delete') bulkMutation.mutate({ action: 'delete' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Maintenance</h1>
            <p className="mt-1 text-sm text-gray-500">Scheduled and ad-hoc vehicle service records</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/maintenance/schedules"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
            >
              Service Schedules
            </Link>
            <Link
              href="/maintenance/new"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Log Service
            </Link>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select
                value={filters.maintenanceType}
                onChange={(e) => setFilters((f) => ({ ...f, maintenanceType: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">All types</option>
                {MAINTENANCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">All statuses</option>
                {['scheduled', 'in_progress', 'completed', 'cancelled'].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">From date</label>
              <input type="date" value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">To date</label>
              <input type="date" value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleApply} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Apply</button>
            <button onClick={handleClear} className="rounded-md px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">Clear</button>
            {selected.size > 0 && (
              <button onClick={() => setShowBulkBar((v) => !v)}
                className="ml-auto rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
                {selected.size} selected — Actions
              </button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {showBulkBar && selected.size > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-sm font-medium text-blue-800">{selected.size} record(s) selected</span>
            <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}
              className="rounded border border-blue-300 px-2 py-1.5 text-sm focus:outline-none">
              <option value="">Choose action…</option>
              <option value="change_status">Change Status</option>
              <option value="delete">Delete</option>
            </select>
            {bulkAction === 'change_status' && (
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}
                className="rounded border border-blue-300 px-2 py-1.5 text-sm focus:outline-none">
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
            <button onClick={handleBulkAction} disabled={!bulkAction || bulkMutation.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {bulkMutation.isPending ? 'Processing…' : 'Apply'}
            </button>
            <button onClick={() => { setSelected(new Set()); setShowBulkBar(false); }}
              className="ml-auto text-sm text-blue-600 hover:underline">Clear selection</button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">Loading…</div>
          )}
          {isError && (
            <div className="flex items-center justify-center py-12">
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Failed to load maintenance records.
              </div>
            </div>
          )}
          {!isLoading && !isError && records.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">No maintenance records found.</div>
          )}
          {!isLoading && !isError && records.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={selected.size === records.length && records.length > 0} onChange={toggleAll} className="rounded border-gray-300" />
                  </th>
                  {['Vehicle', 'Type', 'Provider', 'Cost', 'Odometer', 'Service Date', 'Next Due', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {records.map((r) => (
                  <tr key={r.id} className={`cursor-pointer hover:bg-gray-50 ${selected.has(r.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="rounded border-gray-300" />
                    </td>
                    <td className="px-4 py-3" onClick={() => window.location.href = `/maintenance/${r.id}`}>
                      <p className="font-medium text-gray-900">{r.vehicle.registrationNumber}</p>
                      <p className="text-xs text-gray-400">{r.vehicle.make} {r.vehicle.model}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700" onClick={() => window.location.href = `/maintenance/${r.id}`}>{r.maintenanceType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-gray-600" onClick={() => window.location.href = `/maintenance/${r.id}`}>{r.provider ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-900" onClick={() => window.location.href = `/maintenance/${r.id}`}>{formatZAR(r.cost)}</td>
                    <td className="px-4 py-3 text-gray-600" onClick={() => window.location.href = `/maintenance/${r.id}`}>{r.odometer ? r.odometer.toLocaleString('en-ZA') : '—'}</td>
                    <td className="px-4 py-3 text-gray-600" onClick={() => window.location.href = `/maintenance/${r.id}`}>
                      {new Date(r.serviceDate).toLocaleDateString('en-ZA')}
                    </td>
                    <td className="px-4 py-3 text-gray-600" onClick={() => window.location.href = `/maintenance/${r.id}`}>
                      {r.nextServiceDate ? new Date(r.nextServiceDate).toLocaleDateString('en-ZA') : '—'}
                    </td>
                    <td className="px-4 py-3" onClick={() => window.location.href = `/maintenance/${r.id}`}>
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
