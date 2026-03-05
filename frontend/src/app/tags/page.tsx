'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTags, useTagSummary, useCreateTag, useBulkTagAction } from '@/hooks/useTags';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { formatDate } from '@/lib/utils';
import type { TagStatus, TagListParams } from '@/types';

const STATUS_OPTIONS: { value: TagStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'lost', label: 'Lost' },
  { value: 'expired', label: 'Expired' },
  { value: 'decommissioned', label: 'Decommissioned' },
];

export default function TagsPage() {
  const [filters, setFilters] = useState<TagListParams>({ page: 1, limit: 50 });
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ tagNumber: '', expiryDate: '', notes: '' });
  const [addError, setAddError] = useState('');

  const { data, isLoading, error } = useTags({ ...filters, search: search || undefined });
  const { data: summary } = useTagSummary();
  const createTag = useCreateTag();
  const bulkAction = useBulkTagAction();

  const tags = data?.data ?? [];
  const meta = data?.meta;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === tags.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(tags.map((t) => t.id)));
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    try {
      await createTag.mutateAsync({
        tagNumber: addForm.tagNumber,
        expiryDate: addForm.expiryDate || undefined,
        notes: addForm.notes || undefined,
      });
      setShowAddModal(false);
      setAddForm({ tagNumber: '', expiryDate: '', notes: '' });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create tag');
    }
  };

  const handleBulkBlock = async () => {
    if (!selectedIds.size) return;
    await bulkAction.mutateAsync({
      ids: Array.from(selectedIds),
      action: 'block',
      params: { reason: 'operator_request' },
    });
    setSelectedIds(new Set());
  };

  const handleBulkDecommission = async () => {
    if (!selectedIds.size) return;
    await bulkAction.mutateAsync({
      ids: Array.from(selectedIds),
      action: 'decommission',
    });
    setSelectedIds(new Set());
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tag Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">Manage fuel tag lifecycle — issuance, blocking, transfers</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Tag
        </button>
      </div>

      {/* Summary KPI cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {(
            [
              { key: 'total', label: 'Total', color: 'text-gray-700' },
              { key: 'active', label: 'Active', color: 'text-green-700' },
              { key: 'unassigned', label: 'Unassigned', color: 'text-gray-500' },
              { key: 'blocked', label: 'Blocked', color: 'text-red-700' },
              { key: 'lost', label: 'Lost', color: 'text-red-900' },
              { key: 'expired', label: 'Expired', color: 'text-orange-700' },
            ] as const
          ).map(({ key, label, color }) => (
            <div key={key} className="bg-white rounded-lg border border-gray-200 p-3 text-center">
              <div className={`text-2xl font-bold ${color}`}>{summary[key]}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search tag number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: (e.target.value as TagStatus) || undefined, page: 1 }))
          }
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => { setFilters({ page: 1, limit: 50 }); setSearch(''); }}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Clear filters
        </button>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4 flex items-center gap-4 text-sm">
          <span className="font-medium text-blue-800">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkBlock}
            disabled={bulkAction.isPending}
            className="text-red-700 hover:text-red-900 font-medium"
          >
            Block All
          </button>
          <button
            onClick={handleBulkDecommission}
            disabled={bulkAction.isPending}
            className="text-gray-700 hover:text-gray-900 font-medium"
          >
            Decommission All
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-gray-600 ml-auto">
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading tags…</div>
        ) : error ? (
          <div className="p-12 text-center text-red-600">
            Failed to load tags. Check that the backend is running.
          </div>
        ) : tags.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No tags found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === tags.length && tags.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Tag Number</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Vehicle (Reg)</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Issued Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Expiry Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Last Used</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Last Forecourt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tags.map((tag) => (
                <tr
                  key={tag.id}
                  className={`hover:bg-gray-50 transition-colors ${selectedIds.has(tag.id) ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(tag.id)}
                      onChange={() => toggleSelect(tag.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/tags/${tag.id}`}
                      className="font-mono font-medium text-blue-700 hover:underline"
                    >
                      {tag.tagNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {tag.vehicle ? (
                      <span>
                        {tag.vehicle.registrationNumber}
                        <span className="text-gray-400 ml-1 text-xs">
                          {tag.vehicle.make} {tag.vehicle.model}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tag.status} />
                    {tag.blockedReason && (
                      <span className="ml-1 text-xs text-gray-500">({tag.blockedReason})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(tag.issuedDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(tag.expiryDate)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(tag.lastUsedAt, { time: true })}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {tag.lastUsedForecourtId ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
            <span>
              {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of{' '}
              {meta.total} tags
            </span>
            <div className="flex gap-2">
              <button
                disabled={meta.page <= 1}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                ← Prev
              </button>
              <button
                disabled={meta.page >= meta.totalPages}
                onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
                className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Tag Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Tag to Inventory">
        <form onSubmit={handleAddTag} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tag Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={addForm.tagNumber}
              onChange={(e) => setAddForm((f) => ({ ...f, tagNumber: e.target.value }))}
              placeholder="e.g. BT-00451"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
            <input
              type="date"
              value={addForm.expiryDate}
              onChange={(e) => setAddForm((f) => ({ ...f, expiryDate: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={addForm.notes}
              onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createTag.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createTag.isPending ? 'Adding…' : 'Add Tag'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
