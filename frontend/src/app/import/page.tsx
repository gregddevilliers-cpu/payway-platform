'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

interface ImportJob {
  id: string;
  entityType: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  createdAt: string;
  completedAt: string | null;
}

interface ListResponse {
  success: boolean;
  data: ImportJob[];
  meta: { total: number; nextCursor: string | null };
}

const STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  validating: 'bg-blue-100 text-blue-700',
  previewing: 'bg-yellow-100 text-yellow-700',
  importing: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const ENTITY_COLOURS: Record<string, string> = {
  vehicle: 'bg-blue-50 text-blue-700',
  driver: 'bg-purple-50 text-purple-700',
  fleet: 'bg-teal-50 text-teal-700',
};

export default function ImportHistoryPage() {
  const { data, isLoading, isError, refetch } = useQuery<ListResponse>({
    queryKey: ['import-history'],
    queryFn: () => api.get<ListResponse>('/import/history?limit=50'),
    refetchInterval: 10000,
  });

  const jobs = data?.data ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Bulk Import</h1>
            <p className="mt-1 text-sm text-gray-500">Upload and track bulk data imports</p>
          </div>
          <Link
            href="/import/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Import
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">Loading…</div>
          )}
          {isError && (
            <div className="flex items-center justify-center py-12">
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Failed to load import history.
              </div>
            </div>
          )}
          {!isLoading && !isError && jobs.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-400">No imports yet.</p>
              <Link
                href="/import/new"
                className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
              >
                Start your first import →
              </Link>
            </div>
          )}
          {!isLoading && !isError && jobs.length > 0 && (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['File Name', 'Entity', 'Status', 'Total', 'Imported', 'Skipped', 'Failed', 'Date'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => window.location.href = `/import/new?jobId=${job.id}`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{job.fileName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${ENTITY_COLOURS[job.entityType] ?? 'bg-gray-100 text-gray-600'}`}>
                        {job.entityType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOURS[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{job.totalRows.toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{job.importedCount.toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-3 text-gray-500">{job.skippedCount.toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-3 text-red-600">{job.failedCount.toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(job.createdAt).toLocaleDateString('en-ZA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data?.meta?.total != null && (
          <p className="mt-3 text-right text-xs text-gray-400">{data.meta.total} import(s) total</p>
        )}
      </div>
    </div>
  );
}
