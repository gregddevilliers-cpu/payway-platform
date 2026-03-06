'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

const INCIDENT_TYPES = [
  'accident', 'theft', 'hijacking', 'vandalism',
  'mechanical_failure', 'tyre_blowout', 'fire', 'other',
];

export default function NewIncidentPage() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 16);
  const [form, setForm] = useState({
    vehicleId: '',
    driverId: '',
    incidentDate: today,
    incidentType: 'accident',
    severity: 'moderate',
    description: '',
    location: '',
    policeCaseNumber: '',
    thirdPartyInvolved: false,
    thirdPartyDetails: '',
    costEstimate: '',
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
        incidentDate: new Date(form.incidentDate).toISOString(),
        incidentType: form.incidentType,
        severity: form.severity,
        description: form.description,
        thirdPartyInvolved: form.thirdPartyInvolved,
      };
      if (form.driverId.trim()) payload.driverId = form.driverId.trim();
      if (form.location) payload.location = form.location;
      if (form.policeCaseNumber) payload.policeCaseNumber = form.policeCaseNumber;
      if (form.thirdPartyDetails) payload.thirdPartyDetails = form.thirdPartyDetails;
      if (form.costEstimate) payload.costEstimate = parseFloat(form.costEstimate);
      if (form.notes) payload.notes = form.notes;

      const res = await api.post<{ success: boolean; data: { id: string } }>('/incidents', payload);
      router.push(`/incidents/${res.data.id}`);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create incident');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Log Incident</h1>
          <p className="mt-1 text-sm text-gray-500">Record an accident, theft, or other incident</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Vehicle ID <span className="text-red-500">*</span></label>
                <input type="text" value={form.vehicleId} onChange={(e) => setField('vehicleId', e.target.value)}
                  placeholder="Vehicle UUID" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Driver ID (optional)</label>
                <input type="text" value={form.driverId} onChange={(e) => setField('driverId', e.target.value)}
                  placeholder="Driver UUID" className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Incident date/time <span className="text-red-500">*</span></label>
              <input type="datetime-local" value={form.incidentDate} onChange={(e) => setField('incidentDate', e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Incident type <span className="text-red-500">*</span></label>
                <select value={form.incidentType} onChange={(e) => setField('incidentType', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  {INCIDENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Severity <span className="text-red-500">*</span></label>
                <select value={form.severity} onChange={(e) => setField('severity', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                  {['minor', 'moderate', 'major', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description <span className="text-red-500">*</span></label>
              <textarea value={form.description} onChange={(e) => setField('description', e.target.value)}
                rows={3} placeholder="Describe what happened…"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Location</label>
              <input type="text" value={form.location} onChange={(e) => setField('location', e.target.value)}
                placeholder="Address or description of location"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Police case number</label>
                <input type="text" value={form.policeCaseNumber} onChange={(e) => setField('policeCaseNumber', e.target.value)}
                  placeholder="CAS XXXXXXXX/XX/XXXX"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cost estimate (ZAR)</label>
                <input type="number" min="0" step="0.01" value={form.costEstimate} onChange={(e) => setField('costEstimate', e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <input id="thirdParty" type="checkbox" checked={form.thirdPartyInvolved}
                  onChange={(e) => setField('thirdPartyInvolved', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                <label htmlFor="thirdParty" className="text-sm text-gray-700">Third party involved</label>
              </div>
              {form.thirdPartyInvolved && (
                <div className="mt-2">
                  <input type="text" value={form.thirdPartyDetails} onChange={(e) => setField('thirdPartyDetails', e.target.value)}
                    placeholder="Name, vehicle reg, contact details…"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
              <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)}
                rows={2} placeholder="Additional notes…"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button type="submit" disabled={submitting}
              className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Log Incident'}
            </button>
            <button type="button" onClick={() => router.back()}
              className="rounded-md px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
