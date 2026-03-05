'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { api } from '../lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

interface Document {
  id: string;
  entityType: string;
  entityId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedByName: string;
  description: string | null;
  createdAt: string;
}

interface DocsResponse {
  success: boolean;
  data: Document[];
}

const DOCUMENT_TYPES = [
  'registration', 'licence', 'insurance', 'prdp', 'photo', 'inspection',
  'invoice', 'quote', 'police_report', 'receipt', 'certificate', 'other',
];

const TYPE_LABELS: Record<string, string> = {
  registration: 'Registration', licence: 'Licence', insurance: 'Insurance',
  prdp: 'PRDP', photo: 'Photo', inspection: 'Inspection', invoice: 'Invoice',
  quote: 'Quote', police_report: 'Police Report', receipt: 'Receipt',
  certificate: 'Certificate', other: 'Other',
};

const TYPE_COLOURS: Record<string, string> = {
  registration: 'bg-blue-100 text-blue-800',
  licence: 'bg-indigo-100 text-indigo-800',
  insurance: 'bg-green-100 text-green-800',
  prdp: 'bg-purple-100 text-purple-800',
  photo: 'bg-pink-100 text-pink-800',
  inspection: 'bg-yellow-100 text-yellow-800',
  invoice: 'bg-orange-100 text-orange-800',
  quote: 'bg-cyan-100 text-cyan-800',
  police_report: 'bg-red-100 text-red-800',
  receipt: 'bg-lime-100 text-lime-800',
  certificate: 'bg-teal-100 text-teal-800',
  other: 'bg-gray-100 text-gray-700',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word')) return '📝';
  if (mimeType.includes('sheet')) return '📊';
  return '📎';
}

interface UploadFormProps {
  entityType: string;
  entityId: string;
  onDone: () => void;
}

function UploadForm({ entityType, entityId, onDone }: UploadFormProps) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('other');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Please select a file'); return; }

    setError(null);
    setUploading(true);

    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entityType', entityType);
    fd.append('entityId', entityId);
    fd.append('documentType', docType);
    if (description) fd.append('description', description);

    try {
      const res = await fetch(`${API_BASE}/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) { setError(body?.errors?.[0] ?? 'Upload failed'); return; }
      await qc.invalidateQueries({ queryKey: ['documents', entityType, entityId] });
      onDone();
    } catch {
      setError('Network error — please try again');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded border border-blue-200 bg-blue-50 p-4">
      <p className="mb-3 text-sm font-medium text-gray-800">Upload Document</p>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">Document type</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">File</label>
        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.docx,.xlsx,.doc"
          className="w-full text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-blue-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-blue-700 hover:file:bg-blue-200"
        />
        <p className="mt-1 text-xs text-gray-400">JPG, PNG, PDF, DOCX, XLSX — max 10 MB</p>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description…"
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {error && (
        <p className="mb-3 text-xs text-red-600">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={uploading}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface DocumentsPanelProps {
  entityType: string;
  entityId: string;
}

export function DocumentsPanel({ entityType, entityId }: DocumentsPanelProps) {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<DocsResponse>({
    queryKey: ['documents', entityType, entityId],
    queryFn: () =>
      api.get<DocsResponse>(
        `/documents?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
      ),
    enabled: Boolean(entityId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['documents', entityType, entityId] });
      setDeleting(null);
    },
  });

  function handleDownload(doc: Document) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const url = `${API_BASE}/documents/${doc.id}/download${token ? `?_token=${token}` : ''}`;
    window.open(url, '_blank');
  }

  const docs = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500">
        Loading documents…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load documents.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
        {!showUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Upload
          </button>
        )}
      </div>

      {showUpload && (
        <div className="mb-4">
          <UploadForm
            entityType={entityType}
            entityId={entityId}
            onDone={() => setShowUpload(false)}
          />
        </div>
      )}

      {docs.length === 0 && !showUpload && (
        <div className="py-8 text-center text-sm text-gray-400">
          No documents uploaded yet.
        </div>
      )}

      {docs.length > 0 && (
        <div className="divide-y divide-gray-100">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 text-xl">{fileIcon(doc.mimeType)}</span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-gray-900">{doc.fileName}</p>
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLOURS[doc.documentType] ?? 'bg-gray-100 text-gray-700'}`}
                  >
                    {TYPE_LABELS[doc.documentType] ?? doc.documentType}
                  </span>
                </div>

                {doc.description && (
                  <p className="mt-0.5 text-xs text-gray-500">{doc.description}</p>
                )}

                <p className="mt-0.5 text-xs text-gray-400">
                  {formatBytes(doc.fileSize)} · uploaded by {doc.uploadedByName} ·{' '}
                  {new Date(doc.createdAt).toLocaleDateString('en-ZA')}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => handleDownload(doc)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Download
                </button>

                {deleting === doc.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">Delete?</span>
                    <button
                      onClick={() => deleteMutation.mutate(doc.id)}
                      disabled={deleteMutation.isPending}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleting(null)}
                      className="text-xs text-gray-400 hover:underline"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleting(doc.id)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
