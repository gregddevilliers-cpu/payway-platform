'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { SearchableDropdown } from '../../../components/SearchableDropdown';

const LICENCE_CODES = ['code_8', 'code_10', 'code_14', 'other'];

const STEPS = [
  'Personal Info',
  'Licence',
  'Assignment',
  'Limits',
  'Emergency',
  'Documents',
  'Review',
] as const;

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/* ──────────────────────────────────────────────
   SA ID Luhn Validation
   ────────────────────────────────────────────── */

function validateSaId(id: string): string | null {
  if (!/^\d{13}$/.test(id)) return 'SA ID must be exactly 13 digits';

  // Extract and validate date of birth (YYMMDD)
  const yy = parseInt(id.substring(0, 2), 10);
  const mm = parseInt(id.substring(2, 4), 10);
  const dd = parseInt(id.substring(4, 6), 10);

  if (mm < 1 || mm > 12) return 'Invalid SA ID number (bad month)';
  if (dd < 1 || dd > 31) return 'Invalid SA ID number (bad day)';

  // Validate actual date — use century pivot: 00-29 → 2000s, 30-99 → 1900s
  const century = yy <= 29 ? 2000 : 1900;
  const fullYear = century + yy;
  const testDate = new Date(fullYear, mm - 1, dd);
  if (
    testDate.getFullYear() !== fullYear ||
    testDate.getMonth() !== mm - 1 ||
    testDate.getDate() !== dd
  ) {
    return 'Invalid SA ID number (invalid date of birth)';
  }

  // Luhn check digit validation
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(id.charAt(i), 10);
    if (i % 2 !== 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }

  if (sum % 10 !== 0) return 'Invalid SA ID number';

  return null;
}

/* ──────────────────────────────────────────────
   Component
   ────────────────────────────────────────────── */

export default function NewDriverPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(0);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    // Step 0 — Personal Info
    firstName: '',
    lastName: '',
    saIdNumber: '',
    passportNumber: '',
    mobile: '',
    email: '',
    // Step 1 — Licence
    licenceNumber: '',
    licenceCode: '',
    licenceExpiry: '',
    prdpNumber: '',
    prdpExpiry: '',
    // Step 2 — Assignment
    fleetId: '',
    vehicleId: '',
    driverPin: '',
    // Step 3 — Limits
    dailySpendLimit: '',
    monthlySpendLimit: '',
    // Step 4 — Emergency
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  const inputCls = 'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
  const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

  function setField(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateStep(s: Step): string | null {
    switch (s) {
      case 0: {
        if (!form.firstName.trim()) return 'First name is required';
        if (!form.lastName.trim()) return 'Last name is required';
        if (!form.mobile.trim()) return 'Mobile number is required';

        // SA ID validation (only if provided — passport is the alternative)
        if (form.saIdNumber.trim()) {
          const idErr = validateSaId(form.saIdNumber.trim());
          if (idErr) return idErr;
        }

        // Must have either SA ID or passport
        if (!form.saIdNumber.trim() && !form.passportNumber.trim()) {
          return 'Either SA ID Number or Passport Number is required';
        }

        // Mobile: SA format +27 or 0XX
        const mobileTrimmed = form.mobile.trim();
        if (!/^(\+27|0)\d{9}$/.test(mobileTrimmed)) {
          return 'Mobile must be in SA format: +27XXXXXXXXX or 0XXXXXXXXX';
        }

        // Email format (optional but must be valid if provided)
        if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
          return 'Invalid email address';
        }

        return null;
      }
      case 1:
        return null;
      case 2: {
        if (!form.fleetId) return 'Fleet is required';
        if (form.driverPin.trim() && !/^\d{4,6}$/.test(form.driverPin.trim())) {
          return 'Driver PIN must be 4-6 digits';
        }
        return null;
      }
      case 3: {
        if (form.dailySpendLimit) {
          const d = parseFloat(form.dailySpendLimit);
          if (isNaN(d) || d < 0) return 'Daily spend limit must be a positive number';
        }
        if (form.monthlySpendLimit) {
          const m = parseFloat(form.monthlySpendLimit);
          if (isNaN(m) || m < 0) return 'Monthly spend limit must be a positive number';
        }
        return null;
      }
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
      api.post<{ success: boolean; data: { id: string } }>('/drivers', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] });
      router.push('/drivers');
    },
  });

  function handleSubmit() {
    setError(null);
    const payload: Record<string, unknown> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      mobile: form.mobile.trim(),
      fleetId: form.fleetId,
    };
    if (form.saIdNumber.trim()) payload.saIdNumber = form.saIdNumber.trim();
    if (form.passportNumber.trim()) payload.passportNumber = form.passportNumber.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.licenceNumber.trim()) payload.licenceNumber = form.licenceNumber.trim();
    if (form.licenceCode) payload.licenceCode = form.licenceCode;
    if (form.licenceExpiry) payload.licenceExpiry = new Date(form.licenceExpiry).toISOString();
    if (form.prdpNumber.trim()) payload.prdpNumber = form.prdpNumber.trim();
    if (form.prdpExpiry) payload.prdpExpiry = new Date(form.prdpExpiry).toISOString();
    if (form.vehicleId) payload.vehicleId = form.vehicleId;
    if (form.driverPin.trim()) payload.driverPin = form.driverPin.trim();
    if (form.dailySpendLimit) payload.dailySpendLimit = parseFloat(form.dailySpendLimit);
    if (form.monthlySpendLimit) payload.monthlySpendLimit = parseFloat(form.monthlySpendLimit);
    if (form.emergencyContactName.trim()) payload.emergencyContactName = form.emergencyContactName.trim();
    if (form.emergencyContactPhone.trim()) payload.emergencyContactPhone = form.emergencyContactPhone.trim();

    mutation.mutate(payload);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/drivers" className="text-sm text-gray-500 hover:text-gray-700">Drivers</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-900">New Driver</span>
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
              {(mutation.error as Error)?.message ?? 'Failed to create driver. Please try again.'}
            </div>
          )}

          {/* Step 0: Personal Info */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Personal Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>First Name <span className="text-red-500">*</span></label>
                  <input type="text" className={inputCls} value={form.firstName}
                    onChange={(e) => setField('firstName', e.target.value)}
                    placeholder="e.g. Sipho" />
                </div>
                <div>
                  <label className={labelCls}>Last Name <span className="text-red-500">*</span></label>
                  <input type="text" className={inputCls} value={form.lastName}
                    onChange={(e) => setField('lastName', e.target.value)}
                    placeholder="e.g. Dlamini" />
                </div>
              </div>
              <div>
                <label className={labelCls}>SA ID Number</label>
                <input type="text" className={inputCls} value={form.saIdNumber}
                  onChange={(e) => setField('saIdNumber', e.target.value)}
                  maxLength={13} placeholder="13-digit SA Identity Number" />
                <p className="mt-1 text-xs text-gray-400">Required if no passport number is provided.</p>
              </div>
              <div>
                <label className={labelCls}>Passport Number</label>
                <input type="text" className={inputCls} value={form.passportNumber}
                  onChange={(e) => setField('passportNumber', e.target.value)}
                  placeholder="Passport number (if no SA ID)" />
                <p className="mt-1 text-xs text-gray-400">Required if no SA ID number is provided.</p>
              </div>
              <div>
                <label className={labelCls}>Mobile Number <span className="text-red-500">*</span></label>
                <input type="text" className={inputCls} value={form.mobile}
                  onChange={(e) => setField('mobile', e.target.value)}
                  placeholder="e.g. +27821234567 or 0821234567" />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" className={inputCls} value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  placeholder="e.g. sipho@example.co.za" />
              </div>
            </div>
          )}

          {/* Step 1: Licence */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Licence Details</h2>
              <div>
                <label className={labelCls}>Licence Number</label>
                <input type="text" className={inputCls} value={form.licenceNumber}
                  onChange={(e) => setField('licenceNumber', e.target.value)}
                  placeholder="Driver's licence number" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Licence Code</label>
                  <select className={inputCls} value={form.licenceCode}
                    onChange={(e) => setField('licenceCode', e.target.value)}>
                    <option value="">Select code...</option>
                    {LICENCE_CODES.map((c) => (
                      <option key={c} value={c}>{c.replace('_', ' ').toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Licence Expiry</label>
                  <input type="date" className={inputCls} value={form.licenceExpiry}
                    onChange={(e) => setField('licenceExpiry', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>PrDP Number</label>
                  <input type="text" className={inputCls} value={form.prdpNumber}
                    onChange={(e) => setField('prdpNumber', e.target.value)}
                    placeholder="Professional Driving Permit" />
                </div>
                <div>
                  <label className={labelCls}>PrDP Expiry</label>
                  <input type="date" className={inputCls} value={form.prdpExpiry}
                    onChange={(e) => setField('prdpExpiry', e.target.value)} />
                </div>
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
                apiEndpoint="/vehicles"
                displayFormat={(item) => `${item.registrationNumber} — ${item.make} ${item.model}`}
                label="Assigned Vehicle"
                placeholder="Search for a vehicle..."
                onChange={(value) => setField('vehicleId', value)}
                initialValue={form.vehicleId}
              />
              <div>
                <label className={labelCls}>Driver PIN</label>
                <input type="text" className={inputCls} value={form.driverPin}
                  onChange={(e) => setField('driverPin', e.target.value)}
                  maxLength={6} placeholder="4-6 digit PIN" />
                <p className="mt-1 text-xs text-gray-400">Used for driver authentication at fuel stations.</p>
              </div>
            </div>
          )}

          {/* Step 3: Limits */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Spending Limits</h2>
              <div>
                <label className={labelCls}>Daily Spend Limit (R)</label>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.dailySpendLimit}
                  onChange={(e) => setField('dailySpendLimit', e.target.value)}
                  placeholder="e.g. 500.00" />
                <p className="mt-1 text-xs text-gray-400">Maximum amount the driver can spend per day in ZAR.</p>
              </div>
              <div>
                <label className={labelCls}>Monthly Spend Limit (R)</label>
                <input type="number" step="0.01" min="0" className={inputCls} value={form.monthlySpendLimit}
                  onChange={(e) => setField('monthlySpendLimit', e.target.value)}
                  placeholder="e.g. 10000.00" />
                <p className="mt-1 text-xs text-gray-400">Maximum amount the driver can spend per month in ZAR.</p>
              </div>
            </div>
          )}

          {/* Step 4: Emergency */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-800">Emergency Contact</h2>
              <div>
                <label className={labelCls}>Emergency Contact Name</label>
                <input type="text" className={inputCls} value={form.emergencyContactName}
                  onChange={(e) => setField('emergencyContactName', e.target.value)}
                  placeholder="e.g. Thandi Dlamini" />
              </div>
              <div>
                <label className={labelCls}>Emergency Contact Phone</label>
                <input type="text" className={inputCls} value={form.emergencyContactPhone}
                  onChange={(e) => setField('emergencyContactPhone', e.target.value)}
                  placeholder="e.g. +27831234567" />
              </div>
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

              {/* Personal Info */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Personal Information</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">First Name</dt>
                    <dd className="mt-0.5 text-gray-900">{form.firstName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Last Name</dt>
                    <dd className="mt-0.5 text-gray-900">{form.lastName}</dd>
                  </div>
                  {form.saIdNumber && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">SA ID Number</dt>
                      <dd className="mt-0.5 font-mono text-xs text-gray-900">{form.saIdNumber}</dd>
                    </div>
                  )}
                  {form.passportNumber && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">Passport Number</dt>
                      <dd className="mt-0.5 text-gray-900">{form.passportNumber}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-gray-500 uppercase">Mobile</dt>
                    <dd className="mt-0.5 text-gray-900">{form.mobile}</dd>
                  </div>
                  {form.email && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">Email</dt>
                      <dd className="mt-0.5 text-gray-900">{form.email}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Licence */}
              {(form.licenceNumber || form.licenceCode || form.licenceExpiry || form.prdpNumber || form.prdpExpiry) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Licence Details</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {form.licenceNumber && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Licence Number</dt>
                        <dd className="mt-0.5 text-gray-900">{form.licenceNumber}</dd>
                      </div>
                    )}
                    {form.licenceCode && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Licence Code</dt>
                        <dd className="mt-0.5 uppercase text-gray-900">{form.licenceCode.replace('_', ' ')}</dd>
                      </div>
                    )}
                    {form.licenceExpiry && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Licence Expiry</dt>
                        <dd className="mt-0.5 text-gray-900">{form.licenceExpiry}</dd>
                      </div>
                    )}
                    {form.prdpNumber && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">PrDP Number</dt>
                        <dd className="mt-0.5 text-gray-900">{form.prdpNumber}</dd>
                      </div>
                    )}
                    {form.prdpExpiry && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">PrDP Expiry</dt>
                        <dd className="mt-0.5 text-gray-900">{form.prdpExpiry}</dd>
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
                    <dd className="mt-0.5 font-mono text-xs text-gray-900">{form.fleetId || '\u2014'}</dd>
                  </div>
                  {form.vehicleId && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">Vehicle ID</dt>
                      <dd className="mt-0.5 font-mono text-xs text-gray-900">{form.vehicleId}</dd>
                    </div>
                  )}
                  {form.driverPin && (
                    <div>
                      <dt className="text-xs text-gray-500 uppercase">Driver PIN</dt>
                      <dd className="mt-0.5 text-gray-900">{'*'.repeat(form.driverPin.length)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Limits */}
              {(form.dailySpendLimit || form.monthlySpendLimit) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Spending Limits</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {form.dailySpendLimit && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Daily Limit</dt>
                        <dd className="mt-0.5 text-gray-900">R {parseFloat(form.dailySpendLimit).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</dd>
                      </div>
                    )}
                    {form.monthlySpendLimit && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Monthly Limit</dt>
                        <dd className="mt-0.5 text-gray-900">R {parseFloat(form.monthlySpendLimit).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Emergency */}
              {(form.emergencyContactName || form.emergencyContactPhone) && (
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Emergency Contact</h3>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {form.emergencyContactName && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Contact Name</dt>
                        <dd className="mt-0.5 text-gray-900">{form.emergencyContactName}</dd>
                      </div>
                    )}
                    {form.emergencyContactPhone && (
                      <div>
                        <dt className="text-xs text-gray-500 uppercase">Contact Phone</dt>
                        <dd className="mt-0.5 text-gray-900">{form.emergencyContactPhone}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
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
              <Link href="/drivers"
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
                  {mutation.isPending ? 'Saving...' : 'Create Driver'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
