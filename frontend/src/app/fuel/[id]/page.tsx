'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { AuditLogPanel } from '../../../components/AuditLogPanel';

interface FuelTransaction {
  id: string;
  transactionDate: string;
  litresFilled: string;
  pricePerLitre: string;
  totalAmount: string;
  fuelType: string;
  odometer: number | null;
  fuelEfficiency: string | null;
  siteCode: string | null;
  siteName: string | null;
  anomalyFlags: Array<{ code: string; severity: string; description: string; resolvedAt?: string | null; resolution?: string | null }>;
  vehicle: { id: string; registrationNumber: string; make: string; model: string; tankCapacity: number | null };
  driver: { id: string; firstName: string; lastName: string } | null;
  fleet: { id: string; name: string } | null;
  efficiency: {
    kpl: number | null;
    l100km: number | null;
    costPerKm: number | null;
    rollingAvgKpl: number | null;
    rollingAvgL100km: number | null;
  };
}

function formatZAR(val: string | number | null | undefined): string {
  if (val == null) return '—';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatKpl(v: number | null): string {
  if (!v) return '—';
  return `${v.toFixed(2)} km/L`;
}

function formatL100(v: number | null): string {
  if (!v) return '—';
  return `${v.toFixed(2)} L/100km`;
}

function efficiencyColour(kpl: number | null): string {
  if (!kpl) return 'text-gray-400';
  if (kpl >= 12) return 'text-green-600';
  if (kpl >= 9) return 'text-blue-600';
  if (kpl >= 6) return 'text-orange-500';
  return 'text-red-600';
}

function efficiencyLabel(kpl: number | null): string {
  if (!kpl) return 'No data';
  if (kpl >= 12) return 'Excellent';
  if (kpl >= 9) return 'Good';
  if (kpl >= 6) return 'Below average';
  return 'Poor';
}

export default function FuelTransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, isLoading, isError } = useQuery<{ success: boolean; data: FuelTransaction }>({
    queryKey: ['fuel-transaction', id],
    queryFn: () => api.get(`/fuel-transactions/${id}`),
  });

  const txn = data?.data;

  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading…</div>;
  if (isError || !txn) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Transaction not found.</div>
    </div>
  );

  const eff = txn.efficiency;
  const colour = efficiencyColour(eff.kpl);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb + header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
              <Link href="/fuel" className="hover:text-gray-700">Fuel</Link>
              <span>/</span>
              <span className="text-gray-900 font-medium">{txn.vehicle.registrationNumber}</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {txn.vehicle.registrationNumber} — {new Date(txn.transactionDate).toLocaleDateString('en-ZA')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {txn.vehicle.make} {txn.vehicle.model} · {txn.fleet?.name ?? 'No fleet'}
            </p>
          </div>
          {txn.anomalyFlags && txn.anomalyFlags.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              ⚠ Anomaly detected
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Left: transaction detail */}
          <div className="lg:col-span-2 space-y-6">

            {/* Transaction details card */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Transaction Details</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <dt className="text-gray-500">Date</dt>
                  <dd className="mt-1 font-medium text-gray-900">{new Date(txn.transactionDate).toLocaleDateString('en-ZA')}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Fuel type</dt>
                  <dd className="mt-1 capitalize font-medium text-gray-900">{txn.fuelType}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Litres filled</dt>
                  <dd className="mt-1 font-medium text-gray-900">{parseFloat(txn.litresFilled).toFixed(2)} L</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Price per litre</dt>
                  <dd className="mt-1 font-medium text-gray-900">{formatZAR(txn.pricePerLitre)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Total amount</dt>
                  <dd className="mt-1 text-lg font-bold text-gray-900">{formatZAR(txn.totalAmount)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Odometer</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {txn.odometer != null ? `${txn.odometer.toLocaleString()} km` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Driver</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {txn.driver ? `${txn.driver.firstName} ${txn.driver.lastName}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Site</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {txn.siteName ?? '—'}{txn.siteCode ? ` (${txn.siteCode})` : ''}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Anomaly flags */}
            {txn.anomalyFlags && txn.anomalyFlags.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <h2 className="mb-2 text-sm font-semibold text-red-700">Anomaly Flags</h2>
                <ul className="space-y-1 text-sm text-red-600">
                  {txn.anomalyFlags.map((flag) => (
                    <li key={flag.code}>• <span className="font-medium">{flag.code.replace(/_/g, ' ')}</span> — {flag.description}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Audit log */}
            <AuditLogPanel entityType="fuel_transaction" entityId={txn.id} />
          </div>

          {/* Right: efficiency card */}
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">Fuel Efficiency</h2>

              <div className="mb-4 text-center">
                <p className={`text-4xl font-bold ${colour}`}>{formatKpl(eff.kpl)}</p>
                <p className={`mt-1 text-sm font-medium ${colour}`}>{efficiencyLabel(eff.kpl)}</p>
                <p className="mt-1 text-xs text-gray-400">{formatL100(eff.l100km)}</p>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex justify-between border-t border-gray-100 pt-3">
                  <dt className="text-gray-500">Cost per km</dt>
                  <dd className="font-medium text-gray-900">
                    {eff.costPerKm ? `R ${eff.costPerKm.toFixed(3)}` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Rolling avg (10 fills)</dt>
                  <dd className={`font-medium ${efficiencyColour(eff.rollingAvgKpl)}`}>
                    {formatKpl(eff.rollingAvgKpl)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Rolling avg L/100km</dt>
                  <dd className="font-medium text-gray-900">{formatL100(eff.rollingAvgL100km)}</dd>
                </div>
              </dl>

              {!eff.kpl && (
                <p className="mt-4 text-xs text-gray-400 text-center">
                  No odometer reading provided — efficiency cannot be calculated.
                </p>
              )}
            </div>

            {/* Vehicle summary */}
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Vehicle</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Reg</dt>
                  <dd className="font-medium text-gray-900">
                    <Link href={`/vehicles/${txn.vehicle.id}`} className="text-blue-600 hover:underline">
                      {txn.vehicle.registrationNumber}
                    </Link>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Make/Model</dt>
                  <dd className="font-medium text-gray-900">{txn.vehicle.make} {txn.vehicle.model}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Tank capacity</dt>
                  <dd className="font-medium text-gray-900">
                    {txn.vehicle.tankCapacity ? `${txn.vehicle.tankCapacity} L` : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
