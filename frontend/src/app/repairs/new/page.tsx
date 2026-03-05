'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

const REPAIR_TYPES = ['mechanical', 'electrical', 'body_panel', 'tyre', 'windscreen', 'interior', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const STEPS = ['Vehicle & Driver', 'Issue Details', 'Review & Submit'] as const;
type Step = 0 | 1 | 2;

export default function NewRepairPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState({
    vehicleId: '',
    driverId: '',
    repairType: 'mechanical',
    priority: 'medium',
    description: '',
    odometerAtReport: '',
    isDrivable: true,
    estimatedCompletion: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateStep(s: Step): string | null {
    if (s === 0) {
      if (!form.vehicleId.trim()) return 'Vehicle ID is required';
    }
    if (s === 1) {
      if (!form.description.trim()) return 'Description is required';
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => (s + 1) as Step);
  }

  function goBack() {
    setError(null);
    setStep((s) => (s - 1) as Step);
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        vehicleId: form.vehicleId.trim(),
        repairType: form.repairType,
        priority: form.priority,
        description: form.description,
        isDrivable: form.isDrivable,
      };
      if (form.driverId.trim()) payload.driverId = form.driverId.trim();
      if (form.odometerAtReport) payload.odometerAtReport = parseInt(form.odometerAtReport, 10);
      if (form.estimatedCompletion) payload.estimatedCompletion = new Date(form.estimatedCompletion).toISOString();

      const res = await api.post<{ success: boolean; data: { id: string } }>('/repairs', payload);
      router.push(`/repairs/${res.data.id}`);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create repair');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Log Repair</h1>
          <p className="mt-1 text-sm text-gray-500">Record a new repair request</p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-sm ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{label}</span>
              {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Step 0: Vehicle & Driver */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Vehicle ID <span className="text-red-500">*</span></label>
                <input type="text" value={form.vehicleId}
                  onChange={(e) => setField('vehicleId', e.target.value)}
                  placeholder="Vehicle UUID"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Driver ID (optional)</label>
                <input type="text" value={form.driverId}
                  onChange={(e) => setField('driverId', e.target.value)}
                  placeholder="Driver UUID"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
          )}

          {/* Step 1: Issue Details */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Repair type <span className="text-red-500">*</span></label>
                  <select value={form.repairType} onChange={(e) => setField('repairType', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {REPAIR_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Priority <span className="text-red-500">*</span></label>
                  <select value={form.priority} onChange={(e) => setField('priority', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description <span className="text-red-500">*</span></label>
                <textarea value={form.description} onChange={(e) => setField('description', e.target.value)}
                  rows={4} placeholder="Describe the issue in detail…"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Odometer (km)</label>
                  <input type="number" min="0" value={form.odometerAtReport}
                    onChange={(e) => setField('odometerAtReport', e.target.value)}
                    placeholder="Current reading"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Est. completion</label>
                  <input type="date" value={form.estimatedCompletion}
                    onChange={(e) => setField('estimatedCompletion', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <input id="drivable" type="checkbox" checked={form.isDrivable}
                    onChange={(e) => setField('isDrivable', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                  <label htmlFor="drivable" className="text-sm text-gray-700">Vehicle is still drivable</label>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Review & Confirm</h2>
              <dl className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
                <div><dt className="text-xs text-gray-500 uppercase">Vehicle ID</dt><dd className="mt-0.5 font-mono text-xs text-gray-900">{form.vehicleId}</dd></div>
                {form.driverId && <div><dt className="text-xs text-gray-500 uppercase">Driver ID</dt><dd className="mt-0.5 font-mono text-xs text-gray-900">{form.driverId}</dd></div>}
                <div><dt className="text-xs text-gray-500 uppercase">Type</dt><dd className="mt-0.5 text-gray-900">{form.repairType.replace(/_/g, ' ')}</dd></div>
                <div><dt className="text-xs text-gray-500 uppercase">Priority</dt><dd className="mt-0.5 text-gray-900">{form.priority}</dd></div>
                <div><dt className="text-xs text-gray-500 uppercase">Drivable</dt><dd className="mt-0.5 text-gray-900">{form.isDrivable ? 'Yes' : 'No'}</dd></div>
                {form.odometerAtReport && <div><dt className="text-xs text-gray-500 uppercase">Odometer</dt><dd className="mt-0.5 text-gray-900">{form.odometerAtReport} km</dd></div>}
                <div className="col-span-2"><dt className="text-xs text-gray-500 uppercase">Description</dt><dd className="mt-0.5 text-gray-900">{form.description}</dd></div>
              </dl>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex justify-between">
            <div>
              {step > 0 && (
                <button type="button" onClick={goBack}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                  Back
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => router.back()}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100">
                Cancel
              </button>
              {step < 2 ? (
                <button type="button" onClick={goNext}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Next
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Saving…' : 'Log Repair'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
