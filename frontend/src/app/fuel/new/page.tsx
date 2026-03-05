'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';

interface CreatePayload {
  vehicleId: string;
  driverId: string;
  transactionDate: string;
  litresFilled: number;
  pricePerLitre: number;
  totalAmount: number;
  fuelType: string;
  odometer?: number;
  siteCode?: string;
  siteName?: string;
}

const FUEL_TYPES = ['petrol', 'diesel', 'lpg', 'electric', 'hybrid'];

export default function NewFuelTransactionPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState({
    vehicleId: '',
    driverId: '',
    transactionDate: new Date().toISOString().split('T')[0],
    litresFilled: '',
    pricePerLitre: '',
    totalAmount: '',
    fuelType: 'diesel',
    odometer: '',
    siteCode: '',
    siteName: '',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Auto-calculate total when litres + price change
  const handleLitresOrPrice = (k: 'litresFilled' | 'pricePerLitre', v: string) => {
    const updated = { ...form, [k]: v };
    const litres = parseFloat(updated.litresFilled);
    const price = parseFloat(updated.pricePerLitre);
    const newTotal = !isNaN(litres) && !isNaN(price) ? (litres * price).toFixed(2) : updated.totalAmount;
    setForm({ ...updated, totalAmount: newTotal });
  };

  const mutation = useMutation({
    mutationFn: (payload: CreatePayload) => api.post('/fuel-transactions', payload),
    onSuccess: (res: { data: { id: string } }) => {
      qc.invalidateQueries({ queryKey: ['fuel-transactions'] });
      router.push(`/fuel/${res.data.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicleId || !form.driverId || !form.litresFilled || !form.pricePerLitre || !form.totalAmount) return;
    mutation.mutate({
      vehicleId: form.vehicleId,
      driverId: form.driverId,
      transactionDate: form.transactionDate,
      litresFilled: parseFloat(form.litresFilled),
      pricePerLitre: parseFloat(form.pricePerLitre),
      totalAmount: parseFloat(form.totalAmount),
      fuelType: form.fuelType,
      ...(form.odometer ? { odometer: parseInt(form.odometer, 10) } : {}),
      ...(form.siteCode ? { siteCode: form.siteCode } : {}),
      ...(form.siteName ? { siteName: form.siteName } : {}),
    });
  };

  const inputCls = 'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
  const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/fuel" className="text-sm text-gray-500 hover:text-gray-700">← Fuel</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">Log Fill-up</span>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-lg font-semibold text-gray-900">Log Fuel Fill-up</h1>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Vehicle ID <span className="text-red-500">*</span></label>
                <input className={inputCls} value={form.vehicleId}
                  onChange={(e) => set('vehicleId', e.target.value)} placeholder="Vehicle UUID" />
              </div>
              <div>
                <label className={labelCls}>Driver ID <span className="text-red-500">*</span></label>
                <input className={inputCls} value={form.driverId}
                  onChange={(e) => set('driverId', e.target.value)} placeholder="Driver UUID" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                <input type="date" className={inputCls} value={form.transactionDate}
                  onChange={(e) => set('transactionDate', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Fuel type <span className="text-red-500">*</span></label>
                <select className={inputCls} value={form.fuelType}
                  onChange={(e) => set('fuelType', e.target.value)}>
                  {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Litres filled <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.litresFilled}
                  onChange={(e) => handleLitresOrPrice('litresFilled', e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className={labelCls}>Price per litre (R) <span className="text-red-500">*</span></label>
                <input type="number" step="0.001" min="0" className={inputCls} value={form.pricePerLitre}
                  onChange={(e) => handleLitresOrPrice('pricePerLitre', e.target.value)} placeholder="0.000" />
              </div>
              <div>
                <label className={labelCls}>Total amount (R) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.totalAmount}
                  onChange={(e) => set('totalAmount', e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div>
              <label className={labelCls}>Odometer reading (km)</label>
              <input type="number" min="0" className={inputCls} value={form.odometer}
                onChange={(e) => set('odometer', e.target.value)}
                placeholder="Provide for efficiency calculation" />
              <p className="mt-1 text-xs text-gray-400">Enter odometer to automatically calculate fuel efficiency (km/L).</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Site code</label>
                <input className={inputCls} value={form.siteCode}
                  onChange={(e) => set('siteCode', e.target.value)} placeholder="e.g. JHB-001" />
              </div>
              <div>
                <label className={labelCls}>Site name</label>
                <input className={inputCls} value={form.siteName}
                  onChange={(e) => set('siteName', e.target.value)} placeholder="e.g. Engen Sandton" />
              </div>
            </div>

            {mutation.isError && (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Failed to save transaction. Please try again.
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/fuel" className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</Link>
              <button type="submit" disabled={mutation.isPending}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {mutation.isPending ? 'Saving…' : 'Log fill-up'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
