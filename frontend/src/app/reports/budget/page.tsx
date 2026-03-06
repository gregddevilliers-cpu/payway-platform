'use client';

import { useState } from 'react';
import { useFleetBudgetVariance, useCostCentreBudgetVariance, useBudgetAlerts } from '@/hooks/useBudget';
import { formatZAR } from '@/lib/utils';
import type { BudgetVarianceEntry, BudgetStatus } from '@/types';

type View = 'fleet' | 'cost_centre';

function toISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

const STATUS_STYLES: Record<BudgetStatus, string> = {
  under_budget: 'bg-green-100 text-green-800',
  at_risk: 'bg-orange-100 text-orange-800',
  over_budget: 'bg-red-100 text-red-800',
};

const STATUS_LABELS: Record<BudgetStatus, string> = {
  under_budget: 'On Track',
  at_risk: 'At Risk',
  over_budget: 'Over Budget',
};

function SpendBar({ actual, budget }: { actual: number; budget: number }) {
  const pct = budget > 0 ? Math.min(100, (actual / budget) * 100) : 0;
  const color = pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-orange-400' : 'bg-green-500';
  return (
    <div className="w-24 bg-gray-100 rounded-full h-2">
      <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BudgetVariancePage() {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(toISO(now));
  const [view, setView] = useState<View>('fleet');

  const dateParams = { dateFrom, dateTo };
  const { data: fleetData, isLoading: loadingFleet } = useFleetBudgetVariance(dateParams);
  const { data: ccData, isLoading: loadingCC } = useCostCentreBudgetVariance(dateParams);
  const { data: alerts } = useBudgetAlerts();

  const rows: BudgetVarianceEntry[] = view === 'fleet' ? (fleetData ?? []) : (ccData ?? []);
  const isLoading = view === 'fleet' ? loadingFleet : loadingCC;

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalSpend = rows.reduce((s, r) => s + r.actualSpend, 0);
  const totalVariance = totalBudget - totalSpend;
  const overCount = rows.filter((r) => r.status === 'over_budget').length;
  const alertCount = (alerts ?? []).length;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Budget Variance</h1>
        <p className="text-sm text-gray-500 mt-1">Actual spend vs budget for fleets and cost centres</p>
      </div>

      {/* Alerts banner */}
      {alertCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 mb-6 text-sm text-orange-800">
          ⚠ {alertCount} budget alert{alertCount > 1 ? 's' : ''} active this month
        </div>
      )}

      {/* Date + view controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="ml-auto flex gap-2">
          {(['fleet', 'cost_centre'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                view === v ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
              }`}
            >
              {v === 'fleet' ? 'By Fleet' : 'By Cost Centre'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Budget', value: formatZAR(totalBudget) },
          { label: 'Total Spend', value: formatZAR(totalSpend) },
          { label: 'Total Variance', value: formatZAR(totalVariance), color: totalVariance >= 0 ? 'text-green-700' : 'text-red-700' },
          { label: 'Over Budget', value: `${overCount} of ${rows.length}`, color: overCount > 0 ? 'text-red-700' : 'text-gray-900' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No {view === 'fleet' ? 'fleets' : 'cost centres'} with budgets set.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">
                  {view === 'fleet' ? 'Fleet' : 'Cost Centre'}
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Budget</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Actual Spend</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Variance</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">%</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Progress</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.entityId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.entityName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatZAR(r.budget)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatZAR(r.actualSpend)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.variance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatZAR(Math.abs(r.variance))} {r.variance >= 0 ? 'under' : 'over'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 text-xs">
                    {Math.abs(r.variancePercent).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">
                    <SpendBar actual={r.actualSpend} budget={r.budget} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status]}`}>
                      {STATUS_LABELS[r.status]}
                    </span>
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
