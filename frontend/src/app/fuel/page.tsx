'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { formatZAR } from '../../lib/utils';

interface FuelTransaction {
  id: string;
  transactionDate: string;
  litresFilled: string;
  pricePerLitre: string;
  totalAmount: string;
  fuelType: string;
  odometer: number | null;
  fuelEfficiency: string | null;
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
  driver: { id: string; firstName: string; lastName: string } | null;
}

interface ListResponse {
  success: boolean;
  data: FuelTransaction[];
  meta: { nextCursor: string | null; hasMore: boolean; count: number };
}

const FUEL_TYPES = ['petrol', 'diesel', 'lpg', 'electric', 'hybrid'];

const EFFICIENCY_COLOUR = (kpl: number | null): string => {
  if (!kpl) return 'text-gray-400';
  if (kpl >= 12) return 'text-green-600';
  if (kpl >= 9) return 'text-blue-600';
  if (kpl >= 6) return 'text-orange-500';
  return 'text-red-600';
};

function buildQs(f: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export default function FuelTransactionsPage() {
  const [filters, setFilters] = useState({ fuelType: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState(filters);

  const { data, isLoading, isError } = useQuery<ListResponse>({
    queryKey: ['fuel-transactions', applied],
    queryFn: () => api.get<ListResponse>(`/fuel-transactions${buildQs(applied)}`),
  });

  const handleApply = useCallback(() => setApplied({ ...filters }), [filters]);
  const handleClear = useCallback(() => {
    const e = { fuelType: '', dateFrom: '', dateTo: '' };
    setFilters(e); setApplied(e);
  }, []);

  const txns = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Fuel Transactions</h1>
            <p className="mt-1 text-sm text-gray-500">Fuel logs with efficiency tracking</p>
          </div>
          <Link
            href="/fuel/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Log Fill-up
          </Link>
        </div>

        {/* Filter bar */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Fuel type</label>
              <select value={filters.fuelType}
                onChange={(e) => setFilters((f) => ({ ...f, fuelType: e.target.value }))}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none">
                <option value="">All types</option>
                {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load transactions.</div>
            </div>
          )}
          {!isLoading && !isError && txns.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">No fuel transactions found.</div>
          )}
          {!isLoading && !isError && txns.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Date', 'Vehicle', 'Driver', 'Fuel Type', 'Litres', 'Price/L', 'Total', 'Odometer', 'Efficiency'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {txns.map((t) => {
                  const kpl = t.fuelEfficiency ? parseFloat(t.fuelEfficiency) : null;
                  return (
                    <tr key={t.id} className="cursor-pointer hover:bg-gray-50" onClick={() => window.location.href = `/fuel/${t.id}`}>
                      <td className="px-4 py-3 text-gray-600">{new Date(t.transactionDate).toLocaleDateString('en-ZA')}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{t.vehicle.registrationNumber}</p>
                        <p className="text-xs text-gray-400">{t.vehicle.make} {t.vehicle.model}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : '—'}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-700">{t.fuelType}</td>
                      <td className="px-4 py-3 text-gray-900">{parseFloat(t.litresFilled).toFixed(1)} L</td>
                      <td className="px-4 py-3 text-gray-600">{formatZAR(t.pricePerLitre)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{formatZAR(t.totalAmount)}</td>
                      <td className="px-4 py-3 text-gray-600">{t.odometer != null ? `${t.odometer.toLocaleString()} km` : '—'}</td>
                      <td className={`px-4 py-3 font-medium ${EFFICIENCY_COLOUR(kpl)}`}>
                        {kpl ? `${kpl.toFixed(2)} km/L` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
