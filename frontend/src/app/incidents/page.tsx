'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

interface Incident {
  id: string;
  incidentNumber: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  status: string;
  claimStatus: string | null;
  costEstimate: string | null;
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
  driver: { id: string; firstName: string; lastName: string } | null;
}

interface ListResponse {
  success: boolean;
  data: Incident[];
  meta: { nextCursor: string | null; hasMore: boolean; count: number };
}

const SEVERITY_COLOURS: Record<string, string> = {
  minor: 'bg-gray-100 text-gray-700',
  moderate: 'bg-blue-100 text-blue-800',
  major: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const STATUS_COLOURS: Record<string, string> = {
  reported: 'bg-yellow-100 text-yellow-800',
  under_investigation: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
};

const INCIDENT_TYPES = [
  'accident', 'theft', 'hijacking', 'vandalism',
  'mechanical_failure', 'tyre_blowout', 'fire', 'other',
];

function buildQs(f: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

function formatZAR(val: string | null | undefined): string {
  if (!val) return '—';
  const n = parseFloat(val);
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function IncidentsPage() {
  const [filters, setFilters] = useState({ incidentType: '', severity: '', status: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState(filters);

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ['incidents', applied],
    queryFn: () => api.get<ListResponse>(`/incidents${buildQs(applied)}`),
  });

  const handleApply = useCallback(() => setApplied({ ...filters }), [filters]);
  const handleClear = useCallback(() => {
    const e = { incidentType: '', severity: '', status: '', dateFrom: '', dateTo: '' };
    setFilters(e); setApplied(e);
  }, []);

  const incidents = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Incidents</h1>
            <p className="mt-1 text-sm text-gray-500">Accident and incident management</p>
          </div>
          <Link
            href="/incidents/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Log Incident
          </Link>
        </div>

        {/* Filter bar */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select value={filters.incidentType}
                onChange={(e) => setFilters((f) => ({ ...f, incidentType: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">All types</option>
                {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Severity</label>
              <select value={filters.severity}
                onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">All</option>
                {['minor', 'moderate', 'major', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
              <select value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">All</option>
                {['reported', 'under_investigation', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
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

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && <div className="flex items-center justify-center py-16 text-sm text-gray-500">Loading…</div>}
          {isError && (
            <div className="flex items-center justify-center py-12">
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load incidents.</div>
            </div>
          )}
          {!isLoading && !isError && incidents.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">No incidents found.</div>
          )}
          {!isLoading && !isError && incidents.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Incident #', 'Date', 'Vehicle', 'Driver', 'Type', 'Severity', 'Status', 'Claim Status', 'Cost Estimate'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {incidents.map((i) => (
                  <tr key={i.id} className="cursor-pointer hover:bg-gray-50" onClick={() => window.location.href = `/incidents/${i.id}`}>
                    <td className="px-4 py-3 font-medium text-blue-600">{i.incidentNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{new Date(i.incidentDate).toLocaleDateString('en-ZA')}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{i.vehicle.registrationNumber}</p>
                      <p className="text-xs text-gray-400">{i.vehicle.make} {i.vehicle.model}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {i.driver ? `${i.driver.firstName} ${i.driver.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{i.incidentType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_COLOURS[i.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                        {i.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[i.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {i.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{i.claimStatus ? i.claimStatus.replace(/_/g, ' ') : '—'}</td>
                    <td className="px-4 py-3 text-gray-900">{formatZAR(i.costEstimate)}</td>
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
