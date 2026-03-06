'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';

interface DashboardSummary {
  period: string;
  kpis: {
    totalVehicles: number;
    activeVehicles: number;
    vehiclesInMaintenance: number;
    totalDrivers: number;
    activeDrivers: number;
    totalFleets: number;
    openIncidents: number;
    fuelSpend: { current: number; previous: number; changePercent: number | null };
    totalLitres: number;
    fuelTransactionCount: number;
    complianceScore: number;
    avgFuelEfficiency: string | null;
    overdueCompliance: number;
  };
}

interface DashboardCharts {
  spendTrend: { date: string; spend: number }[];
  byFleet: { fleetId: string; name: string; spend: number }[];
  topVehicles: { vehicleId: string; registrationNumber: string; spend: number }[];
  fuelTypeDistribution: { type: string; spend: number }[];
  volumeTrend: { date: string; count: number }[];
}

interface Alert {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  link: string;
  entityType: string;
}

const PERIODS = [
  { label: 'This Month', value: '1M' },
  { label: 'Last Month', value: 'LM' },
  { label: 'Last 3 Months', value: '3M' },
  { label: 'Last 6 Months', value: '6M' },
  { label: 'This Year', value: '12M' },
];

const ALERT_COLOURS = {
  critical: 'border-red-200 bg-red-50',
  warning: 'border-orange-200 bg-orange-50',
  info: 'border-blue-200 bg-blue-50',
};

const ALERT_DOT = {
  critical: 'bg-red-500',
  warning: 'bg-orange-500',
  info: 'bg-blue-500',
};

function formatZAR(v: number): string {
  return `R ${v.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ChangeArrow({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const isUp = pct >= 0;
  return (
    <span className={`ml-1 text-xs font-medium ${isUp ? 'text-red-600' : 'text-green-600'}`}>
      {isUp ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, sub, link }: { label: string; value: string | number; sub?: React.ReactNode; link?: string }) {
  const content = (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
  return link ? <Link href={link}>{content}</Link> : content;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState('1M');

  const { data: summaryRes, isLoading: sumLoading } = useQuery<{ data: DashboardSummary }>({
    queryKey: ['dashboard-summary', period],
    queryFn: () => api.get(`/dashboard/summary?period=${period}`),
    refetchInterval: 60000,
  });

  const { data: chartsRes } = useQuery<{ data: DashboardCharts }>({
    queryKey: ['dashboard-charts', period],
    queryFn: () => api.get(`/dashboard/charts?period=${period}`),
    refetchInterval: 60000,
  });

  const { data: alertsRes } = useQuery<{ data: Alert[] }>({
    queryKey: ['dashboard-alerts'],
    queryFn: () => api.get('/dashboard/alerts'),
    refetchInterval: 60000,
  });

  const kpis = summaryRes?.data?.kpis;
  const charts = chartsRes?.data;
  const alerts = alertsRes?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">Fleet overview and key metrics</p>
          </div>
          {/* Period selector */}
          <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
            {PERIODS.map((p) => (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${period === p.value ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {sumLoading && <div className="py-12 text-center text-sm text-gray-400">Loading dashboard…</div>}

        {kpis && (
          <div className="lg:grid lg:grid-cols-4 lg:gap-6">
            {/* Left: KPIs + charts */}
            <div className="lg:col-span-3 space-y-6">
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard label="Active Vehicles" value={kpis.activeVehicles}
                  sub={<span className="text-xs text-gray-400">of {kpis.totalVehicles} total</span>}
                  link="/vehicles" />
                <KpiCard label="Active Drivers" value={kpis.activeDrivers}
                  sub={<span className="text-xs text-gray-400">of {kpis.totalDrivers} total</span>}
                  link="/drivers" />
                <KpiCard label="Fuel Spend" value={formatZAR(kpis.fuelSpend.current)}
                  sub={<ChangeArrow pct={kpis.fuelSpend.changePercent} />} />
                <KpiCard label="Compliance Score"
                  value={`${kpis.complianceScore}%`}
                  sub={kpis.overdueCompliance > 0 ? <span className="text-xs text-red-600">{kpis.overdueCompliance} overdue</span> : <span className="text-xs text-green-600">All OK</span>}
                  link="/reports/compliance" />
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KpiCard label="Vehicles in Repair" value={kpis.vehiclesInMaintenance}
                  sub={<span className="text-xs text-orange-500">status: in repair/maintenance</span>}
                  link="/repairs" />
                <KpiCard label="Open Incidents" value={kpis.openIncidents} link="/incidents" />
                <KpiCard label="Total Litres" value={kpis.totalLitres.toLocaleString('en-ZA')} />
                <KpiCard label="Avg Efficiency" value={kpis.avgFuelEfficiency ?? '—'} />
              </div>

              {/* Spend trend */}
              {charts && charts.spendTrend.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-4 text-sm font-semibold text-gray-700">Fuel Spend Trend</h2>
                  <div className="overflow-x-auto">
                    <div className="flex h-40 items-end gap-1 min-w-max">
                      {(() => {
                        const max = Math.max(...charts.spendTrend.map((d) => d.spend), 1);
                        return charts.spendTrend.map((d) => (
                          <div key={d.date} className="flex flex-col items-center gap-1" title={`${d.date}: ${formatZAR(d.spend)}`}>
                            <div className="w-4 rounded-t bg-blue-500 hover:bg-blue-600 transition-colors"
                              style={{ height: `${Math.max((d.spend / max) * 140, 2)}px` }} />
                            <span className="text-[9px] text-gray-400 rotate-45 origin-left whitespace-nowrap">{d.date.slice(5)}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Fleet spend + fuel type */}
              {charts && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">Spend by Fleet</h2>
                    {charts.byFleet.length === 0 ? <p className="text-sm text-gray-400">No data</p> : (
                      <div className="space-y-2">
                        {charts.byFleet.slice(0, 6).map((f) => {
                          const max = charts.byFleet[0]?.spend ?? 1;
                          return (
                            <div key={f.fleetId}>
                              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                                <span className="truncate max-w-[60%]">{f.name}</span>
                                <span className="font-medium">{formatZAR(f.spend)}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-gray-100">
                                <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${(f.spend / max) * 100}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-3 text-sm font-semibold text-gray-700">Fuel Type Distribution</h2>
                    {charts.fuelTypeDistribution.length === 0 ? <p className="text-sm text-gray-400">No data</p> : (
                      <div className="space-y-2">
                        {charts.fuelTypeDistribution.map((f) => {
                          const total = charts.fuelTypeDistribution.reduce((s, x) => s + x.spend, 0);
                          const pct = total > 0 ? (f.spend / total) * 100 : 0;
                          return (
                            <div key={f.type}>
                              <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                                <span className="capitalize">{f.type}</span>
                                <span className="font-medium">{pct.toFixed(1)}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-gray-100">
                                <div className="h-1.5 rounded-full bg-green-400" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Top vehicles */}
              {charts && charts.topVehicles.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-3 text-sm font-semibold text-gray-700">Top 10 Vehicles by Spend</h2>
                  <div className="space-y-2">
                    {charts.topVehicles.map((v) => {
                      const max = charts.topVehicles[0]?.spend ?? 1;
                      return (
                        <div key={v.vehicleId}>
                          <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                            <span>{v.registrationNumber}</span>
                            <span className="font-medium">{formatZAR(v.spend)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100">
                            <div className="h-1.5 rounded-full bg-orange-400" style={{ width: `${(v.spend / max) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Alerts panel */}
            <div className="mt-6 lg:mt-0">
              <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-700">Alerts</h2>
                {alerts.length === 0 ? (
                  <p className="text-sm text-gray-400">No active alerts.</p>
                ) : (
                  <div className="space-y-3">
                    {alerts.map((a, i) => (
                      <Link key={i} href={a.link} className={`block rounded-lg border p-3 ${ALERT_COLOURS[a.severity]} hover:opacity-80 transition-opacity`}>
                        <div className="flex items-start gap-2">
                          <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${ALERT_DOT[a.severity]}`} />
                          <div>
                            <p className="text-xs font-semibold text-gray-800">{a.title}</p>
                            <p className="mt-0.5 text-xs text-gray-600">{a.description}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick links */}
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-gray-700">Quick Links</h2>
                <div className="space-y-1 text-sm">
                  {[
                    { href: '/fuel/new', label: 'Log Fill-up' },
                    { href: '/incidents/new', label: 'Log Incident' },
                    { href: '/maintenance/new', label: 'Log Service' },
                    { href: '/anomalies', label: 'View Anomalies' },
                    { href: '/reports', label: 'Reports' },
                    { href: '/audit-log', label: 'Audit Trail' },
                  ].map((l) => (
                    <Link key={l.href} href={l.href}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-blue-600 hover:bg-blue-50">
                      <span>→</span> {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
