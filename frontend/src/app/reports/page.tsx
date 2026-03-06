'use client';

import Link from 'next/link';

const REPORTS = [
  { type: 'fuel-consumption', name: 'Fuel Consumption', description: 'Total litres and cost by vehicle, driver, or fleet with efficiency metrics.', icon: '⛽' },
  { type: 'spend-analysis', name: 'Spend Analysis', description: 'ZAR spend by fleet with month-over-month comparison.', icon: '💰' },
  { type: 'driver-performance', name: 'Driver Performance', description: 'Drivers ranked by efficiency, cost/km, and anomaly count vs fleet average.', icon: '🧑‍✈️' },
  { type: 'vehicle-performance', name: 'Vehicle Performance', description: 'Vehicles ranked by total cost (fuel + maintenance) and fuel efficiency.', icon: '🚌' },
  { type: 'compliance', name: 'Compliance', description: 'Expired and expiring driver licences, PrDPs, and vehicle documents.', icon: '📋' },
  { type: 'budget-variance', name: 'Budget Variance', description: 'Actual fuel spend vs monthly fleet budget with variance percentages.', icon: '📊' },
  { type: 'anomaly-report', name: 'Anomaly Report', description: 'Flagged transactions grouped by anomaly type with resolution rates.', icon: '⚠️' },
  { type: 'forecourt-analysis', name: 'Forecourt Analysis', description: 'Spend by fuel station — average price/litre and transaction volume.', icon: '🏪' },
  { type: 'cost-allocation', name: 'Cost Allocation', description: 'Fuel and maintenance costs allocated by fleet for accounting purposes.', icon: '🧾' },
];

export default function ReportsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-500">Select a report to view, filter, and export data.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => (
            <Link key={r.type} href={`/reports/${r.type}`} className="group">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-2xl">{r.icon}</span>
                  <h2 className="font-semibold text-gray-900 group-hover:text-blue-600">{r.name}</h2>
                </div>
                <p className="text-sm text-gray-500">{r.description}</p>
                <div className="mt-4 text-xs font-medium text-blue-600">Run report →</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
