'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useCostCentre } from '@/hooks/useCostCentres';
import { formatZAR, formatDate } from '@/lib/utils';

export default function CostCentreDetailPage() {
  const { id } = useParams() as { id: string };
  const [activeTab, setActiveTab] = useState<'transactions' | 'vehicles' | 'fleets'>('transactions');

  const { data: ccRes, isLoading, error } = useCostCentre(id);
  const cc = ccRes?.data;

  if (isLoading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (error || !cc) return <div className="p-8 text-red-600">Cost centre not found.</div>;

  const spend = cc.spend;
  const budget = spend?.budget ?? null;
  const totalSpend = spend?.totalSpend ?? 0;
  const spendPct = budget && budget > 0 ? Math.min(100, (totalSpend / budget) * 100) : 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/cost-centres" className="hover:text-blue-600">Cost Centres</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{cc.name}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{cc.name}</h1>
            <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-gray-600">{cc.code}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cc.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
              {cc.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {cc.description && <p className="text-gray-500 mt-1 text-sm">{cc.description}</p>}
          {cc.parent && (
            <p className="text-sm text-gray-500 mt-0.5">
              Parent:{' '}
              <Link href={`/cost-centres/${cc.parent.id}`} className="text-blue-600 hover:underline">
                {cc.parent.name}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Spend breakdown cards */}
      {spend && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Fuel Spend', value: spend.fuelSpend },
            { label: 'Maintenance', value: spend.maintenanceSpend },
            { label: 'Repairs', value: spend.repairSpend },
            { label: 'Total Spend', value: spend.totalSpend, bold: true },
          ].map(({ label, value, bold }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className={`text-xl font-bold ${bold ? 'text-gray-900' : 'text-gray-700'}`}>
                {formatZAR(value)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Budget vs actual */}
      {budget !== null && spend && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex justify-between items-center mb-2 text-sm">
            <span className="font-medium text-gray-700">Budget vs Actual</span>
            <span className={spend.variance !== null && spend.variance >= 0 ? 'text-green-700' : 'text-red-700'}>
              {spend.variance !== null
                ? `${formatZAR(Math.abs(spend.variance))} ${spend.variance >= 0 ? 'under' : 'over'} budget`
                : ''}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all ${spendPct >= 100 ? 'bg-red-500' : spendPct >= 75 ? 'bg-orange-400' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, spendPct)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatZAR(totalSpend)} spent</span>
            <span>{formatZAR(budget)} budget</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200 flex">
          {(['transactions', 'vehicles', 'fleets'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'vehicles' && (
          <div className="p-4">
            {!cc.vehicles?.length ? (
              <p className="text-gray-500 text-sm">No vehicles assigned.</p>
            ) : (
              <div className="space-y-2">
                {cc.vehicles.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="font-mono text-sm font-medium">{v.registrationNumber}</span>
                    <span className="text-sm text-gray-500">{v.make} {v.model}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'fleets' && (
          <div className="p-4">
            {!cc.fleets?.length ? (
              <p className="text-gray-500 text-sm">No fleets assigned.</p>
            ) : (
              <div className="space-y-2">
                {cc.fleets.map((f) => (
                  <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="font-medium text-sm">{f.name}</span>
                    <span className="text-xs text-gray-400">{f.code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="p-4 text-sm text-gray-500">
            Transactions for this cost centre — filter by date above.
          </div>
        )}
      </div>
    </div>
  );
}
