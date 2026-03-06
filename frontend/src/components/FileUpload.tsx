'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FileStatus = 'pending' | 'uploading' | 'completed' | 'failed';

interface QueuedFile {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error: string | null;
  previewUrl: string | null;
}

interface FileUploadProps {
  entityType: string;
  entityId: string;
  documentType?: string;
  maxFiles?: number;
  acceptedTypes?: string;
  maxSizeMB?: number;
  onUploadComplete?: () => void;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '\u{1F5BC}';
  if (mimeType === 'application/pdf') return '\u{1F4C4}';
  if (mimeType.includes('word')) return '\u{1F4DD}';
  if (mimeType.includes('sheet')) return '\u{1F4CA}';
  return '\u{1F4CE}';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let nextId = 0;
function uid(): string {
  nextId += 1;
  return `file-${Date.now()}-${nextId}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FileUpload({
  entityType,
  entityId,
  documentType = 'other',
  maxFiles = 10,
  acceptedTypes = '.jpg,.jpeg,.png,.pdf,.docx,.xlsx,.doc',
  maxSizeMB = 10,
  onUploadComplete,
  compact = false,
}: FileUploadProps) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      queue.forEach((q) => {
        if (q.previewUrl) URL.revokeObjectURL(q.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------
  // File validation + enqueue
  // -------------------------------------------------------------------

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const incoming = Array.from(files);

      setQueue((prev) => {
        const remainingSlots = maxFiles - prev.length;
        if (remainingSlots <= 0) return prev;

        const toAdd = incoming.slice(0, remainingSlots);

        const newEntries: QueuedFile[] = toAdd.map((file) => {
          let error: string | null = null;

          if (file.size > maxSizeBytes) {
            error = `File exceeds ${maxSizeMB} MB limit`;
          }

          const ext = file.name.split('.').pop()?.toLowerCase();
          const allowedExts = acceptedTypes
            .split(',')
            .map((t) => t.trim().replace('.', '').toLowerCase());
          if (ext && !allowedExts.includes(ext)) {
            error = `File type .${ext} is not accepted`;
          }

          const previewUrl = file.type.startsWith('image/')
            ? URL.createObjectURL(file)
            : null;

          return {
            id: uid(),
            file,
            status: error ? 'failed' : 'pending',
            progress: 0,
            error,
            previewUrl,
          };
        });

        return [...prev, ...newEntries];
      });
    },
    [maxFiles, maxSizeBytes, maxSizeMB, acceptedTypes],
  );

  // -------------------------------------------------------------------
  // Drag-and-drop handlers
  // -------------------------------------------------------------------

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        enqueueFiles(e.dataTransfer.files);
      }
    },
    [enqueueFiles],
  );

  // -------------------------------------------------------------------
  // Input change handlers
  // -------------------------------------------------------------------

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        enqueueFiles(e.target.files);
      }
      // Reset input so re-selecting the same file triggers change
      e.target.value = '';
    },
    [enqueueFiles],
  );

  // -------------------------------------------------------------------
  // Remove a file from queue
  // -------------------------------------------------------------------

  const removeFile = useCallback((id: string) => {
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((q) => q.id !== id);
    });
  }, []);

  // -------------------------------------------------------------------
  // Clear all
  // -------------------------------------------------------------------

  const clearAll = useCallback(() => {
    queue.forEach((q) => {
      if (q.previewUrl) URL.revokeObjectURL(q.previewUrl);
    });
    setQueue([]);
  }, [queue]);

  // -------------------------------------------------------------------
  // Upload a single file via XMLHttpRequest (for progress)
  // -------------------------------------------------------------------

  function uploadFile(queued: QueuedFile): Promise<void> {
    return new Promise((resolve) => {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('auth_token')
          : null;

      const fd = new FormData();
      fd.append('file', queued.file);
      fd.append('entityType', entityType);
      fd.append('entityId', entityId);
      fd.append('documentType', documentType);

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setQueue((prev) =>
            prev.map((q) =>
              q.id === queued.id ? { ...q, progress: pct } : q,
            ),
          );
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === queued.id
                ? { ...q, status: 'completed', progress: 100, error: null }
                : q,
            ),
          );
        } else {
          let errorMsg = 'Upload failed';
          try {
            const body = JSON.parse(xhr.responseText);
            errorMsg = body?.errors?.[0] ?? errorMsg;
          } catch {
            // ignore parse error
          }
          setQueue((prev) =>
            prev.map((q) =>
              q.id === queued.id
                ? { ...q, status: 'failed', error: errorMsg }
                : q,
            ),
          );
        }
        resolve();
      });

      xhr.addEventListener('error', () => {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === queued.id
              ? { ...q, status: 'failed', error: 'Network error — please try again' }
              : q,
          ),
        );
        resolve();
      });

      xhr.addEventListener('abort', () => {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === queued.id
              ? { ...q, status: 'failed', error: 'Upload cancelled' }
              : q,
          ),
        );
        resolve();
      });

      xhr.open('POST', `${API_BASE}/documents`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(fd);

      setQueue((prev) =>
        prev.map((q) =>
          q.id === queued.id ? { ...q, status: 'uploading', progress: 0 } : q,
        ),
      );
    });
  }

  // -------------------------------------------------------------------
  // Upload all pending files sequentially
  // -------------------------------------------------------------------

  async function handleUploadAll() {
    setIsUploading(true);

    const pending = queue.filter((q) => q.status === 'pending');

    for (const item of pending) {
      await uploadFile(item);
    }

    setIsUploading(false);
    onUploadComplete?.();
  }

  // -------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------

  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const completedCount = queue.filter((q) => q.status === 'completed').length;
  const failedCount = queue.filter((q) => q.status === 'failed').length;
  const hasFiles = queue.length > 0;
  const canUpload = pendingCount > 0 && !isUploading;

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white shadow-sm',
        compact ? 'p-4' : 'p-6',
      )}
    >
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes}
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Drop zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors',
          compact ? 'px-4 py-6' : 'px-6 py-10',
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100',
        )}
      >
        <svg
          className={cn(
            'mb-2 text-gray-400',
            compact ? 'h-6 w-6' : 'h-8 w-8',
            isDragOver && 'text-blue-500',
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
          />
        </svg>

        <p
          className={cn(
            'font-medium text-gray-700',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {isDragOver ? 'Drop files here' : 'Drag & drop files here, or click to browse'}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          {acceptedTypes.replace(/\./g, '').toUpperCase().replace(/,/g, ', ')} — max{' '}
          {maxSizeMB} MB each — up to {maxFiles} files
        </p>
      </div>

      {/* Camera capture button (mobile) */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
            />
          </svg>
          Take Photo
        </button>

        {hasFiles && (
          <span className="text-xs text-gray-400">
            {queue.length} file{queue.length !== 1 ? 's' : ''} selected
            {completedCount > 0 && ` — ${completedCount} uploaded`}
            {failedCount > 0 && ` — ${failedCount} failed`}
          </span>
        )}
      </div>

      {/* File queue */}
      {hasFiles && (
        <div className="mt-4 space-y-2">
          {queue.map((item) => (
            <div
              key={item.id}
              className={cn(
                'flex items-start gap-3 rounded-md border p-3',
                item.status === 'completed'
                  ? 'border-green-200 bg-green-50'
                  : item.status === 'failed'
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-white',
              )}
            >
              {/* Thumbnail or icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded">
                {item.previewUrl ? (
                  <img
                    src={item.previewUrl}
                    alt={item.file.name}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <span className="text-xl">{fileIcon(item.file.type)}</span>
                )}
              </div>

              {/* File details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {item.file.name}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatBytes(item.file.size)}
                  </span>
                </div>

                {/* Progress bar (uploading) */}
                {item.status === 'uploading' && (
                  <div className="mt-1.5">
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-blue-600 transition-all duration-200"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{item.progress}%</p>
                  </div>
                )}

                {/* Status labels */}
                {item.status === 'completed' && (
                  <p className="mt-1 text-xs font-medium text-green-700">Uploaded</p>
                )}
                {item.status === 'failed' && item.error && (
                  <p className="mt-1 text-xs text-red-600">{item.error}</p>
                )}
              </div>

              {/* Remove button */}
              {(item.status === 'pending' || item.status === 'failed') && (
                <button
                  type="button"
                  onClick={() => removeFile(item.id)}
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label={`Remove ${item.file.name}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              {/* Completed check */}
              {item.status === 'completed' && (
                <svg
                  className="h-5 w-5 shrink-0 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {hasFiles && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleUploadAll}
            disabled={!canUpload}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? 'Uploading\u2026' : `Upload All (${pendingCount})`}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={isUploading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}
