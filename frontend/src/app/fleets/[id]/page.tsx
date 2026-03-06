'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { DocumentsPanel } from '../../../components/DocumentsPanel';

interface FleetDetail {
  id: string;
  name: string;
  code: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  region: string | null;
  monthlyBudget: string | null;
  status: string;
  createdAt: string;
  costCentre?: { id: string; name: string; code: string } | null;
  _count?: { vehicles: number; drivers: number };
}

interface DetailResponse {
  success: boolean;
  data: FleetDetail;
}

interface FleetVehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  status: string;
  fuelType: string;
}

interface FleetDriver {
  id: string;
  firstName: string;
  lastName: string;
  mobileNumber: string;
  licenceCode: string | null;
  status: string;
}

interface ListResponse<T> {
  success: boolean;
  data: T[];
}

const STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
};

const VEHICLE_STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  maintenance: 'bg-orange-100 text-orange-800',
  decommissioned: 'bg-red-100 text-red-700',
};

const DRIVER_STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  suspended: 'bg-red-100 text-red-700',
};

function formatZAR(val: string | null | undefined): string {
  if (!val) return 'R 0.00';
  const n = parseFloat(val);
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

function budgetBarColour(pct: number): string {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 80) return 'bg-orange-500';
  return 'bg-green-500';
}

function budgetTextColour(pct: number): string {
  if (pct >= 100) return 'text-red-700';
  if (pct >= 80) return 'text-orange-700';
  return 'text-green-700';
}

const TABS = ['Overview', 'Vehicles', 'Drivers', 'Budget', 'Documents'] as const;
type Tab = (typeof TABS)[number];

export default function FleetDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<Tab>('Overview');

  const { data, isLoading, isError } = useQuery<DetailResponse>({
    queryKey: ['fleet', id],
    queryFn: () => api.get<DetailResponse>(`/fleets/${id}`),
    enabled: Boolean(id),
  });

  const { data: vehiclesData, isLoading: vehiclesLoading } = useQuery<ListResponse<FleetVehicle>>({
    queryKey: ['fleet-vehicles', id],
    queryFn: () => api.get<ListResponse<FleetVehicle>>(`/vehicles?fleetId=${id}`),
    enabled: Boolean(id) && tab === 'Vehicles',
  });

  const { data: driversData, isLoading: driversLoading } = useQuery<ListResponse<FleetDriver>>({
    queryKey: ['fleet-drivers', id],
    queryFn: () => api.get<ListResponse<FleetDriver>>(`/drivers?fleetId=${id}`),
    enabled: Boolean(id) && tab === 'Drivers',
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading...</div>;
  }

  if (isError || !data?.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load fleet.
        </div>
      </div>
    );
  }

  const fleet = data.data;
  const vehicleCount = fleet._count?.vehicles ?? 0;
  const driverCount = fleet._count?.drivers ?? 0;
  const monthlyBudget = fleet.monthlyBudget ? parseFloat(fleet.monthlyBudget) : 0;
  // Budget used percentage — placeholder: in a real implementation this would come from
  // aggregated fuel/repair spend. For now show 0% if no budget is set.
  const budgetUsed = 0;
  const budgetPct = monthlyBudget > 0 ? Math.round((budgetUsed / monthlyBudget) * 100) : 0;

  const vehicles = vehiclesData?.data ?? [];
  const drivers = driversData?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/fleets" className="hover:text-blue-600">Fleets</Link>
          <span>›</span>
          <span className="text-gray-900">{fleet.name}</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{fleet.name}</h1>
              <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOURS[fleet.status] ?? 'bg-gray-100'}`}>
                {fleet.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {fleet.code && <>{fleet.code} — </>}
              {fleet.region ? fleet.region.replace(/_/g, ' ') : 'No region'}
            </p>
          </div>
          <Link href={`/fleets/${id}/edit`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Edit
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Vehicles</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{vehicleCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Drivers</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{driverCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Monthly Budget</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{formatZAR(fleet.monthlyBudget)}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Budget Used</p>
            <p className={`mt-1 text-2xl font-semibold ${budgetTextColour(budgetPct)}`}>{budgetPct}%</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all ${budgetBarColour(budgetPct)}`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                {t}
              </button>
            ))}
          </nav>
        </div>

        {/* Overview Tab */}
        {tab === 'Overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="col-span-2 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Fleet Details</h2>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Name" value={fleet.name} />
                <Field label="Code" value={fleet.code} />
                <Field label="Region" value={fleet.region ? fleet.region.replace(/_/g, ' ') : null} />
                <Field label="Status" value={fleet.status} />
                <Field label="Contact Person" value={fleet.contactPerson} />
                <Field label="Contact Phone" value={fleet.contactPhone} />
                <Field label="Contact Email" value={fleet.contactEmail} />
                <Field label="Created" value={new Date(fleet.createdAt).toLocaleDateString('en-ZA')} />
              </dl>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-gray-800">Cost Centre</h2>
                {fleet.costCentre ? (
                  <dl className="space-y-3">
                    <Field label="Name" value={fleet.costCentre.name} />
                    <Field label="Code" value={fleet.costCentre.code} />
                  </dl>
                ) : (
                  <p className="text-sm text-gray-400">No cost centre assigned.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Vehicles Tab */}
        {tab === 'Vehicles' && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {vehiclesLoading ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading vehicles...</div>
            ) : vehicles.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">No vehicles in this fleet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Registration', 'Make', 'Model', 'Year', 'Fuel Type', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {vehicles.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/vehicles/${v.id}`} className="font-medium text-blue-600 hover:underline">
                            {v.registrationNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{v.make}</td>
                        <td className="px-4 py-3 text-gray-700">{v.model}</td>
                        <td className="px-4 py-3 text-gray-500">{v.year}</td>
                        <td className="px-4 py-3 text-gray-500 capitalize">{v.fuelType}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${VEHICLE_STATUS_COLOURS[v.status] ?? 'bg-gray-100 text-gray-600'}`}>
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
        )}

        {/* Drivers Tab */}
        {tab === 'Drivers' && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            {driversLoading ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading drivers...</div>
            ) : drivers.length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">No drivers in this fleet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Name', 'Mobile', 'Licence Code', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {drivers.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/drivers/${d.id}`} className="font-medium text-blue-600 hover:underline">
                            {d.firstName} {d.lastName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{d.mobileNumber}</td>
                        <td className="px-4 py-3 text-gray-500">{d.licenceCode ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${DRIVER_STATUS_COLOURS[d.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Budget Tab */}
        {tab === 'Budget' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">Monthly Budget</h2>
            {monthlyBudget > 0 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Budget</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{formatZAR(fleet.monthlyBudget)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Spent</p>
                    <p className="mt-1 text-lg font-semibold text-gray-900">{formatZAR(String(budgetUsed))}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Remaining</p>
                    <p className={`mt-1 text-lg font-semibold ${budgetTextColour(budgetPct)}`}>
                      {formatZAR(String(monthlyBudget - budgetUsed))}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-600">Budget utilisation</span>
                    <span className={`font-medium ${budgetTextColour(budgetPct)}`}>{budgetPct}%</span>
                  </div>
                  <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all ${budgetBarColour(budgetPct)}`}
                      style={{ width: `${Math.min(budgetPct, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-gray-400">
                    <span>R 0</span>
                    <span>{formatZAR(fleet.monthlyBudget)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No monthly budget has been set for this fleet.</p>
            )}
          </div>
        )}
        {/* Documents Tab */}
        {tab === 'Documents' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <DocumentsPanel entityType="fleet" entityId={id} />
          </div>
        )}
      </div>
    </div>
  );
}
