'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [clientError, setClientError] = useState('');
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      }),
    onSuccess: () => {
      setSuccess(true);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientError('');
    setSuccess(false);

    if (form.newPassword.length < 8) {
      setClientError('New password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setClientError('Passwords do not match.');
      return;
    }

    mutation.mutate();
  };

  const inputCls = 'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
  const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-700">Dashboard</Link>
          <span>/</span>
          <span className="font-medium text-gray-900">Change Password</span>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-lg font-semibold text-gray-900">Change Password</h1>

          {success && (
            <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Password changed successfully.
            </div>
          )}

          {(clientError || mutation.isError) && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {clientError || 'Failed to change password. Check your current password and try again.'}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Current password <span className="text-red-500">*</span></label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className={inputCls}
                value={form.currentPassword}
                onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
              />
            </div>

            <div>
              <label className={labelCls}>New password <span className="text-red-500">*</span></label>
              <input
                type="password"
                required
                autoComplete="new-password"
                className={inputCls}
                value={form.newPassword}
                onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label className={labelCls}>Confirm new password <span className="text-red-500">*</span></label>
              <input
                type="password"
                required
                autoComplete="new-password"
                className={inputCls}
                value={form.confirmPassword}
                onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link href="/" className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancel
              </Link>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {mutation.isPending ? 'Saving…' : 'Change password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
