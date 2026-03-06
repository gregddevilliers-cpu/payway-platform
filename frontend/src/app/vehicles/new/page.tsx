'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { SearchableDropdown } from '../../../components/SearchableDropdown';

const FUEL_TYPES = ['petrol', 'diesel', 'lpg', 'electric', 'hybrid'];
const OWNERSHIP_TYPES = ['owned', 'leased', 'rented', 'financed'];

const STEPS = [
  'Basic Info',
  'Identification',
  'Assignment',
  'Compliance',
  'Ownership',
  'Documents',
  'Review',
] as const;

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const CURRENT_YEAR = new Date().getFullYear();

export default function NewVehiclePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    // Step 1 — Basic Info
    registrationNumber: '',
    make: '',
    model: '',
    year: '',
    colour: '',
    fuelType: 'diesel',
    tankCapacity: '',
    // Step 2 — Identification
    vin: '',
    tagNumber: '',
    // Step 3 — Assignment
    fleetId: '',
    driverId: '',
    // Step 4 — Compliance
    licenceDiscExpiry: '',
    insuranceProvider: '',
    policyNumber: '',
    insuranceExpiry: '',
    // Step 5 — Ownership
    ownershipType: 'owned',
    leaseFinanceExpiry: '',
  });

  const inputCls = 'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
  const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateStep(s: Step): string | null {
    switch (s) {
      case 0: {
        if (!form.registrationNumber.trim()) return 'Registration number is required';
        if (!form.make.trim()) return 'Make is required';
        if (!form.model.trim()) return 'Model is required';
        if (!form.year) return 'Year is required';
        const yr = parseInt(form.year, 10);
        if (isNaN(yr) || yr < 1900 || yr > CURRENT_YEAR + 1)
          return `Year must be between 1900 and ${CURRENT_YEAR + 1}`;
        if (!form.fuelType) return 'Fuel type is required';
        if (form.tankCapacity) {
          const tc = parseInt(form.tankCapacity, 10);
          if (isNaN(tc) || tc < 1 || tc > 999) return 'Tank capacity must be between 1 and 999 litres';
        }
        return null;
      }
      case 1: {
        if (form.vin && form.vin.trim().length !== 17)
          return 'VIN / Chassis number must be exactly 17 characters';
        return null;
      }
      case 2: {
        if (!form.fleetId) return 'Fleet is required';
        return null;
      }
      case 3:
      case 4:
      case 5:
        return null;
      default:
        return null;
    }
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

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ success: boolean; data: { id: string } }>('/vehicles', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      router.push('/vehicles');
    },
  });

  function handleSubmit() {
    setError(null);
    const payload: Record<string, unknown> = {
      registrationNumber: form.registrationNumber.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      year: parseInt(form.year, 10),
      fuelType: form.fuelType,
      fleetId: form.fleetId,
    };
    if (form.colour.trim()) payload.colour = form.colour.trim();
    if (form.tankCapacity) payload.tankCapacity = parseInt(form.tankCapacity, 10);
    if (form.vin.trim()) payload.vin = form.vin.trim();
    if (form.tagNumber.trim()) payload.tagNumber = form.tagNumber.trim();
    if (form.driverId) payload.driverId = form.driverId;
    if (form.licenceDiscExpiry) payload.licenceDiscExpiry = new Date(form.licenceDiscExpiry).toISOString();
    if (form.insuranceProvider.trim()) payload.insuranceProvider = form.insuranceProvider.trim();
    if (form.policyNumber.trim()) payload.policyNumber = form.policyNumber.trim();
    if (form.insuranceExpiry) payload.insuranceExpiry = new Date(form.insuranceExpiry).toISOString();
    if (form.ownershipType) payload.ownershipType = form.ownershipType;
    if (form.leaseFinanceExpiry) payload.leaseFinanceExpiry = new Date(form.leaseFinanceExpiry).toISOString();

    mutation.mutate(payload);
  }

  const showLeaseExpiry = form.ownershipType === 'leased' || form.ownershipType === 'rented' || form.ownershipType === 'financed';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/vehicles" className="text-sm text-gray-500 hover:text-gray-700">Vehicles</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">New Vehicle</span>
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

          {mutation.isError && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(mutation.error as Error)?.message ?? 'Failed to create vehicle. Please try again.'}
            </div>
          )}

          {/* Step 0: Basic Info */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Basic Information</h2>
              <div>
                <label className={labelCls}>Registration Number <span className="text-red-500">*</span></label>
                <input type="text" className={inputCls} value={form.registrationNumber}
                  onChange={(e) => setField('registrationNumber', e.target.value)}
                  placeholder="e.g. GP 123-456" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Make <span className="text-red-500">*</span></label>
                  <input type="text" className={inputCls} value={form.make}
                    onChange={(e) => setField('make', e.target.value)}
                    placeholder="e.g. Toyota" />
                </div>
                <div>
                  <label className={labelCls}>Model <span className="text-red-500">*</span></label>
                  <input type="text" className={inputCls} value={form.model}
                    onChange={(e) => setField('model', e.target.value)}
                    placeholder="e.g. Quantum" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Year <span className="text-red-500">*</span></label>
                  <input type="number" className={inputCls} value={form.year}
                    onChange={(e) => setField('year', e.target.value)}
                    min={1900} max={CURRENT_YEAR + 1}
                    placeholder={`e.g. ${CURRENT_YEAR}`} />
                </div>
                <div>
                  <label className={labelCls}>Colour</label>
                  <input type="text" className={inputCls} value={form.colour}
                    onChange={(e) => setField('colour', e.target.value)}
                    placeholder="e.g. White" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Fuel Type <span className="text-red-500">*</span></label>
                  <select className={inputCls} value={form.fuelType}
                    onChange={(e) => setField('fuelType', e.target.value)}>
                    {FUEL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tank Capacity (litres)</label>
                  <input type="number" className={inputCls} value={form.tankCapacity}
                    onChange={(e) => setField('tankCapacity', e.target.value)}
                    min={1} max={999} placeholder="e.g. 70" />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Identification */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Identification</h2>
              <div>
                <label className={labelCls}>VIN / Chassis Number</label>
                <input type="text" className={inputCls} value={form.vin}
                  onChange={(e) => setField('vin', e.target.value)}
                  maxLength={17} placeholder="17-character Vehicle Identification Number" />
                <p className="mt-1 text-xs text-gray-400">Leave blank if not available. Must be exactly 17 characters if provided.</p>
              </div>
              <div>
                <label className={labelCls}>Tag Number</label>
                <input type="text" className={inputCls} value={form.tagNumber}
                  onChange={(e) => setField('tagNumber', e.target.value)}
                  placeholder="Internal tracking tag (optional)" />
              </div>
            </div>
          )}

          {/* Step 2: Assignment */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Assignment</h2>
              <SearchableDropdown
                apiEndpoint="/fleets"
                displayFormat={(item) => item.name}
                label="Fleet"
                required
                placeholder="Search for a fleet..."
                onChange={(value) => setField('fleetId', value)}
                initialValue={form.fleetId}
              />
              <SearchableDropdown
                apiEndpoint="/drivers"
                displayFormat={(item) => `${item.lastName}, ${item.firstName} (${item.mobile ?? ''})`}
                label="Assigned Driver"
                placeholder="Search for a driver..."
                onChange={(value) => setField('driverId', value)}
                initialValue={form.driverId}
              />
            </div>
          )}

          {/* Step 3: Compliance */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Compliance</h2>
              <div>
                <label className={labelCls}>Licence Disc Expiry</label>
                <input type="date" className={inputCls} value={form.licenceDiscExpiry}
                  onChange={(e) => setField('licenceDiscExpiry', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Insurance Provider</label>
                <input type="text" className={inputCls} value={form.insuranceProvider}
                  onChange={(e) => setField('insuranceProvider', e.target.value)}
                  placeholder="e.g. Outsurance" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Policy Number</label>
                  <input type="text" className={inputCls} value={form.policyNumber}
                    onChange={(e) => setField('policyNumber', e.target.value)}
                    placeholder="Insurance policy number" />
                </div>
                <div>
                  <label className={labelCls}>Insurance Expiry</label>
                  <input type="date" className={inputCls} value={form.insuranceExpiry}
                    onChange={(e) => setField('insuranceExpiry', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Ownership */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Ownership</h2>
              <div>
                <label className={labelCls}>Ownership Type</label>
                <select className={inputCls} value={form.ownershipType}
                  onChange={(e) => setField('ownershipType', e.target.value)}>
                  {OWNERSHIP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {showLeaseExpiry && (
                <div>
                  <label className={labelCls}>Lease / Finance Expiry</label>
                  <input type="date" className={inputCls} value={form.leaseFinanceExpiry}
                    onChange={(e) => setField('leaseFinanceExpiry', e.target.value)} />
                </div>
              )}
            </div>
          )}

          {/* Step 5: Documents */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Documents</h2>
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
                <p className="text-sm text-gray-500">Document upload coming soon</p>
                <p className="mt-1 text-xs text-gray-400">This feature will be implemented in a future update.</p>
              </div>
            </div>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Review & Confirm</h2>

              {/* Basic Info */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Basic Information</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Registration</dt>
                    <dd className="mt-0.5 text-gray-900">{form.registrationNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Make / Model</dt>
                    <dd className="mt-0.5 text-gray-900">{form.make} {form.model}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Year</dt>
                    <dd className="mt-0.5 text-gray-900">{form.year}</dd>
                  </div>
                  {form.colour && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">Colour</dt>
                      <dd className="mt-0.5 text-gray-900">{form.colour}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Fuel Type</dt>
                    <dd className="mt-0.5 capitalize text-gray-900">{form.fuelType}</dd>
                  </div>
                  {form.tankCapacity && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">Tank Capacity</dt>
                      <dd className="mt-0.5 text-gray-900">{form.tankCapacity} litres</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Identification */}
              {(form.vin || form.tagNumber) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Identification</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {form.vin && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">VIN</dt>
                        <dd className="mt-0.5 font-mono text-xs text-gray-900">{form.vin}</dd>
                      </div>
                    )}
                    {form.tagNumber && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Tag Number</dt>
                        <dd className="mt-0.5 text-gray-900">{form.tagNumber}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Assignment */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Assignment</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Fleet ID</dt>
                    <dd className="mt-0.5 font-mono text-xs text-gray-900">{form.fleetId || '—'}</dd>
                  </div>
                  {form.driverId && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">Driver ID</dt>
                      <dd className="mt-0.5 font-mono text-xs text-gray-900">{form.driverId}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Compliance */}
              {(form.licenceDiscExpiry || form.insuranceProvider || form.policyNumber || form.insuranceExpiry) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Compliance</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {form.licenceDiscExpiry && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Licence Disc Expiry</dt>
                        <dd className="mt-0.5 text-gray-900">{form.licenceDiscExpiry}</dd>
                      </div>
                    )}
                    {form.insuranceProvider && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Insurance Provider</dt>
                        <dd className="mt-0.5 text-gray-900">{form.insuranceProvider}</dd>
                      </div>
                    )}
                    {form.policyNumber && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Policy Number</dt>
                        <dd className="mt-0.5 text-gray-900">{form.policyNumber}</dd>
                      </div>
                    )}
                    {form.insuranceExpiry && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Insurance Expiry</dt>
                        <dd className="mt-0.5 text-gray-900">{form.insuranceExpiry}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Ownership */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Ownership</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Ownership Type</dt>
                    <dd className="mt-0.5 capitalize text-gray-900">{form.ownershipType}</dd>
                  </div>
                  {showLeaseExpiry && form.leaseFinanceExpiry && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">Lease / Finance Expiry</dt>
                      <dd className="mt-0.5 text-gray-900">{form.leaseFinanceExpiry}</dd>
                    </div>
                  )}
                </dl>
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
              <Link href="/vehicles"
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100">
                Cancel
              </Link>
              {step < 6 ? (
                <button type="button" onClick={goNext}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Next
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={mutation.isPending}
                  className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {mutation.isPending ? 'Saving...' : 'Create Vehicle'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
