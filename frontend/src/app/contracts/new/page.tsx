'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCreateContract } from '@/hooks/useContracts';
import type { ContractType } from '@/types';
import { SearchableDropdown } from '@/components/SearchableDropdown';

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: 'lease', label: 'Lease' },
  { value: 'finance', label: 'Finance' },
  { value: 'rental', label: 'Rental' },
  { value: 'service_agreement', label: 'Service Agreement' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'other', label: 'Other' },
];

export default function NewContractPage() {
  const router = useRouter();
  const createContract = useCreateContract();
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    vehicleId: '',
    contractType: 'lease' as ContractType,
    provider: '',
    contractNumber: '',
    startDate: '',
    endDate: '',
    monthlyAmount: '',
    totalContractValue: '',
    depositPaid: '',
    residualValue: '',
    escalationRate: '',
    paymentDay: '',
    renewalType: '',
    renewalNoticeDays: '',
    dailyKmLimit: '',
    monthlyKmLimit: '',
    totalKmLimit: '',
    excessKmRate: '',
    kmAtStart: '',
    terms: '',
    notes: '',
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const showKmLimits = form.contractType === 'lease' || form.contractType === 'rental';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        vehicleId: form.vehicleId,
        contractType: form.contractType,
        provider: form.provider,
        contractNumber: form.contractNumber || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        monthlyAmount: form.monthlyAmount ? parseFloat(form.monthlyAmount) : undefined,
        totalContractValue: form.totalContractValue ? parseFloat(form.totalContractValue) : undefined,
        depositPaid: form.depositPaid ? parseFloat(form.depositPaid) : undefined,
        residualValue: form.residualValue ? parseFloat(form.residualValue) : undefined,
        escalationRate: form.escalationRate ? parseFloat(form.escalationRate) : undefined,
        paymentDay: form.paymentDay ? parseInt(form.paymentDay) : undefined,
        renewalType: form.renewalType || undefined,
        renewalNoticeDays: form.renewalNoticeDays ? parseInt(form.renewalNoticeDays) : undefined,
        ...(showKmLimits ? {
          dailyKmLimit: form.dailyKmLimit ? parseInt(form.dailyKmLimit) : undefined,
          monthlyKmLimit: form.monthlyKmLimit ? parseInt(form.monthlyKmLimit) : undefined,
          totalKmLimit: form.totalKmLimit ? parseInt(form.totalKmLimit) : undefined,
          excessKmRate: form.excessKmRate ? parseFloat(form.excessKmRate) : undefined,
          kmAtStart: form.kmAtStart ? parseInt(form.kmAtStart) : undefined,
        } : {}),
        terms: form.terms || undefined,
        notes: form.notes || undefined,
      };
      const contract = await createContract.mutateAsync(payload);
      router.push(`/contracts/${contract?.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contract');
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/contracts" className="hover:text-blue-600">Contracts</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">New Contract</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Contract</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contract Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <SearchableDropdown
                apiEndpoint="/vehicles"
                displayFormat={(v) => `${v.registrationNumber} — ${v.make} ${v.model}`}
                placeholder="Search vehicles..."
                label="Vehicle"
                required
                onChange={(id) => setForm((f) => ({ ...f, vehicleId: id }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contract Type <span className="text-red-500">*</span>
              </label>
              <select required value={form.contractType} onChange={set('contractType')} className={inputClass}>
                {CONTRACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Provider <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.provider}
                onChange={set('provider')}
                placeholder="e.g. Wesbank, Absa Vehicle Finance"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract Number</label>
              <input
                type="text"
                value={form.contractNumber}
                onChange={set('contractNumber')}
                placeholder="e.g. WB-2024-00123"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input type="date" required value={form.startDate} onChange={set('startDate')} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date <span className="text-red-500">*</span>
              </label>
              <input type="date" required value={form.endDate} onChange={set('endDate')} className={inputClass} />
            </div>
          </div>
        </div>

        {/* Financial fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Financial Terms</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Amount (ZAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlyAmount}
                onChange={set('monthlyAmount')}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Contract Value (ZAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.totalContractValue}
                onChange={set('totalContractValue')}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Paid (ZAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.depositPaid}
                onChange={set('depositPaid')}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Residual Value (ZAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.residualValue}
                onChange={set('residualValue')}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Escalation Rate (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.escalationRate}
                onChange={set('escalationRate')}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Day of Month</label>
            <input
              type="number"
              min="1"
              max="31"
              value={form.paymentDay}
              onChange={set('paymentDay')}
              placeholder="e.g. 1"
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Renewal fields */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Renewal Options</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Type</label>
              <select
                value={form.renewalType}
                onChange={set('renewalType')}
                className={inputClass}
              >
                <option value="">Select renewal type</option>
                <option value="auto">Auto</option>
                <option value="manual">Manual</option>
                <option value="optional">Optional</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Notice Days</label>
              <input
                type="number"
                min="0"
                value={form.renewalNoticeDays}
                onChange={set('renewalNoticeDays')}
                placeholder="e.g. 30"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* KM Limits — only for lease or rental */}
        {showKmLimits && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">KM Limits</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Daily KM Limit</label>
                <input
                  type="number"
                  min="0"
                  value={form.dailyKmLimit}
                  onChange={set('dailyKmLimit')}
                  placeholder="e.g. 150"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly KM Limit</label>
                <input
                  type="number"
                  min="0"
                  value={form.monthlyKmLimit}
                  onChange={set('monthlyKmLimit')}
                  placeholder="e.g. 4000"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total KM Limit</label>
                <input
                  type="number"
                  min="0"
                  value={form.totalKmLimit}
                  onChange={set('totalKmLimit')}
                  placeholder="e.g. 60000"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Excess KM Rate (R per km)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.excessKmRate}
                  onChange={set('excessKmRate')}
                  placeholder="e.g. 2.50"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KM at Start</label>
                <input
                  type="number"
                  min="0"
                  value={form.kmAtStart}
                  onChange={set('kmAtStart')}
                  placeholder="Current odometer reading"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* Notes/terms */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Additional Information</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Terms</label>
            <textarea
              value={form.terms}
              onChange={set('terms')}
              rows={3}
              placeholder="Key contract terms or conditions…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              rows={2}
              placeholder="Internal notes…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createContract.isPending}
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {createContract.isPending ? 'Creating…' : 'Create Contract'}
          </button>
          <Link
            href="/contracts"
            className="flex-1 text-center border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
