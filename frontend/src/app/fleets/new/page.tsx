'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';

interface CreatePayload {
  name: string;
  code?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  region?: string;
  monthlyBudget?: number;
  status: string;
}

const REGIONS = [
  { value: 'gauteng', label: 'Gauteng' },
  { value: 'western_cape', label: 'Western Cape' },
  { value: 'kwazulu_natal', label: 'KwaZulu-Natal' },
  { value: 'eastern_cape', label: 'Eastern Cape' },
  { value: 'free_state', label: 'Free State' },
  { value: 'mpumalanga', label: 'Mpumalanga' },
  { value: 'limpopo', label: 'Limpopo' },
  { value: 'north_west', label: 'North West' },
  { value: 'northern_cape', label: 'Northern Cape' },
];

const STATUSES = ['active', 'inactive'];

export default function NewFleetPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    code: '',
    contactPerson: '',
    contactPhone: '',
    contactEmail: '',
    region: '',
    monthlyBudget: '',
    status: 'active',
  });

  const [nameError, setNameError] = useState('');

  const set = (k: string, v: string) => {
    if (k === 'name') setNameError('');
    setForm((f) => ({ ...f, [k]: v }));
  };

  const mutation = useMutation({
    mutationFn: (payload: CreatePayload) =>
      api.post<{ success: boolean; data: { id: string } }>('/fleets', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fleets'] });
      router.push('/fleets');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setNameError('Fleet name is required');
      return;
    }
    mutation.mutate({
      name: form.name.trim(),
      ...(form.code ? { code: form.code.toUpperCase() } : {}),
      ...(form.contactPerson ? { contactPerson: form.contactPerson } : {}),
      ...(form.contactPhone ? { contactPhone: form.contactPhone } : {}),
      ...(form.contactEmail ? { contactEmail: form.contactEmail } : {}),
      ...(form.region ? { region: form.region } : {}),
      ...(form.monthlyBudget ? { monthlyBudget: parseFloat(form.monthlyBudget) } : {}),
      status: form.status,
    });
  };

  const inputCls = 'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
  const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/fleets" className="text-sm text-gray-500 hover:text-gray-700">← Fleets</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">New Fleet</span>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-lg font-semibold text-gray-900">Create Fleet</h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Name <span className="text-red-500">*</span></label>
                <input className={`${inputCls} ${nameError ? 'border-red-400' : ''}`} value={form.name}
                  onChange={(e) => set('name', e.target.value)} placeholder="e.g. Soweto Fleet" />
                {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
              </div>
              <div>
                <label className={labelCls}>Code</label>
                <input className={inputCls} value={form.code}
                  onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="e.g. SWT" />
                <p className="mt-1 text-xs text-gray-400">Short identifier, auto-uppercased.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Contact Person</label>
                <input className={inputCls} value={form.contactPerson}
                  onChange={(e) => set('contactPerson', e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className={labelCls}>Contact Phone</label>
                <input className={inputCls} value={form.contactPhone}
                  onChange={(e) => set('contactPhone', e.target.value)} placeholder="+27XXXXXXXXX" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Contact Email</label>
              <input type="email" className={inputCls} value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)} placeholder="fleet@example.co.za" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Region</label>
                <select className={inputCls} value={form.region}
                  onChange={(e) => set('region', e.target.value)}>
                  <option value="">Select region</option>
                  {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={form.status}
                  onChange={(e) => set('status', e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Monthly Budget (R)</label>
              <input type="number" step="0.01" min="0" className={inputCls} value={form.monthlyBudget}
                onChange={(e) => set('monthlyBudget', e.target.value)} placeholder="e.g. 50000" />
            </div>

            {mutation.isError && (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {mutation.error instanceof Error ? mutation.error.message : 'Failed to create fleet. Please try again.'}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/fleets" className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</Link>
              <button type="submit" disabled={mutation.isPending}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {mutation.isPending ? 'Creating…' : 'Create Fleet'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
