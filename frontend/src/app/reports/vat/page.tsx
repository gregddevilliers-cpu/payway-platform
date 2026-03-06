'use client';

import { useState } from 'react';
import { useVatSummary, useVatByFleet, useVatByCostCentre, useVatTrend } from '@/hooks/useVat';
import { formatZAR } from '@/lib/utils';

type View = 'fleet' | 'cost_centre' | 'monthly';

function toISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export default function VatReportPage() {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [dateTo, setDateTo] = useState(toISO(now));
  const [view, setView] = useState<View>('fleet');

  const dateParams = { dateFrom, dateTo };

  const { data: summary, isLoading: loadingSummary } = useVatSummary(dateParams);
  const { data: byFleet, isLoading: loadingFleet } = useVatByFleet(dateParams);
  const { data: byCostCentre, isLoading: loadingCC } = useVatByCostCentre(dateParams);
  const { data: trend, isLoading: loadingTrend } = useVatTrend(12);

  const isLoading = loadingSummary || loadingFleet || loadingCC || loadingTrend;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">VAT Report</h1>
        <p className="text-sm text-gray-500 mt-1">15% SA VAT breakdown across all transaction types</p>
      </div>

      {/* Date range */}
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
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Total Excl. VAT', value: summary.combined.exclVat },
            { label: 'Total VAT (15%)', value: summary.combined.vatAmount, highlight: true },
            { label: 'Total Incl. VAT', value: summary.combined.inclVat },
          ].map(({ label, value, highlight }) => (
            <div key={label} className={`bg-white rounded-xl border p-4 ${highlight ? 'border-blue-200' : 'border-gray-200'}`}>
              <div className={`text-2xl font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
                {formatZAR(value)}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Breakdown by category */}
      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Fuel VAT', vat: summary.fuelVat.vatAmount, count: `${summary.fuelVat.transactionCount} transactions` },
            { label: 'Maintenance VAT', vat: summary.maintenanceVat.vatAmount, count: `${summary.maintenanceVat.recordCount} records` },
            { label: 'Repair VAT', vat: summary.repairVat.vatAmount, count: `${summary.repairVat.jobCount} jobs` },
          ].map(({ label, vat, count }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-lg font-bold text-gray-900">{formatZAR(vat)}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{count}</div>
            </div>
          ))}
        </div>
      )}

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        {(['fleet', 'cost_centre', 'monthly'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === v ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            {v === 'fleet' ? 'By Fleet' : v === 'cost_centre' ? 'By Cost Centre' : 'Monthly Trend'}
          </button>
        ))}
      </div>

      {/* Table views */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading…</div>
        ) : view === 'fleet' ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Fleet</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Excl. VAT</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">VAT (15%)</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Incl. VAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(byFleet ?? []).map((r) => (
                <tr key={r.fleetId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.fleetName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatZAR(r.total.exclVat)}</td>
                  <td className="px-4 py-3 text-right text-blue-700 font-medium">{formatZAR(r.total.vatAmount)}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatZAR(r.total.inclVat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : view === 'cost_centre' ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Cost Centre</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Code</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Excl. VAT</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">VAT (15%)</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Incl. VAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(byCostCentre ?? []).map((r) => (
                <tr key={r.costCentreId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.costCentreName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.code}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatZAR(r.total.exclVat)}</td>
                  <td className="px-4 py-3 text-right text-blue-700 font-medium">{formatZAR(r.total.vatAmount)}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatZAR(r.total.inclVat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Month</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Fuel VAT</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Maintenance VAT</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Repair VAT</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Total VAT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(trend ?? []).map((r) => (
                <tr key={`${r.year}-${r.month}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {new Date(r.year, r.month - 1).toLocaleString('en-ZA', { month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatZAR(r.fuelVat)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatZAR(r.maintenanceVat)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{formatZAR(r.repairVat)}</td>
                  <td className="px-4 py-3 text-right font-medium text-blue-700">{formatZAR(r.totalVat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
