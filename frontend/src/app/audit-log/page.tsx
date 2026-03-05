'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { api } from '../../lib/api';

interface AuditEntry {
  id: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  description: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditListResponse {
  success: boolean;
  data: AuditEntry[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
    count: number;
  };
}

const ENTITY_TYPES = [
  'vehicle', 'driver', 'fleet', 'fuel_transaction', 'wallet',
  'repair_job', 'maintenance_record', 'incident', 'user',
  'tag', 'document', 'notification_preference',
];

const ACTIONS = [
  'create', 'update', 'delete', 'status_change',
  'login', 'export', 'import', 'assignment', 'bulk_action',
];

const ACTION_COLOURS: Record<string, string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800',
  status_change: 'bg-purple-100 text-purple-800',
  login: 'bg-gray-100 text-gray-700',
  export: 'bg-yellow-100 text-yellow-800',
  import: 'bg-orange-100 text-orange-800',
  assignment: 'bg-indigo-100 text-indigo-800',
  bulk_action: 'bg-pink-100 text-pink-800',
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_COLOURS[action] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

function ChangesDiff({
  changes,
}: {
  changes: Record<string, { old: unknown; new: unknown }>;
}) {
  return (
    <tr>
      <td colSpan={7} className="px-4 pb-3 pt-0">
        <div className="rounded border border-gray-200 bg-gray-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Field Changes
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="w-1/4 pb-1 font-medium">Field</th>
                <th className="pb-1 font-medium">Before</th>
                <th className="pb-1 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(changes).map(([field, { old: oldVal, new: newVal }]) => (
                <tr key={field} className="border-t border-gray-200">
                  <td className="py-1 pr-4 font-medium text-gray-700">{field}</td>
                  <td className="py-1 pr-4 text-red-600">
                    {oldVal == null ? (
                      <em className="text-gray-400">empty</em>
                    ) : (
                      String(oldVal)
                    )}
                  </td>
                  <td className="py-1 text-green-700">
                    {newVal == null ? (
                      <em className="text-gray-400">empty</em>
                    ) : (
                      String(newVal)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function buildQuery(filters: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState({
    entityType: '',
    action: '',
    userId: '',
    startDate: '',
    endDate: '',
  });
  const [applied, setApplied] = useState(filters);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<AuditListResponse>({
    queryKey: ['audit-log', applied],
    queryFn: () => api.get<AuditListResponse>(`/audit-log${buildQuery(applied)}`),
  });

  const handleApply = useCallback(() => setApplied({ ...filters }), [filters]);

  const handleClear = useCallback(() => {
    const empty = { entityType: '', action: '', userId: '', startDate: '', endDate: '' };
    setFilters(empty);
    setApplied(empty);
  }, []);

  const handleExport = useCallback(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const qs = buildQuery(applied);
    const base = 'http://localhost:3001/api/v1/audit-log/export';
    const url = token
      ? `${base}${qs}${qs ? '&' : '?'}_token=${token}`
      : `${base}${qs}`;
    window.open(url, '_blank');
  }, [applied]);

  const entries = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Audit Trail</h1>
            <p className="mt-1 text-sm text-gray-500">
              Immutable record of every change in the system
            </p>
          </div>
          <button
            onClick={handleExport}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Entity Type
              </label>
              <select
                value={filters.entityType}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, entityType: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">All types</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Action
              </label>
              <select
                value={filters.action}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, action: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">All actions</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                User ID
              </label>
              <input
                type="text"
                placeholder="User ID…"
                value={filters.userId}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, userId: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                From date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, startDate: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                To date
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, endDate: e.target.value }))
                }
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleApply}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Apply
            </button>
            <button
              onClick={handleClear}
              className="rounded-md px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              Loading…
            </div>
          )}

          {isError && (
            <div className="flex items-center justify-center py-12">
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Failed to load audit logs. Ensure you are authenticated.
              </div>
            </div>
          )}

          {!isLoading && !isError && entries.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              No audit entries found.
            </div>
          )}

          {!isLoading && !isError && entries.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Timestamp', 'User', 'Action', 'Entity Type', 'Description', 'IP Address', 'Changes'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {entries.map((entry) => {
                  const hasChanges =
                    entry.changes != null && Object.keys(entry.changes).length > 0;
                  const isExpanded = expandedId === entry.id;

                  return [
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                        {new Date(entry.createdAt).toLocaleString('en-ZA', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{entry.userName}</p>
                        {entry.userEmail && (
                          <p className="text-xs text-gray-400">{entry.userEmail}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ActionBadge action={entry.action} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {entry.entityType.replace(/_/g, ' ')}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-gray-600">
                        {entry.description ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {entry.ipAddress ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {hasChanges ? (
                          <button
                            onClick={() =>
                              setExpandedId(isExpanded ? null : entry.id)
                            }
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {isExpanded
                              ? 'Hide'
                              : `${Object.keys(entry.changes!).length} field(s)`}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>,
                    isExpanded && hasChanges ? (
                      <ChangesDiff key={`${entry.id}-diff`} changes={entry.changes!} />
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          )}

          {data?.meta?.hasMore && (
            <div className="flex justify-center border-t border-gray-100 py-3">
              <p className="text-xs text-gray-400">
                Showing {entries.length} entries — more available. Narrow your filters to see
                specific results.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
