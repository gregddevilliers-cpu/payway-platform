'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface Insurer {
  id: string;
  companyName: string;
  claimsPhone: string | null;
  claimsEmail: string | null;
  generalPhone: string | null;
  brokerName: string | null;
  brokerPhone: string | null;
  brokerEmail: string | null;
  notes: string | null;
  status: string;
  _count: { vehicles: number };
}

type InsurerForm = {
  companyName: string;
  claimsPhone: string;
  claimsEmail: string;
  generalPhone: string;
  brokerName: string;
  brokerPhone: string;
  brokerEmail: string;
  notes: string;
  status: string;
};

const EMPTY_FORM: InsurerForm = {
  companyName: '',
  claimsPhone: '',
  claimsEmail: '',
  generalPhone: '',
  brokerName: '',
  brokerPhone: '',
  brokerEmail: '',
  notes: '',
  status: 'active',
};

const STATUS_COLOURS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
};

export default function InsurersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InsurerForm>(EMPTY_FORM);

  const { data, isLoading } = useQuery<{ data: Insurer[] }>({
    queryKey: ['insurers'],
    queryFn: () => api.get('/insurers'),
  });

  const insurers = data?.data ?? [];

  const filtered = search
    ? insurers.filter((i) =>
        i.companyName.toLowerCase().includes(search.toLowerCase()) ||
        (i.brokerName && i.brokerName.toLowerCase().includes(search.toLowerCase()))
      )
    : insurers;

  const createMutation = useMutation({
    mutationFn: (payload: InsurerForm) => api.post('/insurers', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurers'] });
      closeModal();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: InsurerForm }) =>
      api.patch(`/insurers/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurers'] });
      closeModal();
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (insurer: Insurer) => {
    setEditingId(insurer.id);
    setForm({
      companyName: insurer.companyName,
      claimsPhone: insurer.claimsPhone ?? '',
      claimsEmail: insurer.claimsEmail ?? '',
      generalPhone: insurer.generalPhone ?? '',
      brokerName: insurer.brokerName ?? '',
      brokerPhone: insurer.brokerPhone ?? '',
      brokerEmail: insurer.brokerEmail ?? '',
      notes: insurer.notes ?? '',
      status: insurer.status,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const updateField = (field: keyof InsurerForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Insurers</h1>
            <p className="mt-1 text-sm text-gray-500">{filtered.length} total</p>
          </div>
          <button
            onClick={openCreate}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + Add Insurer
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search company or broker name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none w-64"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading insurers...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No insurers found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Company Name', 'Claims Phone', 'Broker Name', 'Status', 'Vehicles'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((ins) => (
                    <tr
                      key={ins.id}
                      onClick={() => openEdit(ins)}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-blue-600 hover:underline">
                          {ins.companyName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{ins.claimsPhone ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{ins.brokerName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[ins.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {ins.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{ins._count.vehicles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editingId ? 'Edit Insurer' : 'Add Insurer'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Company Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Company Name *</label>
                <input
                  type="text"
                  required
                  value={form.companyName}
                  onChange={(e) => updateField('companyName', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Claims Phone + Claims Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Claims Phone</label>
                  <input
                    type="text"
                    value={form.claimsPhone}
                    onChange={(e) => updateField('claimsPhone', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Claims Email</label>
                  <input
                    type="email"
                    value={form.claimsEmail}
                    onChange={(e) => updateField('claimsEmail', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* General Phone */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">General Phone</label>
                <input
                  type="text"
                  value={form.generalPhone}
                  onChange={(e) => updateField('generalPhone', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Broker Name + Broker Phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Broker Name</label>
                  <input
                    type="text"
                    value={form.brokerName}
                    onChange={(e) => updateField('brokerName', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Broker Phone</label>
                  <input
                    type="text"
                    value={form.brokerPhone}
                    onChange={(e) => updateField('brokerPhone', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Broker Email */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Broker Email</label>
                <input
                  type="email"
                  value={form.brokerEmail}
                  onChange={(e) => updateField('brokerEmail', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Status */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
