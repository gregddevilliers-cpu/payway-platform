'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../../lib/api';

interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  status: string;
  currentOdometer: number | null;
  fleet: { id: string; name: string };
}

const STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  maintenance: 'bg-orange-100 text-orange-800',
  decommissioned: 'bg-red-100 text-red-700',
};

export default function VehiclesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [bulkStatus, setBulkStatus] = useState('active');
  const [showBulkBar, setShowBulkBar] = useState(false);

  const qs = new URLSearchParams({ limit: '50' });
  if (search) qs.set('search', search);
  if (status) qs.set('status', status);

  const { data, isLoading } = useQuery<{ data: Vehicle[]; meta: { total: number } }>({
    queryKey: ['vehicles', search, status],
    queryFn: () => api.get(`/vehicles?${qs}`),
  });

  const vehicles = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const bulkMutation = useMutation({
    mutationFn: ({ action, payload }: { action: string; payload?: Record<string, unknown> }) =>
      api.post('/vehicles/bulk-action', { ids: Array.from(selected), action, payload }),
    onSuccess: () => {
      setSelected(new Set());
      setShowBulkBar(false);
      setBulkAction('');
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === vehicles.length) setSelected(new Set());
    else setSelected(new Set(vehicles.map((v) => v.id)));
  };

  const handleBulkAction = () => {
    if (!bulkAction) return;
    if (bulkAction === 'change_status') bulkMutation.mutate({ action: 'change_status', payload: { status: bulkStatus } });
    else if (bulkAction === 'export') bulkMutation.mutate({ action: 'export' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Vehicles</h1>
            <p className="mt-1 text-sm text-gray-500">{total} total</p>
          </div>
          <Link href="/vehicles/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Add Vehicle
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="text" placeholder="Search registration, make, model…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none w-64"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="maintenance">Maintenance</option>
            <option value="decommissioned">Decommissioned</option>
          </select>
          {selected.size > 0 && (
            <button onClick={() => setShowBulkBar((v) => !v)}
              className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
              {selected.size} selected — Actions
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {showBulkBar && selected.size > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-sm font-medium text-blue-800">{selected.size} vehicle(s) selected</span>
            <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}
              className="rounded border border-blue-300 px-2 py-1.5 text-sm focus:outline-none">
              <option value="">Choose action…</option>
              <option value="change_status">Change Status</option>
              <option value="export">Export CSV</option>
            </select>
            {bulkAction === 'change_status' && (
              <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}
                className="rounded border border-blue-300 px-2 py-1.5 text-sm focus:outline-none">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">Maintenance</option>
                <option value="decommissioned">Decommissioned</option>
              </select>
            )}
            <button onClick={handleBulkAction} disabled={!bulkAction || bulkMutation.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {bulkMutation.isPending ? 'Processing…' : 'Apply'}
            </button>
            <button onClick={() => { setSelected(new Set()); setShowBulkBar(false); }}
              className="ml-auto text-sm text-blue-600 hover:underline">
              Clear selection
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading vehicles…</div>
          ) : vehicles.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No vehicles found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={selected.size === vehicles.length && vehicles.length > 0}
                        onChange={toggleAll} className="rounded border-gray-300" />
                    </th>
                    {['Registration', 'Make / Model', 'Year', 'Fuel', 'Fleet', 'Odometer', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vehicles.map((v) => (
                    <tr key={v.id} className={`hover:bg-gray-50 ${selected.has(v.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)}
                          className="rounded border-gray-300" />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/vehicles/${v.id}`} className="font-medium text-blue-600 hover:underline">
                          {v.registrationNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{v.make} {v.model}</td>
                      <td className="px-4 py-3 text-gray-500">{v.year}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{v.fuelType}</td>
                      <td className="px-4 py-3 text-gray-500">{v.fleet.name}</td>
                      <td className="px-4 py-3 text-gray-500">{v.currentOdometer != null ? `${v.currentOdometer.toLocaleString('en-ZA')} km` : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[v.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {v.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
