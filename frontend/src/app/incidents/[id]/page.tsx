'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { DocumentsPanel } from '../../../components/DocumentsPanel';
import { AuditLogPanel } from '../../../components/AuditLogPanel';

interface IncidentDetail {
  id: string;
  incidentNumber: string;
  incidentDate: string;
  incidentType: string;
  severity: string;
  status: string;
  description: string;
  location: string | null;
  policeCaseNumber: string | null;
  insuranceClaimNumber: string | null;
  claimStatus: string | null;
  claimAmount: string | null;
  payoutAmount: string | null;
  costEstimate: string | null;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  downtimeDays: number | null;
  thirdPartyInvolved: boolean;
  thirdPartyDetails: string | null;
  notes: string | null;
  createdAt: string;
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
  driver: { id: string; firstName: string; lastName: string } | null;
  fleet: { id: string; name: string };
}

interface DetailResponse {
  success: boolean;
  data: IncidentDetail;
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

function formatZAR(val: string | null | undefined): string {
  if (!val) return '—';
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

const TABS = ['Overview', 'Insurance', 'Documents', 'Audit Log'] as const;
type Tab = (typeof TABS)[number];

export default function IncidentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<Tab>('Overview');

  const { data, isLoading, isError } = useQuery<DetailResponse>({
    queryKey: ['incident', id],
    queryFn: () => api.get<DetailResponse>(`/incidents/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading…</div>;
  }

  if (isError || !data?.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load incident.
        </div>
      </div>
    );
  }

  const inc = data.data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/incidents" className="hover:text-blue-600">Incidents</Link>
          <span>›</span>
          <span className="text-gray-900">{inc.incidentNumber}</span>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{inc.incidentNumber}</h1>
            <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${SEVERITY_COLOURS[inc.severity] ?? 'bg-gray-100'}`}>
              {inc.severity}
            </span>
            <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOURS[inc.status] ?? 'bg-gray-100'}`}>
              {inc.status.replace(/_/g, ' ')}
            </span>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
                  const token = localStorage.getItem('auth_token') ?? '';
                  window.open(`${apiBase}/incidents/${id}/export-pdf?_token=${token}`, '_blank');
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Print
              </button>
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {inc.vehicle.registrationNumber} — {new Date(inc.incidentDate).toLocaleString('en-ZA')}
          </p>
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

        {tab === 'Overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="col-span-2 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Incident Details</h2>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Type" value={inc.incidentType.replace(/_/g, ' ')} />
                <Field label="Severity" value={inc.severity} />
                <Field label="Status" value={inc.status.replace(/_/g, ' ')} />
                <Field label="Date" value={new Date(inc.incidentDate).toLocaleString('en-ZA')} />
                <Field label="Location" value={inc.location} />
                <Field label="Police case #" value={inc.policeCaseNumber} />
                <Field label="Cost estimate" value={formatZAR(inc.costEstimate)} />
                <Field label="Downtime" value={inc.downtimeDays != null ? `${inc.downtimeDays} day(s)` : null} />
                <Field label="Third party" value={inc.thirdPartyInvolved ? 'Yes' : 'No'} />
                {inc.thirdPartyInvolved && <Field label="Third party details" value={inc.thirdPartyDetails} />}
              </dl>
              <div className="mt-4 border-t border-gray-100 pt-4">
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Description</dt>
                <p className="text-sm text-gray-900">{inc.description}</p>
              </div>
              {inc.notes && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Notes</dt>
                  <p className="text-sm text-gray-900">{inc.notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-gray-800">Vehicle & Driver</h2>
                <dl className="space-y-3">
                  <Field label="Vehicle" value={`${inc.vehicle.registrationNumber} — ${inc.vehicle.make} ${inc.vehicle.model}`} />
                  <Field label="Driver" value={inc.driver ? `${inc.driver.firstName} ${inc.driver.lastName}` : null} />
                  <Field label="Fleet" value={inc.fleet?.name} />
                </dl>
                <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3 text-sm">
                  <Link href={`/vehicles/${inc.vehicle.id}`} className="text-blue-600 hover:underline">Vehicle →</Link>
                  {inc.driver && <Link href={`/drivers/${inc.driver.id}`} className="text-blue-600 hover:underline">Driver →</Link>}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'Insurance' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">Insurance & Claim</h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Claim number" value={inc.insuranceClaimNumber} />
              <Field label="Claim status" value={inc.claimStatus ? inc.claimStatus.replace(/_/g, ' ') : null} />
              <Field label="Claim amount" value={formatZAR(inc.claimAmount)} />
              <Field label="Payout amount" value={formatZAR(inc.payoutAmount)} />
              <Field label="Cost estimate" value={formatZAR(inc.costEstimate)} />
            </dl>
          </div>
        )}

        {tab === 'Documents' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <DocumentsPanel entityType="incident" entityId={id} />
          </div>
        )}

        {tab === 'Audit Log' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <AuditLogPanel entityType="incident" entityId={id} />
          </div>
        )}
      </div>
    </div>
  );
}
