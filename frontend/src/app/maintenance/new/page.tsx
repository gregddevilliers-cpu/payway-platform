'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

const MAINTENANCE_TYPES = [
  'routine_service', 'oil_change', 'tyre_rotation', 'tyre_replacement',
  'brake_service', 'battery_replacement', 'filter_replacement',
  'transmission_service', 'coolant_flush', 'inspection', 'other',
];

export default function NewMaintenancePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    vehicleId: '',
    maintenanceType: 'routine_service',
    description: '',
    serviceDate: new Date().toISOString().slice(0, 10),
    provider: '',
    cost: '',
    vatAmount: '',
    odometer: '',
    nextServiceDate: '',
    nextServiceOdometer: '',
    isScheduled: false,
    status: 'completed',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.vehicleId.trim()) { setError('Vehicle ID is required'); return; }
    if (!form.description.trim()) { setError('Description is required'); return; }

    setError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        vehicleId: form.vehicleId.trim(),
        maintenanceType: form.maintenanceType,
        description: form.description,
        serviceDate: form.serviceDate,
        status: form.status,
        isScheduled: form.isScheduled,
      };
      if (form.provider) payload.provider = form.provider;
      if (form.cost) payload.cost = parseFloat(form.cost);
      if (form.vatAmount) payload.vatAmount = parseFloat(form.vatAmount);
      if (form.odometer) payload.odometer = parseInt(form.odometer, 10);
      if (form.nextServiceDate) payload.nextServiceDate = form.nextServiceDate;
      if (form.nextServiceOdometer) payload.nextServiceOdometer = parseInt(form.nextServiceOdometer, 10);
      if (form.notes) payload.notes = form.notes;

      const res = await api.post<{ success: boolean; data: { id: string } }>('/maintenance', payload);
      router.push(`/maintenance/${res.data.id}`);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create maintenance record');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Log Service</h1>
          <p className="mt-1 text-sm text-gray-500">Record a maintenance or service event</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Vehicle ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.vehicleId}
                onChange={(e) => setField('vehicleId', e.target.value)}
                placeholder="Paste vehicle UUID…"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Maintenance type <span className="text-red-500">*</span></label>
              <select
                value={form.maintenanceType}
                onChange={(e) => setField('maintenanceType', e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {MAINTENANCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description <span className="text-red-500">*</span></label>
              <textarea
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                rows={3}
                placeholder="Describe the work performed…"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Service date <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={form.serviceDate}
                  onChange={(e) => setField('serviceDate', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setField('status', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {['scheduled', 'in_progress', 'completed', 'cancelled'].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Provider</label>
              <input
                type="text"
                value={form.provider}
                onChange={(e) => setField('provider', e.target.value)}
                placeholder="Service provider name"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cost (ZAR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setField('cost', e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">VAT amount (ZAR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.vatAmount}
                  onChange={(e) => setField('vatAmount', e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Odometer at service (km)</label>
              <input
                type="number"
                min="0"
                value={form.odometer}
                onChange={(e) => setField('odometer', e.target.value)}
                placeholder="Current odometer reading"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Next service date</label>
                <input
                  type="date"
                  value={form.nextServiceDate}
                  onChange={(e) => setField('nextServiceDate', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Next service odometer</label>
                <input
                  type="number"
                  min="0"
                  value={form.nextServiceOdometer}
                  onChange={(e) => setField('nextServiceOdometer', e.target.value)}
                  placeholder="km"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                rows={2}
                placeholder="Additional notes…"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="isScheduled"
                type="checkbox"
                checked={form.isScheduled}
                onChange={(e) => setField('isScheduled', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <label htmlFor="isScheduled" className="text-sm text-gray-700">
                This is a scheduled service (not ad-hoc)
              </label>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Log Service'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-md px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
