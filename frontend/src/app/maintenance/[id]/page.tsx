'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { DocumentsPanel } from '../../../components/DocumentsPanel';
import { AuditLogPanel } from '../../../components/AuditLogPanel';

interface MaintenanceDetail {
  id: string;
  vehicleId: string;
  fleetId: string;
  maintenanceType: string;
  description: string;
  provider: string | null;
  cost: string | null;
  vatAmount: string | null;
  odometer: number | null;
  serviceDate: string;
  nextServiceDate: string | null;
  nextServiceOdometer: number | null;
  isScheduled: boolean;
  status: string;
  notes: string | null;
  createdAt: string;
  vehicle: { id: string; registrationNumber: string; make: string; model: string; fleetId: string };
  fleet: { id: string; name: string };
}

interface DetailResponse {
  success: boolean;
  data: MaintenanceDetail;
}

const STATUS_COLOURS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-orange-100 text-orange-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
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

const TABS = ['Overview', 'Documents', 'Audit Log'] as const;
type Tab = (typeof TABS)[number];

export default function MaintenanceDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<Tab>('Overview');

  const { data, isLoading, isError } = useQuery<DetailResponse>({
    queryKey: ['maintenance', id],
    queryFn: () => api.get<DetailResponse>(`/maintenance/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading…</div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load maintenance record.
        </div>
      </div>
    );
  }

  const r = data.data;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/maintenance" className="hover:text-blue-600">Maintenance</Link>
          <span>›</span>
          <span className="text-gray-900">{r.vehicle.registrationNumber} — {r.maintenanceType.replace(/_/g, ' ')}</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">
                {r.maintenanceType.replace(/_/g, ' ')}
              </h1>
              <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOURS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {r.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {r.vehicle.registrationNumber} — {r.vehicle.make} {r.vehicle.model}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium ${
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

        {tab === 'Overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Main details */}
            <div className="col-span-2 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Service Details</h2>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Type" value={r.maintenanceType.replace(/_/g, ' ')} />
                <Field label="Status" value={r.status.replace(/_/g, ' ')} />
                <Field label="Provider" value={r.provider} />
                <Field label="Cost" value={formatZAR(r.cost)} />
                <Field label="VAT" value={formatZAR(r.vatAmount)} />
                <Field label="Odometer" value={r.odometer ? `${r.odometer.toLocaleString('en-ZA')} km` : null} />
                <Field label="Service Date" value={new Date(r.serviceDate).toLocaleDateString('en-ZA')} />
                <Field
                  label="Next Service Date"
                  value={r.nextServiceDate ? new Date(r.nextServiceDate).toLocaleDateString('en-ZA') : null}
                />
                <Field
                  label="Next Service Odometer"
                  value={r.nextServiceOdometer ? `${r.nextServiceOdometer.toLocaleString('en-ZA')} km` : null}
                />
                <Field label="Scheduled?" value={r.isScheduled ? 'Yes' : 'No'} />
              </dl>
              {r.description && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Description</dt>
                  <p className="text-sm text-gray-900">{r.description}</p>
                </div>
              )}
              {r.notes && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Notes</dt>
                  <p className="text-sm text-gray-900">{r.notes}</p>
                </div>
              )}
            </div>

            {/* Vehicle card */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Vehicle</h2>
              <dl className="space-y-3">
                <Field label="Registration" value={r.vehicle.registrationNumber} />
                <Field label="Make / Model" value={`${r.vehicle.make} ${r.vehicle.model}`} />
                <Field label="Fleet" value={r.fleet?.name} />
              </dl>
              <div className="mt-4 border-t border-gray-100 pt-4">
                <Link
                  href={`/vehicles/${r.vehicleId}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View vehicle →
                </Link>
              </div>
            </div>
          </div>
        )}

        {tab === 'Documents' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <DocumentsPanel entityType="maintenance_record" entityId={id} />
          </div>
        )}

        {tab === 'Audit Log' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <AuditLogPanel entityType="maintenance_record" entityId={id} />
          </div>
        )}
      </div>
    </div>
  );
}
