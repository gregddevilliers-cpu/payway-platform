'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { formatZAR } from '../../../lib/utils';
import { DocumentsPanel } from '../../../components/DocumentsPanel';

interface LineItem { description: string; quantity: number; unitPrice: number; total: number }
interface RepairQuote {
  id: string;
  quoteNumber: string | null;
  status: string;
  totalInclVat: string;
  totalExclVat: string;
  vatAmount: string;
  labourTotal: string;
  partsTotal: string;
  estimatedDays: number | null;
  warrantyMonths: number | null;
  validUntil: string | null;
  lineItems: LineItem[];
  repairProvider: { id: string; name: string };
  createdAt: string;
}
interface WorkLog {
  id: string;
  userId: string;
  note: string;
  createdAt: string;
  partsReplaced: Array<{ partName: string; partNumber?: string; cost?: number }> | null;
}
interface RepairDetail {
  id: string;
  repairNumber: string;
  repairType: string;
  priority: string;
  status: string;
  description: string;
  diagnosisNotes: string | null;
  odometerAtReport: number | null;
  isDrivable: boolean;
  estimatedCompletion: string | null;
  actualCompletion: string | null;
  totalCost: string | null;
  labourCost: string | null;
  partsCost: string | null;
  towingCost: string | null;
  vatAmount: string | null;
  warrantyMonths: number | null;
  warrantyExpiry: string | null;
  downtimeDays: number | null;
  cancellationReason: string | null;
  createdAt: string;
  vehicle: { id: string; registrationNumber: string; make: string; model: string; year: number };
  driver: { id: string; firstName: string; lastName: string } | null;
  fleet: { id: string; name: string };
  repairProvider: { id: string; name: string; contactPhone: string } | null;
  repairQuotes: RepairQuote[];
  workLogs: WorkLog[];
}

const STATUS_COLOURS: Record<string, string> = {
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

const STATUS_FLOW = ['reported', 'assessed', 'quoted', 'in_progress', 'quality_check', 'completed'];

const VALID_NEXT: Record<string, string[]> = {
  reported: ['assessed', 'cancelled'],
  assessed: ['quoted', 'cancelled'],
  quoted: ['in_progress', 'cancelled'],
  in_progress: ['quality_check', 'cancelled'],
  quality_check: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

const TABS = ['Overview', 'Quotes', 'Work Log', 'Costs', 'Documents'] as const;
type Tab = (typeof TABS)[number];

export default function RepairDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Overview');
  const [newNote, setNewNote] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [pendingStatus, setPendingStatus] = useState('');

  const { data, isLoading, isError } = useQuery<{ success: boolean; data: RepairDetail }>({
    queryKey: ['repair', id],
    queryFn: () => api.get(`/repairs/${id}`),
    enabled: Boolean(id),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patch(`/repairs/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repair', id] });
      setPendingStatus('');
      setCancellationReason('');
      setStatusNote('');
    },
  });

  const quoteMutation = useMutation({
    mutationFn: ({ quoteId, action }: { quoteId: string; action: 'approved' | 'rejected' }) =>
      api.patch(`/repairs/${id}/quotes/${quoteId}`, { status: action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repair', id] }),
  });

  const workLogMutation = useMutation({
    mutationFn: (note: string) => api.post(`/repairs/${id}/work-log`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['repair', id] });
      setNewNote('');
    },
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading…</div>;
  }
  if (isError || !data?.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load repair.</div>
      </div>
    );
  }

  const repair = data.data;
  const nextStatuses = VALID_NEXT[repair.status] ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/repairs" className="hover:text-blue-600">Repairs</Link>
          <span>›</span>
          <span className="text-gray-900">{repair.repairNumber}</span>
        </div>

        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900">{repair.repairNumber}</h1>
              <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOURS[repair.status] ?? 'bg-gray-100'}`}>
                {repair.status.replace(/_/g, ' ')}
              </span>
              <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLOURS[repair.priority] ?? 'bg-gray-100'}`}>
                {repair.priority}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {repair.vehicle.registrationNumber} — {repair.repairType.replace(/_/g, ' ')} — Logged {new Date(repair.createdAt).toLocaleDateString('en-ZA')}
            </p>
          </div>

          {/* Status transition */}
          {nextStatuses.length > 0 && (
            <div className="flex items-center gap-2">
              {pendingStatus === 'cancelled' ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="Reason for cancellation"
                    className="w-48 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                  <button
                    onClick={() => statusMutation.mutate({ status: 'cancelled', cancellationReason })}
                    disabled={!cancellationReason.trim() || statusMutation.isPending}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                    Confirm Cancel
                  </button>
                  <button onClick={() => setPendingStatus('')}
                    className="rounded-md px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100">✕</button>
                </div>
              ) : (
                <>
                  {nextStatuses.filter((s) => s !== 'cancelled').map((s) => (
                    <button key={s}
                      onClick={() => statusMutation.mutate({ status: s })}
                      disabled={statusMutation.isPending}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      → {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                  {nextStatuses.includes('cancelled') && (
                    <button onClick={() => setPendingStatus('cancelled')}
                      className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
                      Cancel repair
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Status timeline */}
        <div className="mb-6 flex items-center gap-1 overflow-x-auto pb-1">
          {STATUS_FLOW.map((s, i) => {
            const idx = STATUS_FLOW.indexOf(repair.status);
            const done = i < idx || repair.status === s;
            const current = repair.status === s;
            return (
              <div key={s} className="flex items-center gap-1">
                <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                  current ? 'bg-blue-600 text-white' : done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  {done && !current && '✓ '}{s.replace(/_/g, ' ')}
                </div>
                {i < STATUS_FLOW.length - 1 && <div className="h-px w-4 bg-gray-200 flex-shrink-0" />}
              </div>
            );
          })}
          {repair.status === 'cancelled' && (
            <div className="flex items-center gap-1">
              <div className="h-px w-4 bg-gray-200" />
              <div className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">cancelled</div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`pb-3 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                {t}
                {t === 'Quotes' && repair.repairQuotes.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs">{repair.repairQuotes.length}</span>
                )}
                {t === 'Work Log' && repair.workLogs.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs">{repair.workLogs.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Overview tab */}
        {tab === 'Overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="col-span-2 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Repair Details</h2>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Type" value={repair.repairType.replace(/_/g, ' ')} />
                <Field label="Priority" value={repair.priority} />
                <Field label="Status" value={repair.status.replace(/_/g, ' ')} />
                <Field label="Drivable" value={repair.isDrivable ? 'Yes' : 'No'} />
                <Field label="Odometer at report" value={repair.odometerAtReport ? `${repair.odometerAtReport.toLocaleString()} km` : null} />
                <Field label="Est. completion" value={repair.estimatedCompletion ? new Date(repair.estimatedCompletion).toLocaleDateString('en-ZA') : null} />
                <Field label="Actual completion" value={repair.actualCompletion ? new Date(repair.actualCompletion).toLocaleDateString('en-ZA') : null} />
                <Field label="Downtime" value={repair.downtimeDays != null ? `${repair.downtimeDays} day(s)` : null} />
                <Field label="Warranty" value={repair.warrantyMonths ? `${repair.warrantyMonths} month(s)` : null} />
                <Field label="Warranty expiry" value={repair.warrantyExpiry ? new Date(repair.warrantyExpiry).toLocaleDateString('en-ZA') : null} />
              </dl>
              <div className="mt-4 border-t border-gray-100 pt-4">
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Description</dt>
                <p className="text-sm text-gray-900">{repair.description}</p>
              </div>
              {repair.diagnosisNotes && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Diagnosis Notes</dt>
                  <p className="text-sm text-gray-900">{repair.diagnosisNotes}</p>
                </div>
              )}
              {repair.cancellationReason && (
                <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-red-600">Cancellation Reason</dt>
                  <p className="text-sm text-red-800">{repair.cancellationReason}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-gray-800">Vehicle</h2>
                <dl className="space-y-2">
                  <Field label="Registration" value={repair.vehicle.registrationNumber} />
                  <Field label="Make / Model" value={`${repair.vehicle.make} ${repair.vehicle.model} (${repair.vehicle.year})`} />
                  <Field label="Fleet" value={repair.fleet?.name} />
                  {repair.driver && <Field label="Driver" value={`${repair.driver.firstName} ${repair.driver.lastName}`} />}
                </dl>
                <div className="mt-3 border-t border-gray-100 pt-3 flex gap-3 text-sm">
                  <Link href={`/vehicles/${repair.vehicle.id}`} className="text-blue-600 hover:underline">Vehicle →</Link>
                  {repair.driver && <Link href={`/drivers/${repair.driver.id}`} className="text-blue-600 hover:underline">Driver →</Link>}
                </div>
              </div>

              {repair.repairProvider && (
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-gray-800">Provider</h2>
                  <dl className="space-y-2">
                    <Field label="Name" value={repair.repairProvider.name} />
                    <Field label="Phone" value={repair.repairProvider.contactPhone} />
                  </dl>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quotes tab */}
        {tab === 'Quotes' && (
          <div className="space-y-4">
            {repair.repairQuotes.length === 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
                No quotes submitted yet.
              </div>
            )}
            {repair.repairQuotes.map((q) => (
              <div key={q.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{q.repairProvider.name}</p>
                    {q.quoteNumber && <p className="text-xs text-gray-400">Quote #{q.quoteNumber}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                      q.status === 'approved' ? 'bg-green-100 text-green-700' :
                      q.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      q.status === 'expired' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-800'
                    }`}>{q.status}</span>
                    {q.status === 'pending' && (
                      <>
                        <button onClick={() => quoteMutation.mutate({ quoteId: q.id, action: 'approved' })}
                          disabled={quoteMutation.isPending}
                          className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50">
                          Approve
                        </button>
                        <button onClick={() => quoteMutation.mutate({ quoteId: q.id, action: 'rejected' })}
                          disabled={quoteMutation.isPending}
                          className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded border border-gray-100">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Description', 'Qty', 'Unit Price', 'Total'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-gray-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(q.lineItems ?? []).map((li, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-gray-700">{li.description}</td>
                          <td className="px-3 py-2 text-gray-600">{li.quantity}</td>
                          <td className="px-3 py-2 text-gray-600">{formatZAR(String(li.unitPrice))}</td>
                          <td className="px-3 py-2 text-gray-900">{formatZAR(String(li.total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex justify-end gap-6 text-xs text-gray-500">
                  <span>Labour: <span className="text-gray-900 font-medium">{formatZAR(q.labourTotal)}</span></span>
                  <span>Parts: <span className="text-gray-900 font-medium">{formatZAR(q.partsTotal)}</span></span>
                  <span>VAT: <span className="text-gray-900 font-medium">{formatZAR(q.vatAmount)}</span></span>
                  <span className="text-base font-semibold text-gray-900">Total: {formatZAR(q.totalInclVat)}</span>
                </div>

                {(q.estimatedDays || q.warrantyMonths || q.validUntil) && (
                  <div className="mt-2 flex gap-4 text-xs text-gray-400">
                    {q.estimatedDays && <span>Est. {q.estimatedDays} days</span>}
                    {q.warrantyMonths && <span>{q.warrantyMonths} month warranty</span>}
                    {q.validUntil && <span>Valid until {new Date(q.validUntil).toLocaleDateString('en-ZA')}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Work Log tab */}
        {tab === 'Work Log' && (
          <div className="space-y-4">
            {/* Add entry form */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <label className="mb-1 block text-sm font-medium text-gray-700">Add update</label>
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)}
                rows={2} placeholder="Note what happened, parts replaced, progress made…"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              <div className="mt-2 flex justify-end">
                <button onClick={() => workLogMutation.mutate(newNote)}
                  disabled={!newNote.trim() || workLogMutation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {workLogMutation.isPending ? 'Saving…' : 'Add Entry'}
                </button>
              </div>
            </div>

            {repair.workLogs.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400">No work log entries yet.</div>
            )}
            {repair.workLogs.map((log) => (
              <div key={log.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString('en-ZA')}</span>
                  <span className="text-xs text-gray-400">User {log.userId.slice(0, 8)}…</span>
                </div>
                <p className="mt-1 text-sm text-gray-900">{log.note}</p>
                {log.partsReplaced && log.partsReplaced.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-500">Parts replaced:</p>
                    <ul className="mt-1 space-y-0.5">
                      {log.partsReplaced.map((p, i) => (
                        <li key={i} className="text-xs text-gray-600">
                          {p.partName}{p.partNumber ? ` (${p.partNumber})` : ''}{p.cost ? ` — ${formatZAR(String(p.cost))}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Costs tab */}
        {tab === 'Costs' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">Cost Breakdown</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {[
                  { label: 'Labour', value: repair.labourCost },
                  { label: 'Parts', value: repair.partsCost },
                  { label: 'Towing', value: repair.towingCost },
                  { label: 'VAT', value: repair.vatAmount },
                ].map(({ label, value }) => (
                  <tr key={label}>
                    <td className="py-2 text-gray-600">{label}</td>
                    <td className="py-2 text-right text-gray-900">{formatZAR(value)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-300">
                  <td className="py-2 font-semibold text-gray-900">Total</td>
                  <td className="py-2 text-right text-lg font-semibold text-gray-900">{formatZAR(repair.totalCost)}</td>
                </tr>
              </tbody>
            </table>

            {repair.repairQuotes.find((q) => q.status === 'approved') && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Approved Quote vs Actual</p>
                {(() => {
                  const aq = repair.repairQuotes.find((q) => q.status === 'approved')!;
                  const quoted = parseFloat(aq.totalInclVat);
                  const actual = repair.totalCost ? parseFloat(repair.totalCost) : null;
                  const diff = actual != null ? actual - quoted : null;
                  return (
                    <div className="flex gap-6 text-sm">
                      <div><span className="text-gray-500">Quoted: </span><span className="font-medium">{formatZAR(aq.totalInclVat)}</span></div>
                      {actual != null && (
                        <>
                          <div><span className="text-gray-500">Actual: </span><span className="font-medium">{formatZAR(String(actual))}</span></div>
                          {diff != null && (
                            <div>
                              <span className="text-gray-500">Variance: </span>
                              <span className={`font-medium ${diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {diff > 0 ? '+' : ''}{formatZAR(String(diff))}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        {/* Documents tab */}
        {tab === 'Documents' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <DocumentsPanel entityType="repair_job" entityId={id} />
          </div>
        )}
      </div>
    </div>
  );
}
