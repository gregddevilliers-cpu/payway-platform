'use client';

import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { ApiError } from '../../../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityType = 'vehicle' | 'driver' | 'fleet';
type WizardStep = 1 | 2 | 3 | 4 | 5;

interface ColumnMatch {
  sourceColumn: string;
  targetField: string | null;
  confidence: number;
  autoMatched: boolean;
}

interface UploadResult {
  jobId: string;
  totalRows: number;
  columnMatches: ColumnMatch[];
  columnMapping: Record<string, string>;
  availableFields: string[];
}

interface ImportRow {
  id: string;
  rowNumber: number;
  rawData: Record<string, unknown>;
  mappedData: Record<string, unknown>;
  validationErrors: string[] | null;
  validationWarnings: string[] | null;
  duplicateOf: string | null;
  resolution: string | null;
  status: string;
}

interface PreviewResponse {
  success: boolean;
  data: ImportRow[];
  meta: { total: number; nextCursor: string | null; job: Record<string, unknown> };
}

interface ValidationSummary {
  totalRows: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  duplicateCount: number;
}

interface ExecuteResult {
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  errorReportUrl: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENTITY_TYPES: { value: EntityType; label: string; description: string }[] = [
  { value: 'vehicle', label: 'Vehicles', description: 'Registration numbers, makes, models, fuel types' },
  { value: 'driver', label: 'Drivers', description: 'Names, SA IDs, licence codes, contact details' },
  { value: 'fleet', label: 'Fleets', description: 'Fleet names, codes, regions' },
];

const CONFIDENCE_COLOUR = (c: number) =>
  c >= 80 ? 'text-green-600' : c >= 50 ? 'text-yellow-600' : 'text-red-500';

const CONFIDENCE_BG = (c: number) =>
  c >= 80 ? 'bg-green-100 text-green-700' : c >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600';

const ROW_STATUS_COLOURS: Record<string, string> = {
  valid: 'bg-green-50',
  error: 'bg-red-50',
  warning: 'bg-yellow-50',
  pending: 'bg-gray-50',
  imported: 'bg-green-100',
  skipped: 'bg-gray-100',
};

function StepIndicator({ current, total }: { current: WizardStep; total: number }) {
  const labels = ['Upload', 'Map Columns', 'Review Data', 'Confirm', 'Results'];
  return (
    <div className="mb-8 flex items-center gap-0">
      {labels.map((label, i) => {
        const step = (i + 1) as WizardStep;
        const done = current > step;
        const active = current === step;
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  done ? 'bg-blue-600 text-white' : active ? 'bg-blue-600 text-white ring-2 ring-blue-200' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {done ? '✓' : step}
              </div>
              <span className={`mt-1 text-xs font-medium ${active ? 'text-blue-600' : 'text-gray-400'}`}>{label}</span>
            </div>
            {i < total - 1 && (
              <div className={`mx-1 mb-4 h-0.5 w-10 sm:w-16 ${done ? 'bg-blue-600' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImportWizardPage() {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>(1);
  const [entityType, setEntityType] = useState<EntityType>('vehicle');
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [previewFilter, setPreviewFilter] = useState<string>('');
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: previewData, refetch: refetchPreview } = useQuery<PreviewResponse>({
    queryKey: ['import-preview', uploadResult?.jobId, previewFilter],
    queryFn: () => api.get<PreviewResponse>(
      `/import/${uploadResult!.jobId}/preview?limit=50${previewFilter ? `&status=${previewFilter}` : ''}`
    ),
    enabled: !!uploadResult?.jobId && step === 3,
  });

  // ─── Step 1: Upload ────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setIsWorking(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('entityType', entityType);

      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/import/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const body = await res.json() as { success: boolean; data: UploadResult; errors?: string[] };
      if (!res.ok || !body.success) throw new Error(body.errors?.[0] ?? 'Upload failed');

      setUploadResult(body.data);
      setColumnMapping(body.data.columnMapping);
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsWorking(false);
    }
  }, [selectedFile, entityType]);

  // ─── Step 2: Save mapping ──────────────────────────────────────────────────

  const handleSaveMapping = useCallback(async () => {
    if (!uploadResult) return;
    setIsWorking(true);
    setError(null);
    try {
      await api.patch(`/import/${uploadResult.jobId}/mapping`, { columnMapping });
      setStep(3);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsWorking(false);
    }
  }, [uploadResult, columnMapping]);

  // ─── Step 3: Validate ──────────────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    if (!uploadResult) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await api.post<{ success: boolean; data: ValidationSummary }>(
        `/import/${uploadResult.jobId}/validate`, {}
      );
      setValidationSummary(result.data);
      await refetchPreview();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsWorking(false);
    }
  }, [uploadResult, refetchPreview]);

  const handleResolutionChange = useCallback(async (rowNumber: number, resolution: string) => {
    if (!uploadResult) return;
    try {
      await api.patch(`/import/${uploadResult.jobId}/rows/${rowNumber}`, { resolution });
      await refetchPreview();
    } catch (err) {
      // silent — row update errors are non-blocking
    }
  }, [uploadResult, refetchPreview]);

  // ─── Step 4 → 5: Execute ──────────────────────────────────────────────────

  const handleExecute = useCallback(async () => {
    if (!uploadResult) return;
    setIsWorking(true);
    setError(null);
    try {
      const result = await api.post<{ success: boolean; data: ExecuteResult }>(
        `/import/${uploadResult.jobId}/execute`, {}
      );
      setExecuteResult(result.data);
      setStep(5);
      queryClient.invalidateQueries({ queryKey: ['import-history'] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsWorking(false);
    }
  }, [uploadResult, queryClient]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-6">
          <Link href="/import" className="text-sm text-blue-600 hover:underline">← Import History</Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">New Import</h1>
        </div>

        <StepIndicator current={step} total={5} />

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-800">Select Entity Type & File</h2>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">What are you importing?</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {ENTITY_TYPES.map((et) => (
                  <button
                    key={et.value}
                    onClick={() => setEntityType(et.value)}
                    className={`rounded-lg border-2 p-4 text-left transition-colors ${
                      entityType === et.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{et.label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{et.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Upload File (.csv or .xlsx, max 5,000 rows)</label>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${
                  dragOver ? 'border-blue-400 bg-blue-50' : selectedFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <svg className="h-10 w-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                {selectedFile ? (
                  <p className="text-sm font-medium text-green-700">{selectedFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Drag & drop file here, or <span className="text-blue-600 font-medium">browse</span></p>
                    <p className="mt-1 text-xs text-gray-400">.csv or .xlsx — max 10 MB</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/import/templates/${entityType}`}
                className="text-sm text-blue-600 hover:underline"
                download
              >
                Download CSV Template →
              </a>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || isWorking}
                className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isWorking ? 'Uploading…' : 'Upload & Detect Columns'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Map Columns ─────────────────────────────────────────── */}
        {step === 2 && uploadResult && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-gray-800">Map Columns</h2>
            <p className="mb-4 text-sm text-gray-500">
              {uploadResult.totalRows} rows detected. Match your file's columns to the target fields.
            </p>

            <div className="mb-1 grid grid-cols-3 gap-3 px-1 text-xs font-medium uppercase tracking-wider text-gray-400">
              <span>Source Column</span>
              <span>Target Field</span>
              <span>Confidence</span>
            </div>

            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {uploadResult.columnMatches.map((match) => (
                <div key={match.sourceColumn} className="grid grid-cols-3 items-center gap-3 px-3 py-2.5">
                  <span className="text-sm font-medium text-gray-800 truncate">{match.sourceColumn}</span>

                  <select
                    value={columnMapping[match.sourceColumn] ?? ''}
                    onChange={(e) => setColumnMapping((prev) => ({
                      ...prev,
                      [match.sourceColumn]: e.target.value,
                    }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">— skip this column —</option>
                    {uploadResult.availableFields.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>

                  {columnMapping[match.sourceColumn] ? (
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${CONFIDENCE_BG(match.confidence)}`}>
                      {match.confidence}% {match.autoMatched ? '✓ auto' : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between">
              <button onClick={() => setStep(1)} className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Back
              </button>
              <button
                onClick={handleSaveMapping}
                disabled={isWorking}
                className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isWorking ? 'Saving…' : 'Next: Review Data →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Review Data ─────────────────────────────────────────── */}
        {step === 3 && uploadResult && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-800">Review Data</h2>
                <button
                  onClick={handleValidate}
                  disabled={isWorking}
                  className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isWorking ? 'Validating…' : 'Run Validation'}
                </button>
              </div>

              {/* Validation summary cards */}
              {validationSummary && (
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    { label: 'Total', value: validationSummary.totalRows, colour: 'bg-gray-50 border-gray-200' },
                    { label: 'Valid', value: validationSummary.validCount, colour: 'bg-green-50 border-green-200' },
                    { label: 'Errors', value: validationSummary.errorCount, colour: 'bg-red-50 border-red-200' },
                    { label: 'Warnings', value: validationSummary.warningCount, colour: 'bg-yellow-50 border-yellow-200' },
                    { label: 'Duplicates', value: validationSummary.duplicateCount, colour: 'bg-orange-50 border-orange-200' },
                  ].map((card) => (
                    <div key={card.label} className={`rounded-lg border px-4 py-3 ${card.colour}`}>
                      <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
                      <p className="mt-1 text-xl font-bold text-gray-900">{card.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Filter */}
              {validationSummary && (
                <div className="mb-3 flex gap-2">
                  {['', 'valid', 'error', 'warning'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setPreviewFilter(f)}
                      className={`rounded px-3 py-1 text-xs font-medium ${previewFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {f === '' ? 'All' : f}
                    </button>
                  ))}
                </div>
              )}

              {/* Rows table */}
              {previewData && previewData.data.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">#</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Data</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Issues</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500">Duplicate?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {previewData.data.map((row) => (
                        <tr key={row.id} className={ROW_STATUS_COLOURS[row.status] ?? ''}>
                          <td className="px-3 py-2 font-medium text-gray-700">{row.rowNumber}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                              row.status === 'valid' ? 'bg-green-100 text-green-700' :
                              row.status === 'error' ? 'bg-red-100 text-red-700' :
                              row.status === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600 max-w-xs">
                            <div className="truncate">
                              {Object.entries(row.mappedData)
                                .filter(([, v]) => v !== '' && v != null)
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${String(v)}`)
                                .join(' | ')}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-red-600 max-w-xs">
                            {row.validationErrors && row.validationErrors.length > 0 && (
                              <div className="truncate">{row.validationErrors[0]}</div>
                            )}
                            {row.validationWarnings && row.validationWarnings.length > 0 && (
                              <div className="truncate text-yellow-600">{row.validationWarnings[0]}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {row.duplicateOf ? (
                              <select
                                value={row.resolution ?? 'skip'}
                                onChange={(e) => handleResolutionChange(row.rowNumber, e.target.value)}
                                className="rounded border border-gray-300 px-1.5 py-0.5 text-xs focus:outline-none"
                              >
                                <option value="skip">Skip</option>
                                <option value="overwrite">Overwrite</option>
                                <option value="merge">Merge</option>
                              </select>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {previewData && previewData.meta.total === 0 && (
                <p className="py-4 text-center text-sm text-gray-400">No rows to display.</p>
              )}
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                disabled={!validationSummary}
                className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Next: Confirm →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Confirm ─────────────────────────────────────────────── */}
        {step === 4 && uploadResult && validationSummary && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-800">Confirm Import</h2>

            <div className="mb-6 rounded-lg bg-gray-50 p-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">File</span>
                <span className="font-medium text-gray-900">{selectedFile?.name ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Entity Type</span>
                <span className="font-medium capitalize text-gray-900">{entityType}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Rows</span>
                <span className="font-medium text-gray-900">{validationSummary.totalRows}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-700">Will be imported</span>
                <span className="font-semibold text-green-700">{validationSummary.validCount}</span>
              </div>
              {validationSummary.errorCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-red-600">Will be skipped (errors)</span>
                  <span className="font-semibold text-red-600">{validationSummary.errorCount}</span>
                </div>
              )}
              {validationSummary.duplicateCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-orange-600">Duplicates (per resolution)</span>
                  <span className="font-semibold text-orange-600">{validationSummary.duplicateCount}</span>
                </div>
              )}
            </div>

            {isWorking && (
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Importing records…
              </div>
            )}

            <div className="flex justify-between">
              <button onClick={() => setStep(3)} className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Back
              </button>
              <button
                onClick={handleExecute}
                disabled={isWorking}
                className="rounded-md bg-green-600 px-6 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isWorking ? 'Importing…' : `Import ${validationSummary.validCount} Record${validationSummary.validCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Results ──────────────────────────────────────────────── */}
        {step === 5 && executeResult && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Import Complete</h2>
            <p className="mt-1 text-sm text-gray-500">Your data has been processed.</p>

            <div className="mx-auto mt-5 max-w-xs space-y-2">
              <div className="flex justify-between rounded-lg bg-green-50 px-4 py-2.5 text-sm">
                <span className="text-green-700">Imported</span>
                <span className="font-bold text-green-800">{executeResult.importedCount}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-gray-50 px-4 py-2.5 text-sm">
                <span className="text-gray-600">Skipped</span>
                <span className="font-semibold text-gray-700">{executeResult.skippedCount}</span>
              </div>
              {executeResult.failedCount > 0 && (
                <div className="flex justify-between rounded-lg bg-red-50 px-4 py-2.5 text-sm">
                  <span className="text-red-600">Failed</span>
                  <span className="font-semibold text-red-700">{executeResult.failedCount}</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
              {executeResult.errorReportUrl && (
                <a
                  href={executeResult.errorReportUrl}
                  download={`import-errors.csv`}
                  className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Download Error Report
                </a>
              )}
              <button
                onClick={() => {
                  setStep(1);
                  setSelectedFile(null);
                  setUploadResult(null);
                  setColumnMapping({});
                  setValidationSummary(null);
                  setExecuteResult(null);
                  setError(null);
                }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Import Another File
              </button>
              <Link
                href={`/${entityType}s`}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                View {entityType === 'vehicle' ? 'Vehicles' : entityType === 'driver' ? 'Drivers' : 'Fleets'} →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
