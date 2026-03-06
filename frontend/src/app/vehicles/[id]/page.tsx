'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { formatZAR, formatDate } from '../../../lib/utils';
import { DocumentsPanel } from '../../../components/DocumentsPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Fleet {
  id: string;
  name: string;
}

interface MaintenanceRecord {
  id: string;
  serviceDate: string;
  serviceType: string;
  description: string | null;
  cost: string | null;
  status: string;
}

interface VehicleDetail {
  id: string;
  registrationNumber: string;
  vinNumber: string | null;
  make: string;
  model: string;
  year: number;
  colour: string | null;
  fuelType: string;
  tankCapacity: string;
  currentOdometer: number | null;
  status: string;
  tagStatus: string;
  tagNumber: string | null;
  ownershipType: string | null;
  leaseExpiry: string | null;
  insuranceProvider: string | null;
  policyNumber: string | null;
  insuranceExpiry: string | null;
  licenceDiscExpiry: string | null;
  createdAt: string;
  updatedAt: string;
  fleet: Fleet;
  maintenanceRecords: MaintenanceRecord[];
}

interface FuelTransaction {
  id: string;
  transactionDate: string;
  litres: string;
  totalAmount: string;
  fuelType: string;
  siteName: string | null;
  driver: { id: string; firstName: string; lastName: string } | null;
}

interface MaintenanceRow {
  id: string;
  serviceDate: string;
  serviceType: string;
  description: string | null;
  cost: string | null;
  status: string;
}

interface RepairRow {
  id: string;
  repairNumber: string;
  repairType: string;
  priority: string;
  status: string;
  totalCost: string | null;
}

interface IncidentRow {
  id: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  status: string;
  description: string;
}

interface ContractRow {
  id: string;
  contractType: string;
  startDate: string;
  endDate: string;
  status: string;
  monthlyAmount: string | null;
}

interface VehicleEquipment {
  id: string;
  vehicleId: string;
  equipmentType: string;
  status: string;
  expiryDate: string | null;
  lastChecked: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Colour maps
// ---------------------------------------------------------------------------

const VEHICLE_STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  maintenance: 'bg-orange-100 text-orange-800',
  decommissioned: 'bg-red-100 text-red-700',
  suspended: 'bg-yellow-100 text-yellow-800',
  inactive: 'bg-gray-100 text-gray-600',
};

const REPAIR_STATUS_COLOURS: Record<string, string> = {
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

const SEVERITY_COLOURS: Record<string, string> = {
  minor: 'bg-gray-100 text-gray-700',
  moderate: 'bg-blue-100 text-blue-800',
  major: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const INCIDENT_STATUS_COLOURS: Record<string, string> = {
  reported: 'bg-yellow-100 text-yellow-800',
  under_investigation: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
};

const CONTRACT_STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-700',
  terminated: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-800',
};

const MAINTENANCE_STATUS_COLOURS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-orange-100 text-orange-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  overdue: 'bg-red-100 text-red-800',
};

const EQUIPMENT_STATUS_COLOURS: Record<string, string> = {
  present: 'bg-green-100 text-green-800',
  missing: 'bg-red-100 text-red-800',
  expired: 'bg-orange-100 text-orange-800',
  damaged: 'bg-yellow-100 text-yellow-800',
};

const EQUIPMENT_STATUSES = ['present', 'missing', 'expired', 'damaged'] as const;

const EQUIPMENT_TYPES_WITH_EXPIRY = ['fire_extinguisher', 'first_aid_kit'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

function Badge({ text, colourMap }: { text: string; colourMap: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${colourMap[text] ?? 'bg-gray-100 text-gray-600'}`}>
      {text.replace(/_/g, ' ')}
    </span>
  );
}

function formatEquipmentType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Returns a colour class for expiry dates: green >60d, orange 14-60d, red <14d or past */
function expiryBadge(dateStr: string | null | undefined): { label: string; className: string } {
  if (!dateStr) return { label: '—', className: '' };
  const now = new Date();
  const expiry = new Date(dateStr);
  const daysUntil = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    return { label: `Expired (${formatDate(dateStr)})`, className: 'bg-red-100 text-red-800' };
  }
  if (daysUntil < 14) {
    return { label: `${formatDate(dateStr)} (${daysUntil}d)`, className: 'bg-red-100 text-red-700' };
  }
  if (daysUntil <= 60) {
    return { label: `${formatDate(dateStr)} (${daysUntil}d)`, className: 'bg-orange-100 text-orange-700' };
  }
  return { label: formatDate(dateStr), className: 'bg-green-100 text-green-700' };
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = ['Overview', 'Fuel History', 'Maintenance', 'Repairs', 'Incidents', 'Contracts', 'Equipment', 'Documents'] as const;
type Tab = (typeof TABS)[number];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VehicleDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<Tab>('Overview');

  // ── Main vehicle data ──────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery<{ success: boolean; data: VehicleDetail }>({
    queryKey: ['vehicle', id],
    queryFn: () => api.get(`/vehicles/${id}`),
    enabled: Boolean(id),
  });

  // ── Fuel transactions ──────────────────────────────────────────────────
  const fuelQuery = useQuery<{ success: boolean; data: FuelTransaction[] }>({
    queryKey: ['vehicle-fuel', id],
    queryFn: () => api.get(`/fuel-transactions?vehicleId=${id}`),
    enabled: tab === 'Fuel History' && Boolean(id),
  });

  // ── Maintenance ────────────────────────────────────────────────────────
  const maintenanceQuery = useQuery<{ success: boolean; data: MaintenanceRow[] }>({
    queryKey: ['vehicle-maintenance', id],
    queryFn: () => api.get(`/maintenance?vehicleId=${id}`),
    enabled: tab === 'Maintenance' && Boolean(id),
  });

  // ── Repairs ────────────────────────────────────────────────────────────
  const repairsQuery = useQuery<{ success: boolean; data: RepairRow[] }>({
    queryKey: ['vehicle-repairs', id],
    queryFn: () => api.get(`/vehicles/${id}/repairs`),
    enabled: tab === 'Repairs' && Boolean(id),
  });

  // ── Incidents ──────────────────────────────────────────────────────────
  const incidentsQuery = useQuery<{ success: boolean; data: IncidentRow[] }>({
    queryKey: ['vehicle-incidents', id],
    queryFn: () => api.get(`/incidents?vehicleId=${id}`),
    enabled: tab === 'Incidents' && Boolean(id),
  });

  // ── Contracts ──────────────────────────────────────────────────────────
  const contractsQuery = useQuery<{ success: boolean; data: ContractRow[] }>({
    queryKey: ['vehicle-contracts', id],
    queryFn: () => api.get(`/contracts?vehicleId=${id}`),
    enabled: tab === 'Contracts' && Boolean(id),
  });

  // ── Equipment ───────────────────────────────────────────────────────────
  const queryClient = useQueryClient();

  const equipmentQuery = useQuery<{ success: boolean; data: VehicleEquipment[] }>({
    queryKey: ['vehicle-equipment', id],
    queryFn: () => api.get(`/vehicles/${id}/equipment`),
    enabled: tab === 'Equipment' && Boolean(id),
  });

  const [equipmentEdits, setEquipmentEdits] = useState<Record<string, Partial<VehicleEquipment>>>({});

  const updateEquipmentField = useCallback(
    (itemId: string, field: keyof VehicleEquipment, value: string | null) => {
      setEquipmentEdits((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], [field]: value },
      }));
    },
    [],
  );

  const equipmentSaveMutation = useMutation({
    mutationFn: (items: Partial<VehicleEquipment>[]) =>
      api.patch(`/vehicles/${id}/equipment`, { items }),
    onSuccess: () => {
      setEquipmentEdits({});
      queryClient.invalidateQueries({ queryKey: ['vehicle-equipment', id] });
    },
  });

  const equipmentGenerateMutation = useMutation({
    mutationFn: () => api.post(`/vehicles/${id}/equipment/generate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-equipment', id] });
    },
  });

  const hasEquipmentEdits = Object.keys(equipmentEdits).length > 0;

  const handleEquipmentSave = useCallback(() => {
    const items = equipmentQuery.data?.data ?? [];
    const changed = items
      .filter((item) => equipmentEdits[item.id])
      .map((item) => ({
        id: item.id,
        ...equipmentEdits[item.id],
      }));
    if (changed.length > 0) {
      equipmentSaveMutation.mutate(changed);
    }
  }, [equipmentQuery.data, equipmentEdits, equipmentSaveMutation]);

  // ── Loading / error states ─────────────────────────────────────────────
  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading...</div>;
  }

  if (isError || !data?.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load vehicle.
        </div>
      </div>
    );
  }

  const vehicle = data.data;

  const insuranceExp = expiryBadge(vehicle.insuranceExpiry);
  const licenceExp = expiryBadge(vehicle.licenceDiscExpiry);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/vehicles" className="hover:text-blue-600">Vehicles</Link>
          <span>/</span>
          <span className="text-gray-900">{vehicle.registrationNumber}</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900">{vehicle.registrationNumber}</h1>
              <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${VEHICLE_STATUS_COLOURS[vehicle.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {vehicle.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {vehicle.make} {vehicle.model} ({vehicle.year})
            </p>
          </div>
          <Link
            href={`/vehicles/${id}/edit`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit
          </Link>
        </div>

        {/* Tab bar */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex gap-6 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`whitespace-nowrap pb-3 text-sm font-medium ${
                  tab === t
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>

        {/* ================================================================ */}
        {/*  TAB 1 — Overview                                                */}
        {/* ================================================================ */}
        {tab === 'Overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left column — vehicle info */}
            <div className="col-span-2 space-y-6">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-800">Vehicle Details</h2>
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Registration" value={vehicle.registrationNumber} />
                  <Field label="VIN" value={vehicle.vinNumber} />
                  <Field label="Make" value={vehicle.make} />
                  <Field label="Model" value={vehicle.model} />
                  <Field label="Year" value={vehicle.year} />
                  <Field label="Colour" value={vehicle.colour} />
                  <Field label="Fuel Type" value={vehicle.fuelType} />
                  <Field label="Tank Capacity" value={vehicle.tankCapacity ? `${parseFloat(vehicle.tankCapacity)} L` : null} />
                  <Field label="Current Odometer" value={vehicle.currentOdometer != null ? `${vehicle.currentOdometer.toLocaleString('en-ZA')} km` : null} />
                  <Field
                    label="Fleet"
                    value={
                      vehicle.fleet ? (
                        <Link href={`/fleets/${vehicle.fleet.id}`} className="text-blue-600 hover:underline">
                          {vehicle.fleet.name}
                        </Link>
                      ) : null
                    }
                  />
                  <Field label="Status" value={<Badge text={vehicle.status} colourMap={VEHICLE_STATUS_COLOURS} />} />
                  <Field label="Tag Status" value={vehicle.tagStatus ? vehicle.tagStatus.replace(/_/g, ' ') : null} />
                  <Field label="Ownership Type" value={vehicle.ownershipType} />
                  {vehicle.leaseExpiry && <Field label="Lease Expiry" value={formatDate(vehicle.leaseExpiry)} />}
                </dl>
              </div>

              {/* Insurance card */}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-800">Insurance</h2>
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Provider" value={vehicle.insuranceProvider} />
                  <Field label="Policy Number" value={vehicle.policyNumber} />
                  <Field
                    label="Insurance Expiry"
                    value={
                      insuranceExp.className ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${insuranceExp.className}`}>
                          {insuranceExp.label}
                        </span>
                      ) : (
                        insuranceExp.label
                      )
                    }
                  />
                </dl>
              </div>

              {/* Licence disc card */}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-800">Licence Disc</h2>
                <dl className="grid grid-cols-2 gap-4">
                  <Field
                    label="Licence Disc Expiry"
                    value={
                      licenceExp.className ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${licenceExp.className}`}>
                          {licenceExp.label}
                        </span>
                      ) : (
                        licenceExp.label
                      )
                    }
                  />
                </dl>
              </div>
            </div>

            {/* Right column — quick links / recent maintenance */}
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-gray-800">Quick Links</h2>
                <div className="flex flex-col gap-2 text-sm">
                  <Link href={`/repairs/new?vehicleId=${id}`} className="text-blue-600 hover:underline">
                    Log Repair
                  </Link>
                  <Link href={`/fuel-transactions?vehicleId=${id}`} className="text-blue-600 hover:underline">
                    View Fuel Transactions
                  </Link>
                  {vehicle.fleet && (
                    <Link href={`/fleets/${vehicle.fleet.id}`} className="text-blue-600 hover:underline">
                      Fleet: {vehicle.fleet.name}
                    </Link>
                  )}
                </div>
              </div>

              {/* Recent maintenance from the included relation */}
              {vehicle.maintenanceRecords && vehicle.maintenanceRecords.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-gray-800">Recent Maintenance</h2>
                  <div className="space-y-2">
                    {vehicle.maintenanceRecords.slice(0, 5).map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium text-gray-900">{m.serviceType.replace(/_/g, ' ')}</span>
                          <span className="ml-2 text-gray-400">{formatDate(m.serviceDate)}</span>
                        </div>
                        <Badge text={m.status} colourMap={MAINTENANCE_STATUS_COLOURS} />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setTab('Maintenance')}
                    className="mt-3 text-xs text-blue-600 hover:underline"
                  >
                    View all maintenance
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 2 — Fuel History                                            */}
        {/* ================================================================ */}
        {tab === 'Fuel History' && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {fuelQuery.isLoading ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading fuel history...</div>
            ) : fuelQuery.isError ? (
              <div className="p-4 text-sm text-red-600">Failed to load fuel history.</div>
            ) : (fuelQuery.data?.data ?? []).length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">No fuel transactions found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Date', 'Litres', 'Total Amount', 'Fuel Type', 'Driver', 'Site'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(fuelQuery.data?.data ?? []).map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{formatDate(tx.transactionDate)}</td>
                        <td className="px-4 py-3 text-gray-700">{parseFloat(tx.litres).toFixed(2)} L</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{formatZAR(parseFloat(tx.totalAmount))}</td>
                        <td className="px-4 py-3 text-gray-500 capitalize">{tx.fuelType}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {tx.driver ? `${tx.driver.firstName} ${tx.driver.lastName}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{tx.siteName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 3 — Maintenance                                             */}
        {/* ================================================================ */}
        {tab === 'Maintenance' && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {maintenanceQuery.isLoading ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading maintenance records...</div>
            ) : maintenanceQuery.isError ? (
              <div className="p-4 text-sm text-red-600">Failed to load maintenance records.</div>
            ) : (maintenanceQuery.data?.data ?? []).length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">No maintenance records found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Date', 'Type', 'Description', 'Cost', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(maintenanceQuery.data?.data ?? []).map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{formatDate(m.serviceDate)}</td>
                        <td className="px-4 py-3 text-gray-700 capitalize">{m.serviceType.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-gray-500">{m.description ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{m.cost ? formatZAR(parseFloat(m.cost)) : '—'}</td>
                        <td className="px-4 py-3">
                          <Badge text={m.status} colourMap={MAINTENANCE_STATUS_COLOURS} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 4 — Repairs                                                 */}
        {/* ================================================================ */}
        {tab === 'Repairs' && (
          <div>
            <div className="mb-4 flex justify-end">
              <Link
                href={`/repairs/new?vehicleId=${id}`}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Log Repair
              </Link>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              {repairsQuery.isLoading ? (
                <div className="py-16 text-center text-sm text-gray-400">Loading repairs...</div>
              ) : repairsQuery.isError ? (
                <div className="p-4 text-sm text-red-600">Failed to load repairs.</div>
              ) : (repairsQuery.data?.data ?? []).length === 0 ? (
                <div className="py-16 text-center text-sm text-gray-400">No repairs found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Repair Number', 'Type', 'Priority', 'Status', 'Cost'].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(repairsQuery.data?.data ?? []).map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/repairs/${r.id}`}>
                          <td className="px-4 py-3">
                            <span className="font-medium text-blue-600">{r.repairNumber}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 capitalize">{r.repairType.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3">
                            <Badge text={r.priority} colourMap={PRIORITY_COLOURS} />
                          </td>
                          <td className="px-4 py-3">
                            <Badge text={r.status} colourMap={REPAIR_STATUS_COLOURS} />
                          </td>
                          <td className="px-4 py-3 text-gray-900 font-medium">
                            {r.totalCost ? formatZAR(parseFloat(r.totalCost)) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 5 — Incidents                                               */}
        {/* ================================================================ */}
        {tab === 'Incidents' && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {incidentsQuery.isLoading ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading incidents...</div>
            ) : incidentsQuery.isError ? (
              <div className="p-4 text-sm text-red-600">Failed to load incidents.</div>
            ) : (incidentsQuery.data?.data ?? []).length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">No incidents found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Date', 'Type', 'Severity', 'Status', 'Description'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(incidentsQuery.data?.data ?? []).map((inc) => (
                      <tr
                        key={inc.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => window.location.href = `/incidents/${inc.id}`}
                      >
                        <td className="px-4 py-3 text-gray-700">{formatDate(inc.incidentDate)}</td>
                        <td className="px-4 py-3 text-gray-700 capitalize">{inc.incidentType.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3">
                          <Badge text={inc.severity} colourMap={SEVERITY_COLOURS} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge text={inc.status} colourMap={INCIDENT_STATUS_COLOURS} />
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{inc.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 6 — Contracts                                               */}
        {/* ================================================================ */}
        {tab === 'Contracts' && (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {contractsQuery.isLoading ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading contracts...</div>
            ) : contractsQuery.isError ? (
              <div className="p-4 text-sm text-red-600">Failed to load contracts.</div>
            ) : (contractsQuery.data?.data ?? []).length === 0 ? (
              <div className="py-16 text-center text-sm text-gray-400">No contracts found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Type', 'Start Date', 'End Date', 'Status', 'Monthly Amount'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(contractsQuery.data?.data ?? []).map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => window.location.href = `/contracts/${c.id}`}
                      >
                        <td className="px-4 py-3 text-gray-700 capitalize">{c.contractType.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-gray-700">{formatDate(c.startDate)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatDate(c.endDate)}</td>
                        <td className="px-4 py-3">
                          <Badge text={c.status} colourMap={CONTRACT_STATUS_COLOURS} />
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {c.monthlyAmount ? formatZAR(parseFloat(c.monthlyAmount)) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 7 — Equipment                                               */}
        {/* ================================================================ */}
        {tab === 'Equipment' && (
          <div>
            {equipmentQuery.isLoading ? (
              <div className="py-16 text-center text-sm text-gray-400">Loading equipment...</div>
            ) : equipmentQuery.isError ? (
              <div className="p-4 text-sm text-red-600">Failed to load equipment.</div>
            ) : (equipmentQuery.data?.data ?? []).length === 0 ? (
              <div className="py-16 text-center">
                <p className="mb-4 text-sm text-gray-400">No equipment records found for this vehicle.</p>
                <button
                  onClick={() => equipmentGenerateMutation.mutate()}
                  disabled={equipmentGenerateMutation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {equipmentGenerateMutation.isPending ? 'Generating...' : 'Generate Equipment Checklist'}
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex justify-end">
                  <button
                    onClick={handleEquipmentSave}
                    disabled={!hasEquipmentEdits || equipmentSaveMutation.isPending}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {equipmentSaveMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                {equipmentSaveMutation.isSuccess && (
                  <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                    Equipment updated successfully.
                  </div>
                )}

                {equipmentSaveMutation.isError && (
                  <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    Failed to save equipment changes.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(equipmentQuery.data?.data ?? []).map((item) => {
                    const merged = { ...item, ...equipmentEdits[item.id] };
                    const isEdited = Boolean(equipmentEdits[item.id]);
                    const showExpiry = EQUIPMENT_TYPES_WITH_EXPIRY.includes(item.equipmentType);

                    return (
                      <div
                        key={item.id}
                        className={`rounded-lg border bg-white p-4 shadow-sm ${isEdited ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200'}`}
                      >
                        {/* Header */}
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {formatEquipmentType(item.equipmentType)}
                          </h3>
                          <span
                            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                              EQUIPMENT_STATUS_COLOURS[merged.status] ?? 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {merged.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {/* Status dropdown */}
                        <div className="mb-3">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                          <select
                            value={merged.status}
                            onChange={(e) => updateEquipmentField(item.id, 'status', e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          >
                            {EQUIPMENT_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Expiry date (fire extinguisher and first aid kit only) */}
                        {showExpiry && (
                          <div className="mb-3">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Expiry Date</label>
                            <input
                              type="date"
                              value={merged.expiryDate?.split('T')[0] ?? ''}
                              onChange={(e) =>
                                updateEquipmentField(
                                  item.id,
                                  'expiryDate',
                                  e.target.value || null,
                                )
                              }
                              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        )}

                        {/* Last checked */}
                        {merged.lastChecked && (
                          <div className="mb-2">
                            <span className="text-xs text-gray-500">Last Checked: </span>
                            <span className="text-xs text-gray-700">{formatDate(merged.lastChecked)}</span>
                          </div>
                        )}

                        {/* Notes */}
                        {merged.notes && (
                          <div className="mt-2 rounded bg-gray-50 px-2 py-1.5">
                            <span className="text-xs text-gray-500">Notes: </span>
                            <span className="text-xs text-gray-700">{merged.notes}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 8 — Documents                                               */}
        {/* ================================================================ */}
        {tab === 'Documents' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <DocumentsPanel entityType="vehicle" entityId={id} />
          </div>
        )}

      </div>
    </div>
  );
}
