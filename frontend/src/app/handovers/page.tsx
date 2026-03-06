'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

interface Handover {
  id: string;
  handoverNumber: string;
  handoverType: string;
  handoverDatetime: string;
  odometerReading: number | null;
  fuelLevel: string | null;
  vehicle: { registrationNumber: string; make: string; model: string };
  driver: { firstName: string; lastName: string } | null;
  fleet: { name: string } | null;
}

interface ListResponse {
  success: boolean;
  data: Handover[];
  meta: { total: number; nextCursor: string | null };
}

const TYPE_COLOURS: Record<string, string> = {
  check_out: 'bg-blue-100 text-blue-800',
  check_in: 'bg-green-100 text-green-800',
};

const HANDOVER_TYPES = ['check_out', 'check_in'];

const FUEL_LABELS: Record<string, string> = {
  empty: 'Empty',
  quarter: '1/4',
  half: '1/2',
  three_quarter: '3/4',
  full: 'Full',
};

function buildQs(f: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function HandoversPage() {
  const [filters, setFilters] = useState({ handoverType: '', search: '' });
  const [applied, setApplied] = useState(filters);

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ['handovers', applied],
    queryFn: () => api.get<ListResponse>(`/handovers${buildQs(applied)}`),
  });

  const handleApply = useCallback(() => setApplied({ ...filters }), [filters]);
  const handleClear = useCallback(() => {
    const e = { handoverType: '', search: '' };
    setFilters(e);
    setApplied(e);
  }, []);

  const handovers = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Handovers</h1>
            <p className="mt-1 text-sm text-gray-500">Vehicle check-out and check-in records</p>
          </div>
          <Link
            href="/handovers/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Handover
          </Link>
        </div>

        {/* Filter bar */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
              <select
                value={filters.handoverType}
                onChange={(e) => setFilters((f) => ({ ...f, handoverType: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">All types</option>
                {HANDOVER_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Search</label>
              <input
                type="text"
                value={filters.search}
                placeholder="Vehicle reg, handover #, driver..."
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleApply} className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">Apply</button>
            <button onClick={handleClear} className="rounded-md px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">Clear</button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && <div className="flex items-center justify-center py-16 text-sm text-gray-500">Loading...</div>}
          {isError && (
            <div className="flex items-center justify-center py-12">
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load handovers.</div>
            </div>
          )}
          {!isLoading && !isError && handovers.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">No handovers found.</div>
          )}
          {!isLoading && !isError && handovers.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Handover #', 'Vehicle', 'Driver', 'Type', 'Date / Time', 'Odometer', 'Fuel Level'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {handovers.map((h) => (
                  <tr
                    key={h.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => window.location.href = `/handovers/${h.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-blue-600">{h.handoverNumber}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{h.vehicle.registrationNumber}</p>
                      <p className="text-xs text-gray-400">{h.vehicle.make} {h.vehicle.model}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {h.driver ? `${h.driver.firstName} ${h.driver.lastName}` : '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLOURS[h.handoverType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {h.handoverType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {new Date(h.handoverDatetime).toLocaleString('en-ZA')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {h.odometerReading != null ? `${h.odometerReading.toLocaleString('en-ZA')} km` : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {h.fuelLevel ? (FUEL_LABELS[h.fuelLevel] ?? h.fuelLevel.replace(/_/g, ' ')) : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data?.meta?.total != null && (
          <p className="mt-3 text-xs text-gray-400 text-right">{data.meta.total} handover(s) total</p>
        )}
      </div>
    </div>
  );
}
