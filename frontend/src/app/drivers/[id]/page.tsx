'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
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

interface DriverDetail {
  id: string;
  firstName: string;
  lastName: string;
  saIdNumber: string | null;
  passportNumber: string | null;
  mobileNumber: string;
  email: string | null;
  driverPin: string;
  licenceNumber: string | null;
  licenceCode: string | null;
  licenceExpiry: string | null;
  prdpNumber: string | null;
  prdpExpiry: string | null;
  status: string;
  dailySpendLimit: string | null;
  monthlySpendLimit: string | null;
  createdAt: string;
  updatedAt: string;
  fleet: Fleet;
}

interface FuelTransaction {
  id: string;
  transactionDate: string;
  litres: string;
  totalAmount: string;
  fuelType: string;
  siteName: string | null;
  vehicle: { id: string; registrationNumber: string } | null;
}

interface IncidentRow {
  id: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  status: string;
  vehicle: { id: string; registrationNumber: string } | null;
}

interface RepairRow {
  id: string;
  repairNumber: string;
  repairType: string;
  status: string;
  totalCost: string | null;
  vehicle: { id: string; registrationNumber: string } | null;
}

// ---------------------------------------------------------------------------
// Colour maps
// ---------------------------------------------------------------------------

const DRIVER_STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  suspended: 'bg-red-100 text-red-700',
};

const INCIDENT_STATUS_COLOURS: Record<string, string> = {
  reported: 'bg-yellow-100 text-yellow-800',
  under_investigation: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-600',
};

const SEVERITY_COLOURS: Record<string, string> = {
  minor: 'bg-gray-100 text-gray-700',
  moderate: 'bg-blue-100 text-blue-800',
  major: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? '\u2014'}</dd>
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

/** Mask SA ID: show last 4 digits only, e.g. "**********1234" */
function maskSaId(idNumber: string | null | undefined): string {
  if (!idNumber) return '\u2014';
  if (idNumber.length <= 4) return idNumber;
  return '*'.repeat(idNumber.length - 4) + idNumber.slice(-4);
}

/** Mask driver PIN: show asterisks */
function maskPin(pin: string | null | undefined): string {
  if (!pin) return '\u2014';
  return '*'.repeat(pin.length);
}

/** Returns a colour class for expiry dates: green >60d, orange 14-60d, red <14d or past */
function expiryBadge(dateStr: string | null | undefined): { label: string; className: string } {
  if (!dateStr) return { label: '\u2014', className: '' };
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

/** Calculate days until expiry. Returns null if no date provided. */
function daysUntilExpiry(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const now = new Date();
  const expiry = new Date(dateStr);
  return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = ['Overview', 'Fuel History', 'Incidents', 'Repairs', 'Compliance', 'Spend', 'Documents'] as const;
type Tab = (typeof TABS)[number];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DriverDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<Tab>('Overview');

  // -- Main driver data ----------------------------------------------------
  const { data, isLoading, isError } = useQuery<{ success: boolean; data: DriverDetail }>({
    queryKey: ['driver', id],
    queryFn: () => api.get(`/drivers/${id}`),
    enabled: Boolean(id),
  });

  // -- Fuel transactions ---------------------------------------------------
  const fuelQuery = useQuery<{ success: boolean; data: FuelTransaction[] }>({
    queryKey: ['driver-fuel', id],
    queryFn: () => api.get(`/fuel-transactions?driverId=${id}`),
    enabled: (tab === 'Fuel History' || tab === 'Spend') && Boolean(id),
  });

  // -- Incidents -----------------------------------------------------------
  const incidentsQuery = useQuery<{ success: boolean; data: IncidentRow[] }>({
    queryKey: ['driver-incidents', id],
    queryFn: () => api.get(`/incidents?driverId=${id}`),
    enabled: tab === 'Incidents' && Boolean(id),
  });

  // -- Repairs -------------------------------------------------------------
  const repairsQuery = useQuery<{ success: boolean; data: RepairRow[] }>({
    queryKey: ['driver-repairs', id],
    queryFn: () => api.get(`/repairs?driverId=${id}`),
    enabled: tab === 'Repairs' && Boolean(id),
  });

  // -- Loading / error states ----------------------------------------------
  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading...</div>;
  }

  if (isError || !data?.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load driver.
        </div>
      </div>
    );
  }

  const driver = data.data;

  const licenceExp = expiryBadge(driver.licenceExpiry);
  const prdpExp = expiryBadge(driver.prdpExpiry);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/drivers" className="hover:text-blue-600">Drivers</Link>
          <span>/</span>
          <span className="text-gray-900">{driver.firstName} {driver.lastName}</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900">
                {driver.firstName} {driver.lastName}
              </h1>
              <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${DRIVER_STATUS_COLOURS[driver.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {driver.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {driver.fleet?.name}{driver.mobileNumber ? ` \u00b7 ${driver.mobileNumber}` : ''}
            </p>
          </div>
          <Link
            href={`/drivers/${id}/edit`}
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
        {/*  TAB 1 -- Overview                                               */}
        {/* ================================================================ */}
        {tab === 'Overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left column */}
            <div className="col-span-2 space-y-6">
              {/* Personal Details */}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-800">Personal Details</h2>
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="First Name" value={driver.firstName} />
                  <Field label="Last Name" value={driver.lastName} />
                  <Field label="SA ID" value={maskSaId(driver.saIdNumber)} />
                  <Field label="Passport" value={driver.passportNumber} />
                  <Field label="Mobile" value={driver.mobileNumber} />
                  <Field label="Email" value={driver.email} />
                </dl>
              </div>

              {/* Licence Details */}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-800">Licence Details</h2>
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="Licence Number" value={driver.licenceNumber} />
                  <Field label="Code" value={driver.licenceCode} />
                  <Field
                    label="Licence Expiry"
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
                  <Field label="PrDP Number" value={driver.prdpNumber} />
                  <Field
                    label="PrDP Expiry"
                    value={
                      prdpExp.className ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${prdpExp.className}`}>
                          {prdpExp.label}
                        </span>
                      ) : (
                        prdpExp.label
                      )
                    }
                  />
                </dl>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Assignment */}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-800">Assignment</h2>
                <dl className="space-y-3">
                  <Field
                    label="Fleet"
                    value={
                      driver.fleet ? (
                        <Link href={`/fleets/${driver.fleet.id}`} className="text-blue-600 hover:underline">
                          {driver.fleet.name}
                        </Link>
                      ) : null
                    }
                  />
                  <Field label="Driver PIN" value={maskPin(driver.driverPin)} />
                </dl>
              </div>

              {/* Spend Limits */}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-800">Spend Limits</h2>
                <dl className="space-y-3">
                  <Field
                    label="Daily Limit"
                    value={driver.dailySpendLimit ? formatZAR(parseFloat(driver.dailySpendLimit)) : '\u2014'}
                  />
                  <Field
                    label="Monthly Limit"
                    value={driver.monthlySpendLimit ? formatZAR(parseFloat(driver.monthlySpendLimit)) : '\u2014'}
                  />
                </dl>
              </div>

              {/* Quick Links */}
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-gray-800">Quick Links</h2>
                <div className="flex flex-col gap-2 text-sm">
                  <Link href={`/fuel-transactions?driverId=${id}`} className="text-blue-600 hover:underline">
                    View Fuel Transactions
                  </Link>
                  {driver.fleet && (
                    <Link href={`/fleets/${driver.fleet.id}`} className="text-blue-600 hover:underline">
                      Fleet: {driver.fleet.name}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 2 -- Fuel History                                           */}
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
                      {['Date', 'Vehicle', 'Litres', 'Amount', 'Fuel Type', 'Site'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(fuelQuery.data?.data ?? []).map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{formatDate(tx.transactionDate)}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {tx.vehicle ? (
                            <Link href={`/vehicles/${tx.vehicle.id}`} className="text-blue-600 hover:underline">
                              {tx.vehicle.registrationNumber}
                            </Link>
                          ) : '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{parseFloat(tx.litres).toFixed(2)} L</td>
                        <td className="px-4 py-3 text-gray-900 font-medium">{formatZAR(parseFloat(tx.totalAmount))}</td>
                        <td className="px-4 py-3 text-gray-500 capitalize">{tx.fuelType}</td>
                        <td className="px-4 py-3 text-gray-500">{tx.siteName ?? '\u2014'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/*  TAB 3 -- Incidents                                              */}
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
                      {['Date', 'Vehicle', 'Type', 'Severity', 'Status'].map((h) => (
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
                        <td className="px-4 py-3 text-gray-700">
                          {inc.vehicle?.registrationNumber ?? '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 capitalize">{inc.incidentType.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3">
                          <Badge text={inc.severity} colourMap={SEVERITY_COLOURS} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge text={inc.status} colourMap={INCIDENT_STATUS_COLOURS} />
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
        {/*  TAB 4 -- Repairs                                                */}
        {/* ================================================================ */}
        {tab === 'Repairs' && (
          <div>
            <div className="mb-4 flex justify-end">
              <Link
                href={`/repairs/new?driverId=${id}`}
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
                        {['Repair Number', 'Vehicle', 'Type', 'Status', 'Cost'].map((h) => (
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
                          <td className="px-4 py-3 text-gray-700">
                            {r.vehicle?.registrationNumber ?? '\u2014'}
                          </td>
                          <td className="px-4 py-3 text-gray-700 capitalize">{r.repairType.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3">
                            <Badge text={r.status} colourMap={REPAIR_STATUS_COLOURS} />
                          </td>
                          <td className="px-4 py-3 text-gray-900 font-medium">
                            {r.totalCost ? formatZAR(parseFloat(r.totalCost)) : '\u2014'}
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
        {/*  TAB 5 -- Compliance                                             */}
        {/* ================================================================ */}
        {tab === 'Compliance' && <ComplianceTab driver={driver} />}

        {/* ================================================================ */}
        {/*  TAB 6 -- Spend                                                  */}
        {/* ================================================================ */}
        {tab === 'Spend' && <SpendTab driver={driver} fuelData={fuelQuery.data?.data ?? []} fuelLoading={fuelQuery.isLoading} />}

        {/* ================================================================ */}
        {/*  TAB 7 -- Documents                                              */}
        {/* ================================================================ */}
        {tab === 'Documents' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <DocumentsPanel entityType="driver" entityId={id} />
          </div>
        )}

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance Tab (extracted for readability)
// ---------------------------------------------------------------------------

function ComplianceTab({ driver }: { driver: DriverDetail }) {
  const licenceDays = daysUntilExpiry(driver.licenceExpiry);
  const prdpDays = daysUntilExpiry(driver.prdpExpiry);

  function complianceStatus(days: number | null): { label: string; colour: string } {
    if (days === null) return { label: 'Unknown', colour: 'text-gray-500' };
    if (days < 0) return { label: 'Expired', colour: 'text-red-600' };
    if (days < 14) return { label: 'Critical', colour: 'text-red-600' };
    if (days <= 60) return { label: 'Warning', colour: 'text-orange-600' };
    return { label: 'Compliant', colour: 'text-green-600' };
  }

  function progressPercentage(days: number | null, maxDays: number = 365): number {
    if (days === null || days < 0) return 0;
    return Math.min(100, Math.round((days / maxDays) * 100));
  }

  function progressBarColour(days: number | null): string {
    if (days === null || days < 0) return 'bg-red-500';
    if (days < 14) return 'bg-red-500';
    if (days <= 60) return 'bg-orange-500';
    return 'bg-green-500';
  }

  const licenceStatus = complianceStatus(licenceDays);
  const prdpStatus = complianceStatus(prdpDays);

  // Overall compliance
  const overallStatuses = [licenceStatus.label, prdpStatus.label];
  let overallLabel = 'Compliant';
  let overallColour = 'bg-green-100 text-green-800';
  if (overallStatuses.includes('Expired') || overallStatuses.includes('Critical')) {
    overallLabel = 'Non-Compliant';
    overallColour = 'bg-red-100 text-red-800';
  } else if (overallStatuses.includes('Warning')) {
    overallLabel = 'Warning';
    overallColour = 'bg-orange-100 text-orange-800';
  } else if (overallStatuses.includes('Unknown')) {
    overallLabel = 'Incomplete';
    overallColour = 'bg-gray-100 text-gray-600';
  }

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Overall Compliance</h2>
          <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${overallColour}`}>
            {overallLabel}
          </span>
        </div>
      </div>

      {/* Licence Status */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Driving Licence</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {driver.licenceNumber ? `${driver.licenceCode ?? ''} - ${driver.licenceNumber}` : 'No licence on file'}
            </span>
            <span className={`text-sm font-medium ${licenceStatus.colour}`}>
              {licenceStatus.label}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {driver.licenceExpiry ? `Expires: ${formatDate(driver.licenceExpiry)}` : 'No expiry date'}
            </span>
            <span>
              {licenceDays !== null
                ? licenceDays < 0
                  ? `Expired ${Math.abs(licenceDays)} day(s) ago`
                  : `${licenceDays} day(s) remaining`
                : ''}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all ${progressBarColour(licenceDays)}`}
              style={{ width: `${progressPercentage(licenceDays)}%` }}
            />
          </div>
        </div>
      </div>

      {/* PrDP Status */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">PrDP (Professional Driving Permit)</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {driver.prdpNumber ?? 'No PrDP on file'}
            </span>
            <span className={`text-sm font-medium ${prdpStatus.colour}`}>
              {prdpStatus.label}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {driver.prdpExpiry ? `Expires: ${formatDate(driver.prdpExpiry)}` : 'No expiry date'}
            </span>
            <span>
              {prdpDays !== null
                ? prdpDays < 0
                  ? `Expired ${Math.abs(prdpDays)} day(s) ago`
                  : `${prdpDays} day(s) remaining`
                : ''}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all ${progressBarColour(prdpDays)}`}
              style={{ width: `${progressPercentage(prdpDays)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spend Tab (extracted for readability)
// ---------------------------------------------------------------------------

function SpendTab({
  driver,
  fuelData,
  fuelLoading,
}: {
  driver: DriverDetail;
  fuelData: FuelTransaction[];
  fuelLoading: boolean;
}) {
  // Calculate current month totals
  const { dailyTotal, monthlyTotal } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let daily = 0;
    let monthly = 0;

    for (const tx of fuelData) {
      const txDate = new Date(tx.transactionDate);
      const amount = parseFloat(tx.totalAmount) || 0;

      if (txDate >= monthStart) {
        monthly += amount;
      }
      if (txDate >= todayStart) {
        daily += amount;
      }
    }

    return { dailyTotal: daily, monthlyTotal: monthly };
  }, [fuelData]);

  const dailyLimit = driver.dailySpendLimit ? parseFloat(driver.dailySpendLimit) : null;
  const monthlyLimit = driver.monthlySpendLimit ? parseFloat(driver.monthlySpendLimit) : null;

  function spendPercentage(spent: number, limit: number | null): number {
    if (!limit || limit <= 0) return 0;
    return Math.min(100, Math.round((spent / limit) * 100));
  }

  function spendBarColour(spent: number, limit: number | null): string {
    if (!limit || limit <= 0) return 'bg-gray-400';
    const pct = (spent / limit) * 100;
    if (pct >= 100) return 'bg-red-500';
    if (pct >= 80) return 'bg-orange-500';
    return 'bg-blue-500';
  }

  if (fuelLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">Loading spend data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Daily Spend */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Daily Spend</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Today&apos;s spend</span>
            <span className="text-sm font-medium text-gray-900">{formatZAR(dailyTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Limit: {dailyLimit ? formatZAR(dailyLimit) : 'Not set'}</span>
            <span>
              {dailyLimit
                ? `${spendPercentage(dailyTotal, dailyLimit)}% used`
                : ''}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all ${spendBarColour(dailyTotal, dailyLimit)}`}
              style={{ width: `${dailyLimit ? spendPercentage(dailyTotal, dailyLimit) : 0}%` }}
            />
          </div>
          {dailyLimit && dailyTotal >= dailyLimit && (
            <p className="text-xs font-medium text-red-600">Daily spend limit exceeded</p>
          )}
        </div>
      </div>

      {/* Monthly Spend */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Monthly Spend</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">This month&apos;s spend</span>
            <span className="text-sm font-medium text-gray-900">{formatZAR(monthlyTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Limit: {monthlyLimit ? formatZAR(monthlyLimit) : 'Not set'}</span>
            <span>
              {monthlyLimit
                ? `${spendPercentage(monthlyTotal, monthlyLimit)}% used`
                : ''}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full transition-all ${spendBarColour(monthlyTotal, monthlyLimit)}`}
              style={{ width: `${monthlyLimit ? spendPercentage(monthlyTotal, monthlyLimit) : 0}%` }}
            />
          </div>
          {monthlyLimit && monthlyTotal >= monthlyLimit && (
            <p className="text-xs font-medium text-red-600">Monthly spend limit exceeded</p>
          )}
        </div>
      </div>

      {/* Remaining budgets summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-800">Budget Summary</h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Daily Remaining</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {dailyLimit ? formatZAR(Math.max(0, dailyLimit - dailyTotal)) : '\u2014'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Monthly Remaining</dt>
            <dd className="mt-1 text-sm font-medium text-gray-900">
              {monthlyLimit ? formatZAR(Math.max(0, monthlyLimit - monthlyTotal)) : '\u2014'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Transactions This Month</dt>
            <dd className="mt-1 text-sm text-gray-900">{fuelData.length}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
