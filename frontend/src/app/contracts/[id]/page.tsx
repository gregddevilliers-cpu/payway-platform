'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  useContract,
  useContractPayments,
  useTerminateContract,
  useRenewContract,
  useRecordPayment,
} from '@/hooks/useContracts';
import { formatZAR, formatDate } from '@/lib/utils';
import type { ContractType, ContractStatus } from '@/types';

const TYPE_LABELS: Record<ContractType, string> = {
  lease: 'Lease',
  finance: 'Finance',
  rental: 'Rental',
  service_agreement: 'Service Agreement',
  insurance: 'Insurance',
  warranty: 'Warranty',
  other: 'Other',
};

const STATUS_STYLES: Record<ContractStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-800',
  expiring: 'bg-orange-100 text-orange-800',
  expired: 'bg-red-100 text-red-700',
  terminated: 'bg-red-200 text-red-900',
  renewed: 'bg-blue-100 text-blue-700',
};

function toISO(date: Date) {
  return date.toISOString().split('T')[0];
}

export default function ContractDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'payments'>('overview');
  const [showTerminate, setShowTerminate] = useState(false);
  const [terminationReason, setTerminationReason] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: toISO(new Date()),
    amount: '',
    vatAmount: '',
    paymentMethod: '',
    reference: '',
    notes: '',
  });
  const [actionError, setActionError] = useState('');

  const { data: contract, isLoading, error } = useContract(id);
  const { data: paymentsRes } = useContractPayments(id);
  const terminateMut = useTerminateContract();
  const renewMut = useRenewContract();
  const recordPaymentMut = useRecordPayment();

  if (isLoading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (error || !contract) return <div className="p-8 text-red-600">Contract not found.</div>;

  const payments = paymentsRes?.data ?? [];
  const totalPaid = paymentsRes?.meta?.totalPaid ?? 0;

  const monthlyAmount = contract.monthlyAmount ? Number(contract.monthlyAmount) : null;
  const totalValue = contract.totalContractValue ? Number(contract.totalContractValue) : null;
  const depositPaid = contract.depositPaid ? Number(contract.depositPaid) : null;
  const residualValue = contract.residualValue ? Number(contract.residualValue) : null;

  const handleTerminate = async () => {
    if (!terminationReason.trim()) return;
    setActionError('');
    try {
      await terminateMut.mutateAsync({ id, terminationReason });
      setShowTerminate(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to terminate');
    }
  };

  const handleRenew = async () => {
    setActionError('');
    try {
      const newContract = await renewMut.mutateAsync(id);
      if (newContract?.id) router.push(`/contracts/${newContract.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to renew');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    try {
      await recordPaymentMut.mutateAsync({
        contractId: id,
        paymentDate: paymentForm.paymentDate,
        amount: parseFloat(paymentForm.amount),
        vatAmount: paymentForm.vatAmount ? parseFloat(paymentForm.vatAmount) : undefined,
        paymentMethod: paymentForm.paymentMethod || undefined,
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
      });
      setShowPaymentForm(false);
      setPaymentForm({ paymentDate: toISO(new Date()), amount: '', vatAmount: '', paymentMethod: '', reference: '', notes: '' });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to record payment');
    }
  };

  const canTerminate = ['active', 'expiring', 'draft'].includes(contract.status);
  const canRenew = ['active', 'expiring', 'expired'].includes(contract.status);

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/contracts" className="hover:text-blue-600">Contracts</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">
          {contract.vehicle?.registrationNumber ?? contract.id.slice(0, 8)}
        </span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">
              {contract.vehicle
                ? `${contract.vehicle.registrationNumber} — ${TYPE_LABELS[contract.contractType]}`
                : TYPE_LABELS[contract.contractType]}
            </h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[contract.status]}`}>
              {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {contract.provider}
            {contract.contractNumber && <span className="ml-2 font-mono text-xs text-gray-400">#{contract.contractNumber}</span>}
          </p>
          {contract.vehicle && (
            <p className="text-sm text-gray-500 mt-0.5">{contract.vehicle.make} {contract.vehicle.model}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canRenew && (
            <button
              onClick={handleRenew}
              disabled={renewMut.isPending}
              className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50"
            >
              {renewMut.isPending ? 'Renewing…' : 'Renew'}
            </button>
          )}
          {canTerminate && (
            <button
              onClick={() => setShowTerminate(true)}
              className="px-3 py-1.5 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
            >
              Terminate
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-4">
          {actionError}
        </div>
      )}

      {/* Financial summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Monthly Amount', value: monthlyAmount !== null ? formatZAR(monthlyAmount) : '—' },
          { label: 'Total Paid', value: formatZAR(totalPaid) },
          { label: 'Total Contract Value', value: totalValue !== null ? formatZAR(totalValue) : '—' },
          { label: 'Deposit Paid', value: depositPaid !== null ? formatZAR(depositPaid) : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xl font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 flex">
          {(['overview', 'payments'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab === 'payments' ? `Payments (${payments.length})` : 'Overview'}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {[
              { label: 'Start Date', value: formatDate(contract.startDate) },
              { label: 'End Date', value: formatDate(contract.endDate) },
              { label: 'Days Remaining', value: contract.daysRemaining !== undefined ? `${contract.daysRemaining}d` : '—' },
              { label: 'Payment Day', value: contract.paymentDay !== null ? `Day ${contract.paymentDay}` : '—' },
              { label: 'Residual Value', value: residualValue !== null ? formatZAR(residualValue) : '—' },
              {
                label: 'Escalation Rate',
                value: contract.escalationRate !== null ? `${Number(contract.escalationRate).toFixed(2)}%` : '—',
              },
              { label: 'Renewal Type', value: contract.renewalType ?? '—' },
              { label: 'Renewal Notice', value: contract.renewalNoticeDays !== null ? `${contract.renewalNoticeDays} days` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between border-b border-gray-50 pb-2">
                <span className="text-gray-500">{label}</span>
                <span className="text-gray-900 font-medium">{value}</span>
              </div>
            ))}
            {contract.terms && (
              <div className="col-span-2">
                <p className="text-gray-500 mb-1">Terms</p>
                <p className="text-gray-700 whitespace-pre-wrap text-xs bg-gray-50 rounded p-3">{contract.terms}</p>
              </div>
            )}
            {contract.notes && (
              <div className="col-span-2">
                <p className="text-gray-500 mb-1">Notes</p>
                <p className="text-gray-700 text-xs bg-gray-50 rounded p-3">{contract.notes}</p>
              </div>
            )}
            {contract.terminationReason && (
              <div className="col-span-2">
                <p className="text-gray-500 mb-1">Termination Reason</p>
                <p className="text-red-700 text-xs bg-red-50 rounded p-3">{contract.terminationReason}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Total paid: <span className="font-semibold text-gray-900">{formatZAR(totalPaid)}</span>
              </span>
              <button
                onClick={() => setShowPaymentForm((v) => !v)}
                className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                + Record Payment
              </button>
            </div>

            {showPaymentForm && (
              <form onSubmit={handleRecordPayment} className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                    <input
                      type="date"
                      required
                      value={paymentForm.paymentDate}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, paymentDate: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount (ZAR) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">VAT Amount (ZAR)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.vatAmount}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, vatAmount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Payment Method</label>
                    <input
                      type="text"
                      value={paymentForm.paymentMethod}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                      placeholder="EFT, debit order…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Reference</label>
                    <input
                      type="text"
                      value={paymentForm.reference}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
                      placeholder="Bank ref…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                    <input
                      type="text"
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={recordPaymentMut.isPending}
                    className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {recordPaymentMut.isPending ? 'Saving…' : 'Save Payment'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPaymentForm(false)}
                    className="border border-gray-300 text-gray-700 px-4 py-1.5 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {payments.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No payments recorded yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Amount</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">VAT</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Method</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Reference</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{formatDate(p.paymentDate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatZAR(Number(p.amount))}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {p.vatAmount ? formatZAR(Number(p.vatAmount)) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.paymentMethod ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.reference ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.status === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Terminate modal */}
      {showTerminate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Terminate Contract</h2>
            <p className="text-sm text-gray-500 mb-4">This action cannot be undone. Please provide a reason.</p>
            <textarea
              value={terminationReason}
              onChange={(e) => setTerminationReason(e.target.value)}
              rows={3}
              placeholder="Reason for termination…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={handleTerminate}
                disabled={!terminationReason.trim() || terminateMut.isPending}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {terminateMut.isPending ? 'Terminating…' : 'Terminate Contract'}
              </button>
              <button
                onClick={() => setShowTerminate(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
