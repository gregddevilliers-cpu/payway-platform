'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../../lib/api';

interface Fleet {
  id: string;
  name: string;
  code: string | null;
  region: string | null;
  status: string;
  vehicleCount: number;
  driverCount: number;
}

const STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
};

export default function FleetsPage() {
  const { data, isLoading } = useQuery<{ data: Fleet[] }>({
    queryKey: ['fleets'],
    queryFn: () => api.get('/fleets'),
  });

  const fleets = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Fleets</h1>
            <p className="mt-1 text-sm text-gray-500">{fleets.length} total</p>
          </div>
          <Link href="/fleets/new" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + Add Fleet
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <div className="col-span-3 py-16 text-center text-sm text-gray-400">Loading fleets…</div>
          ) : fleets.length === 0 ? (
            <div className="col-span-3 py-16 text-center text-sm text-gray-400">No fleets found.</div>
          ) : (
            fleets.map((f) => (
              <Link key={f.id} href={`/fleets/${f.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{f.name}</h2>
                    {f.code && <p className="text-xs text-gray-400 mt-0.5">Code: {f.code}</p>}
                    {f.region && <p className="text-xs text-gray-400">{f.region}</p>}
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[f.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {f.status}
                  </span>
                </div>
                <div className="mt-4 flex gap-4 text-sm text-gray-600">
                  <span>{f.vehicleCount} vehicles</span>
                  <span>{f.driverCount} drivers</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
