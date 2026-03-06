'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';

interface Schedule {
  id: string;
  vehicleId: string;
  maintenanceType: string;
  intervalMonths: number | null;
  intervalKm: number | null;
  lastServiceDate: string | null;
  lastServiceOdometer: number | null;
  nextDueDate: string | null;
  nextDueOdometer: number | null;
  isActive: boolean;
  vehicle: { id: string; registrationNumber: string; make: string; model: string; currentOdometer: number | null };
}

interface ListResponse {
  success: boolean;
  data: Schedule[];
}

const MAINTENANCE_TYPES = [
  'routine_service', 'oil_change', 'tyre_rotation', 'tyre_replacement',
  'brake_service', 'battery_replacement', 'filter_replacement',
  'transmission_service', 'coolant_flush', 'inspection', 'other',
];

function dueStatus(s: Schedule): 'overdue' | 'upcoming' | 'ok' {
  const today = new Date();
  if (s.nextDueDate && new Date(s.nextDueDate) < today) return 'overdue';
  if (s.vehicle.currentOdometer && s.nextDueOdometer && s.vehicle.currentOdometer > s.nextDueOdometer) return 'overdue';
  if (s.nextDueDate) {
    const diff = (new Date(s.nextDueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diff <= 30) return 'upcoming';
  }
  return 'ok';
}

const DUE_STYLES = {
  overdue: 'bg-red-100 text-red-800',
  upcoming: 'bg-orange-100 text-orange-800',
  ok: 'bg-green-100 text-green-800',
};

export default function SchedulesPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ vehicleId: '', maintenanceType: 'routine_service', intervalMonths: '', intervalKm: '' });
  const [addError, setAddError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ListResponse>({
    queryKey: ['maintenance-schedules'],
    queryFn: () => api.get<ListResponse>('/maintenance/schedules'),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/maintenance/schedules/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['maintenance-schedules'] }),
  });

  const addMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post('/maintenance/schedules', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['maintenance-schedules'] });
      setShowAdd(false);
      setAddForm({ vehicleId: '', maintenanceType: 'routine_service', intervalMonths: '', intervalKm: '' });
    },
    onError: (err: unknown) => setAddError((err as Error).message),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.vehicleId.trim()) { setAddError('Vehicle ID is required'); return; }
    if (!addForm.intervalMonths && !addForm.intervalKm) { setAddError('At least one interval is required'); return; }
    setAddError(null);
    const body: Record<string, unknown> = {
      vehicleId: addForm.vehicleId.trim(),
      maintenanceType: addForm.maintenanceType,
    };
    if (addForm.intervalMonths) body.intervalMonths = parseInt(addForm.intervalMonths, 10);
    if (addForm.intervalKm) body.intervalKm = parseInt(addForm.intervalKm, 10);
    addMutation.mutate(body);
  }

  const schedules = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link href="/maintenance" className="hover:text-blue-600">Maintenance</Link>
              <span>›</span>
              <span className="text-gray-900">Service Schedules</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Service Schedules</h1>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Schedule
          </button>
        </div>

        {showAdd && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
            <p className="mb-3 text-sm font-medium text-gray-800">New Service Schedule</p>
            <form onSubmit={handleAdd} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs font-medium text-gray-600">Vehicle ID</label>
                <input
                  type="text"
                  value={addForm.vehicleId}
                  onChange={(e) => setAddForm((f) => ({ ...f, vehicleId: e.target.value }))}
                  placeholder="UUID"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
                <select
                  value={addForm.maintenanceType}
                  onChange={(e) => setAddForm((f) => ({ ...f, maintenanceType: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {MAINTENANCE_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Every (months)</label>
                <input
                  type="number"
                  min="1"
                  value={addForm.intervalMonths}
                  onChange={(e) => setAddForm((f) => ({ ...f, intervalMonths: e.target.value }))}
                  placeholder="e.g. 6"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Every (km)</label>
                <input
                  type="number"
                  min="1"
                  value={addForm.intervalKm}
                  onChange={(e) => setAddForm((f) => ({ ...f, intervalKm: e.target.value }))}
                  placeholder="e.g. 10000"
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              {addError && <p className="col-span-full text-xs text-red-600">{addError}</p>}
              <div className="col-span-full flex gap-2">
                <button type="submit" disabled={addMutation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {addMutation.isPending ? 'Saving…' : 'Save Schedule'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)}
                  className="rounded-md px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">Loading…</div>
          )}
          {!isLoading && schedules.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">No service schedules found.</div>
          )}
          {schedules.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Vehicle', 'Type', 'Interval', 'Last Service', 'Next Due Date', 'Next Due km', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schedules.map((s) => {
                  const status = dueStatus(s);
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{s.vehicle.registrationNumber}</p>
                        <p className="text-xs text-gray-400">{s.vehicle.make} {s.vehicle.model}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{s.maintenanceType.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {[s.intervalMonths ? `${s.intervalMonths} mo` : null, s.intervalKm ? `${s.intervalKm.toLocaleString('en-ZA')} km` : null]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.lastServiceDate ? new Date(s.lastServiceDate).toLocaleDateString('en-ZA') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.nextDueDate ? new Date(s.nextDueDate).toLocaleDateString('en-ZA') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {s.nextDueOdometer ? s.nextDueOdometer.toLocaleString('en-ZA') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${DUE_STYLES[status]}`}>
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deactivateMutation.mutate(s.id)}
                          disabled={deactivateMutation.isPending}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
