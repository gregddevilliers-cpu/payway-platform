'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';

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

interface ApiResponse {
  success: boolean;
  data: AuditEntry[];
}

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
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}
    >
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
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 text-xs">
      <table className="w-full">
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
              <td className="py-1 pr-2 font-medium text-gray-700">{field}</td>
              <td className="py-1 pr-2 text-red-600">
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
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasChanges = entry.changes != null && Object.keys(entry.changes).length > 0;

  return (
    <div className="border-b border-gray-100 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-400" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ActionBadge action={entry.action} />
            <span className="text-sm font-medium text-gray-900">{entry.userName}</span>
            <span className="text-xs text-gray-400">
              {new Date(entry.createdAt).toLocaleString('en-ZA', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>

          {entry.description && (
            <p className="mt-0.5 text-sm text-gray-600">{entry.description}</p>
          )}

          {hasChanges && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 text-xs text-blue-600 hover:underline"
            >
              {expanded
                ? 'Hide changes'
                : `Show ${Object.keys(entry.changes!).length} change(s)`}
            </button>
          )}

          {expanded && entry.changes && <ChangesDiff changes={entry.changes} />}
        </div>
      </div>
    </div>
  );
}

interface AuditLogPanelProps {
  entityType: string;
  entityId: string;
}

export function AuditLogPanel({ entityType, entityId }: AuditLogPanelProps) {
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['audit-log', 'entity', entityType, entityId],
    queryFn: () =>
      api.get<ApiResponse>(
        `/audit-log/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`,
      ),
    enabled: Boolean(entityId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        Loading audit history…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load audit history.
      </div>
    );
  }

  const entries = data?.data ?? [];

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        No audit history for this record.
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-gray-400">{entries.length} event(s)</p>
      {entries.map((entry) => (
        <AuditRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
