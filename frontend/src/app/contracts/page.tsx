'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useContracts, useContractSummary } from '@/hooks/useContracts';
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

const TYPE_STYLES: Record<ContractType, string> = {
  lease: 'bg-blue-100 text-blue-800',
  finance: 'bg-purple-100 text-purple-800',
  rental: 'bg-teal-100 text-teal-800',
  service_agreement: 'bg-indigo-100 text-indigo-800',
  insurance: 'bg-orange-100 text-orange-800',
  warranty: 'bg-yellow-100 text-yellow-800',
  other: 'bg-gray-100 text-gray-600',
};

const STATUS_STYLES: Record<ContractStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  active: 'bg-green-100 text-green-800',
  expiring: 'bg-orange-100 text-orange-800',
  expired: 'bg-red-100 text-red-700',
  terminated: 'bg-red-200 text-red-900',
  renewed: 'bg-blue-100 text-blue-700',
};

function DaysRemaining({ days }: { days?: number }) {
  if (days === undefined || days === null) return <span className="text-gray-400">—</span>;
  if (days < 0) return <span className="font-semibold text-red-700">EXPIRED</span>;
  const color = days <= 30 ? 'text-red-700' : days <= 90 ? 'text-orange-600' : 'text-green-700';
  return <span className={`font-medium ${color}`}>{days}d</span>;
}

export default function ContractsPage() {
  const [filters, setFilters] = useState({
    contractType: '' as ContractType | '',
    status: '' as ContractStatus | '',
    provider: '',
    expiringDays: '' as string,
  });

  const queryParams = {
    ...(filters.contractType ? { contractType: filters.contractType } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(filters.expiringDays ? { expiringDays: parseInt(filters.expiringDays) } : {}),
  };

  const { data: contractsRes, isLoading } = useContracts(queryParams);
  const { data: summary } = useContractSummary();

  const contracts = contractsRes?.data ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
          <p className="text-sm text-gray-500 mt-1">Vehicle leases, finance, rental & service agreements</p>
        </div>
        <Link
          href="/contracts/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Contract
        </Link>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Active Contracts', value: summary.activeContracts.toString() },
            { label: 'Monthly Obligations', value: formatZAR(summary.totalMonthlyObligations) },
            {
              label: 'Expiring Within 30 Days',
              value: summary.expiringWithin30Days.toString(),
              color: summary.expiringWithin30Days > 0 ? 'text-orange-700' : 'text-gray-900',
            },
            { label: 'Total Remaining Liabilities', value: formatZAR(summary.totalRemainingLiabilities) },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-center">
        <select
          value={filters.contractType}
          onChange={(e) => setFilters((f) => ({ ...f, contractType: e.target.value as ContractType | '' }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Types</option>
          {(Object.keys(TYPE_LABELS) as ContractType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as ContractStatus | '' }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
          <option value="renewed">Renewed</option>
        </select>

        <input
          type="text"
          placeholder="Filter by provider…"
          value={filters.provider}
          onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={filters.expiringDays}
          onChange={(e) => setFilters((f) => ({ ...f, expiringDays: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Any expiry</option>
          <option value="30">Expiring within 30 days</option>
          <option value="60">Expiring within 60 days</option>
          <option value="90">Expiring within 90 days</option>
        </select>

        {(filters.contractType || filters.status || filters.provider || filters.expiringDays) && (
          <button
            onClick={() => setFilters({ contractType: '', status: '', provider: '', expiringDays: '' })}
            className="text-sm text-gray-500 hover:text-gray-900 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : contracts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No contracts found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Vehicle</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Provider</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Start</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">End</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Monthly</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Days Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/contracts/${c.id}`} className="font-mono text-sm font-medium text-blue-700 hover:underline">
                      {c.vehicle?.registrationNumber ?? '—'}
                    </Link>
                    {c.vehicle && (
                      <div className="text-xs text-gray-400">{c.vehicle.make} {c.vehicle.model}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[c.contractType]}`}>
                      {TYPE_LABELS[c.contractType]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.provider}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatDate(c.startDate)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatDate(c.endDate)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {c.monthlyAmount ? formatZAR(Number(c.monthlyAmount)) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status]}`}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <DaysRemaining days={c.daysRemaining} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
