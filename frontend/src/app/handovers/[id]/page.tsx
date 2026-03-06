'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../lib/api';

interface HandoverDetail {
  id: string;
  handoverNumber: string;
  handoverType: string;
  handoverDatetime: string;
  odometerReading: number | null;
  fuelLevel: string | null;
  exteriorCondition: string | null;
  interiorCondition: string | null;
  damageNotes: string | null;
  equipmentChecklist: string[] | null;
  notes: string | null;
  photosJson: string[] | null;
  createdAt: string;
  vehicle: { id: string; registrationNumber: string; make: string; model: string };
  driver: { id: string; firstName: string; lastName: string } | null;
  fleet: { id: string; name: string } | null;
}

interface DetailResponse {
  success: boolean;
  data: HandoverDetail;
}

const TYPE_COLOURS: Record<string, string> = {
  check_out: 'bg-blue-100 text-blue-800',
  check_in: 'bg-green-100 text-green-800',
};

const FUEL_LABELS: Record<string, string> = {
  empty: 'Empty',
  quarter: '1/4',
  half: '1/2',
  three_quarter: '3/4',
  full: 'Full',
};

const CONDITION_COLOURS: Record<string, string> = {
  good: 'text-green-700',
  fair: 'text-yellow-700',
  poor: 'text-red-700',
};

const ALL_EQUIPMENT = [
  'branding',
  'lights',
  'radio',
  'fire_extinguisher',
  'first_aid_kit',
  'tools',
  'jack',
  'spare_wheel',
  'warning_triangle',
  'reflective_vest',
  'other',
];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value ?? '\u2014'}</dd>
    </div>
  );
}

export default function HandoverDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading, isError } = useQuery<DetailResponse>({
    queryKey: ['handover', id],
    queryFn: () => api.get<DetailResponse>(`/handovers/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading...</div>;
  }

  if (isError || !data?.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load handover.
        </div>
      </div>
    );
  }

  const h = data.data;
  const presentEquipment = h.equipmentChecklist ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/handovers" className="hover:text-blue-600">Handovers</Link>
          <span>{'\u203A'}</span>
          <span className="text-gray-900">{h.handoverNumber}</span>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{h.handoverNumber}</h1>
            <span className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOURS[h.handoverType] ?? 'bg-gray-100 text-gray-600'}`}>
              {h.handoverType.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {h.vehicle.registrationNumber} \u2014 {new Date(h.handoverDatetime).toLocaleString('en-ZA')}
          </p>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Left column: Handover details */}
          <div className="col-span-2 space-y-6">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-800">Handover Details</h2>
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Type" value={h.handoverType.replace(/_/g, ' ')} />
                <Field label="Date / time" value={new Date(h.handoverDatetime).toLocaleString('en-ZA')} />
                <Field
                  label="Odometer"
                  value={h.odometerReading != null ? `${h.odometerReading.toLocaleString('en-ZA')} km` : null}
                />
                <Field
                  label="Fuel level"
                  value={h.fuelLevel ? (FUEL_LABELS[h.fuelLevel] ?? h.fuelLevel.replace(/_/g, ' ')) : null}
                />
                <Field
                  label="Exterior condition"
                  value={
                    h.exteriorCondition ? (
                      <span className={CONDITION_COLOURS[h.exteriorCondition] ?? ''}>
                        {h.exteriorCondition.charAt(0).toUpperCase() + h.exteriorCondition.slice(1)}
                      </span>
                    ) : null
                  }
                />
                <Field
                  label="Interior condition"
                  value={
                    h.interiorCondition ? (
                      <span className={CONDITION_COLOURS[h.interiorCondition] ?? ''}>
                        {h.interiorCondition.charAt(0).toUpperCase() + h.interiorCondition.slice(1)}
                      </span>
                    ) : null
                  }
                />
              </dl>
              {h.damageNotes && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Damage notes</dt>
                  <p className="text-sm text-gray-900">{h.damageNotes}</p>
                </div>
              )}
              {h.notes && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Notes</dt>
                  <p className="text-sm text-gray-900">{h.notes}</p>
                </div>
              )}
            </div>

            {/* Photos */}
            {h.photosJson && h.photosJson.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-sm font-semibold text-gray-800">Photos</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {h.photosJson.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group">
                      <img
                        src={url}
                        alt={`Handover photo ${i + 1}`}
                        className="h-32 w-full rounded border border-gray-200 object-cover transition group-hover:opacity-80"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">

            {/* Vehicle & Driver card */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">Vehicle & Driver</h2>
              <dl className="space-y-3">
                <Field
                  label="Vehicle"
                  value={`${h.vehicle.registrationNumber} \u2014 ${h.vehicle.make} ${h.vehicle.model}`}
                />
                <Field
                  label="Driver"
                  value={h.driver ? `${h.driver.firstName} ${h.driver.lastName}` : null}
                />
                <Field label="Fleet" value={h.fleet?.name} />
              </dl>
              <div className="mt-3 flex gap-3 border-t border-gray-100 pt-3 text-sm">
                <Link href={`/vehicles/${h.vehicle.id}`} className="text-blue-600 hover:underline">Vehicle &rarr;</Link>
                {h.driver && <Link href={`/drivers/${h.driver.id}`} className="text-blue-600 hover:underline">Driver &rarr;</Link>}
              </div>
            </div>

            {/* Equipment Checklist card */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-gray-800">Equipment Checklist</h2>
              <ul className="space-y-2">
                {ALL_EQUIPMENT.map((item) => {
                  const present = presentEquipment.includes(item);
                  return (
                    <li key={item} className="flex items-center gap-2 text-sm">
                      {present ? (
                        <svg className="h-4 w-4 flex-shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <span className={present ? 'text-gray-900' : 'text-gray-400'}>
                        {item.replace(/_/g, ' ')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
