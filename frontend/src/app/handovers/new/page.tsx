'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { SearchableDropdown } from '../../../components/SearchableDropdown';

const HANDOVER_TYPES = ['check_out', 'check_in'];
const FUEL_LEVELS = ['empty', 'quarter', 'half', 'three_quarter', 'full'];
const CONDITIONS = ['good', 'fair', 'poor'];
const EQUIPMENT_ITEMS = [
  'branding',
  'lights',
  'radio',
  'fire_extinguisher',
  'first_aid_kit',
  'tools',
  'jack',
  'spare_wheel',
  'warning_triangle',
  'reflective_vest',
  'other',
];

const FUEL_LABELS: Record<string, string> = {
  empty: 'Empty',
  quarter: '1/4',
  half: '1/2',
  three_quarter: '3/4',
  full: 'Full',
};

const STEPS = ['Vehicle & Driver', 'Odometer & Fuel', 'Condition & Damage', 'Equipment Checklist', 'Notes & Submit'] as const;
type Step = 0 | 1 | 2 | 3 | 4;

export default function NewHandoverPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState({
    vehicleId: '',
    driverId: '',
    handoverType: 'check_out',
    handoverDatetime: '',
    odometerReading: '',
    fuelLevel: '',
    exteriorCondition: 'good',
    interiorCondition: 'good',
    damageNotes: '',
    equipmentChecklist: [] as string[],
    notes: '',
  });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setField(key: string, value: string | boolean | string[]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleEquipment(item: string) {
    setForm((f) => {
      const current = f.equipmentChecklist;
      const next = current.includes(item)
        ? current.filter((i) => i !== item)
        : [...current, item];
      return { ...f, equipmentChecklist: next };
    });
  }

  function validateStep(s: Step): string | null {
    if (s === 0) {
      if (!form.vehicleId.trim()) return 'Vehicle is required';
      if (!form.handoverDatetime.trim()) return 'Date / time is required';
    }
    if (s === 1) {
      if (!form.odometerReading.trim()) return 'Odometer reading is required';
      if (!form.fuelLevel) return 'Fuel level is required';
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
        handoverType: form.handoverType,
        handoverDatetime: new Date(form.handoverDatetime).toISOString(),
        odometerReading: parseInt(form.odometerReading, 10),
        fuelLevel: form.fuelLevel,
        exteriorCondition: form.exteriorCondition,
        interiorCondition: form.interiorCondition,
        equipmentChecklist: form.equipmentChecklist,
      };
      if (form.driverId.trim()) payload.driverId = form.driverId.trim();
      if (form.damageNotes.trim()) payload.damageNotes = form.damageNotes.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const res = await api.post<{ success: boolean; data: { id: string } }>('/handovers', payload);
      router.push(`/handovers/${res.data.id}`);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Failed to create handover');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">New Handover</h1>
          <p className="mt-1 text-sm text-gray-500">Record a vehicle check-out or check-in</p>
        </div>

        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                i < step ? 'bg-blue-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {i < step ? '\u2713' : i + 1}
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
                <SearchableDropdown
                  apiEndpoint="/vehicles"
                  displayFormat={(v) => `${v.registrationNumber} \u2014 ${v.make} ${v.model}`}
                  placeholder="Search vehicles..."
                  label="Vehicle"
                  required
                  onChange={(id, item) => { setField('vehicleId', id); setSelectedVehicle(item); }}
                />
              </div>
              <div>
                <SearchableDropdown
                  apiEndpoint="/drivers"
                  displayFormat={(d) => `${d.lastName}, ${d.firstName} (${d.mobileNumber})`}
                  placeholder="Search drivers..."
                  label="Driver (optional)"
                  onChange={(id, item) => { setField('driverId', id); setSelectedDriver(item); }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Handover type <span className="text-red-500">*</span></label>
                  <select
                    value={form.handoverType}
                    onChange={(e) => setField('handoverType', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {HANDOVER_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Date / time <span className="text-red-500">*</span></label>
                  <input
                    type="datetime-local"
                    value={form.handoverDatetime}
                    onChange={(e) => setField('handoverDatetime', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Odometer & Fuel */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Odometer reading (km) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  value={form.odometerReading}
                  onChange={(e) => setField('odometerReading', e.target.value)}
                  placeholder="Current odometer reading"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Fuel level <span className="text-red-500">*</span></label>
                <select
                  value={form.fuelLevel}
                  onChange={(e) => setField('fuelLevel', e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select fuel level</option>
                  {FUEL_LEVELS.map((l) => (
                    <option key={l} value={l}>{FUEL_LABELS[l] ?? l.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Condition & Damage */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Exterior condition</label>
                  <select
                    value={form.exteriorCondition}
                    onChange={(e) => setField('exteriorCondition', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Interior condition</label>
                  <select
                    value={form.interiorCondition}
                    onChange={(e) => setField('interiorCondition', e.target.value)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Damage notes</label>
                <textarea
                  value={form.damageNotes}
                  onChange={(e) => setField('damageNotes', e.target.value)}
                  rows={4}
                  placeholder="Describe any existing or new damage..."
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Step 3: Equipment Checklist */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Equipment present in vehicle</h2>
              <p className="text-xs text-gray-500">Tick each item that is present. Unticked items will be recorded as missing.</p>
              <div className="grid grid-cols-2 gap-3">
                {EQUIPMENT_ITEMS.map((item) => (
                  <label key={item} className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.equipmentChecklist.includes(item)}
                      onChange={() => toggleEquipment(item)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">{item.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Notes & Submit */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Review & Submit</h2>
              <dl className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm">
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Vehicle</dt>
                  <dd className="mt-0.5 text-gray-900">
                    {selectedVehicle
                      ? `${selectedVehicle.registrationNumber} \u2014 ${selectedVehicle.make} ${selectedVehicle.model}`
                      : form.vehicleId}
                  </dd>
                </div>
                {form.driverId && (
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Driver</dt>
                    <dd className="mt-0.5 text-gray-900">
                      {selectedDriver
                        ? `${selectedDriver.firstName} ${selectedDriver.lastName}`
                        : form.driverId}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Type</dt>
                  <dd className="mt-0.5 text-gray-900">{form.handoverType.replace(/_/g, ' ')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Date / time</dt>
                  <dd className="mt-0.5 text-gray-900">
                    {form.handoverDatetime ? new Date(form.handoverDatetime).toLocaleString('en-ZA') : '\u2014'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Odometer</dt>
                  <dd className="mt-0.5 text-gray-900">{form.odometerReading ? `${form.odometerReading} km` : '\u2014'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Fuel level</dt>
                  <dd className="mt-0.5 text-gray-900">{form.fuelLevel ? (FUEL_LABELS[form.fuelLevel] ?? form.fuelLevel.replace(/_/g, ' ')) : '\u2014'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Exterior</dt>
                  <dd className="mt-0.5 text-gray-900">{form.exteriorCondition}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Interior</dt>
                  <dd className="mt-0.5 text-gray-900">{form.interiorCondition}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-gray-500 uppercase">Equipment present</dt>
                  <dd className="mt-0.5 text-gray-900">
                    {form.equipmentChecklist.length > 0
                      ? form.equipmentChecklist.map((e) => e.replace(/_/g, ' ')).join(', ')
                      : 'None selected'}
                  </dd>
                </div>
                {form.damageNotes && (
                  <div className="col-span-2">
                    <dt className="text-xs text-gray-500 uppercase">Damage notes</dt>
                    <dd className="mt-0.5 text-gray-900">{form.damageNotes}</dd>
                  </div>
                )}
              </dl>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Additional notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  rows={3}
                  placeholder="Any additional notes..."
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
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
              {step < 4 ? (
                <button type="button" onClick={goNext}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Next
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Submit Handover'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
