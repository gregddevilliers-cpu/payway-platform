'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

// Types

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  mobileNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

type CreateForm = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  mobileNumber: string;
  password: string;
  confirmPassword: string;
};

type EditForm = {
  firstName: string;
  lastName: string;
  mobileNumber: string;
  role: string;
  isActive: boolean;
};

type ResetPasswordForm = {
  newPassword: string;
  confirmPassword: string;
};

// Constants

const EMPTY_CREATE_FORM: CreateForm = {
  firstName: '',
  lastName: '',
  email: '',
  role: 'fleet_manager',
  mobileNumber: '',
  password: '',
  confirmPassword: '',
};

const EMPTY_EDIT_FORM: EditForm = {
  firstName: '',
  lastName: '',
  mobileNumber: '',
  role: 'fleet_manager',
  isActive: true,
};

const EMPTY_RESET_FORM: ResetPasswordForm = {
  newPassword: '',
  confirmPassword: '',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  operator_admin: 'Operator Admin',
  fleet_manager: 'Fleet Manager',
  driver: 'Driver',
};

const ROLE_COLOURS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  operator_admin: 'bg-blue-100 text-blue-800',
  fleet_manager: 'bg-green-100 text-green-800',
  driver: 'bg-gray-100 text-gray-700',
};

const labelCls = 'mb-1 block text-sm font-medium text-gray-700';
const inputCls =
  'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';

// Helpers

function formatLastLogin(value: string | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Page component

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM);
  const [resetForm, setResetForm] = useState<ResetPasswordForm>(EMPTY_RESET_FORM);
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');
  const [resetError, setResetError] = useState('');

  const { data, isLoading } = useQuery<{ data: User[] }>({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=50'),
  });

  const users = data?.data ?? [];

  const filtered = search
    ? users.filter(
        (u) =>
          (`${u.firstName} ${u.lastName}`).toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  const createMutation = useMutation({
    mutationFn: (payload: Omit<CreateForm, 'confirmPassword'>) =>
      api.post('/users', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      closeCreate();
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: EditForm }) =>
      api.patch(`/users/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      closeEdit();
    },
    onError: (err: Error) => setEditError(err.message),
  });

  const disableMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.post(`/users/${id}/reset-password`, { newPassword }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      closeReset();
    },
    onError: (err: Error) => setResetError(err.message),
  });

  const openCreate = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError('');
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError('');
  };

  const openEdit = (user: User) => {
    setEditForm({
      firstName: user.firstName,
      lastName: user.lastName,
      mobileNumber: user.mobileNumber ?? '',
      role: user.role,
      isActive: user.isActive,
    });
    setEditError('');
    setEditingUser(user);
  };

  const closeEdit = () => {
    setEditingUser(null);
    setEditForm(EMPTY_EDIT_FORM);
    setEditError('');
  };

  const openReset = (user: User) => {
    setResetForm(EMPTY_RESET_FORM);
    setResetError('');
    setResetUser(user);
  };

  const closeReset = () => {
    setResetUser(null);
    setResetForm(EMPTY_RESET_FORM);
    setResetError('');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (createForm.password.length < 8) {
      setCreateError('Password must be at least 8 characters.');
      return;
    }
    if (createForm.password !== createForm.confirmPassword) {
      setCreateError('Passwords do not match.');
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword, ...payload } = createForm;
    createMutation.mutate(payload);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    if (!editingUser) return;
    updateMutation.mutate({ id: editingUser.id, payload: editForm });
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    if (!resetUser) return;
    if (resetForm.newPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    resetPasswordMutation.mutate({ id: resetUser.id, newPassword: resetForm.newPassword });
  };

  const setCreate = (field: keyof CreateForm, value: string) =>
    setCreateForm((prev) => ({ ...prev, [field]: value }));

  const setEdit = <K extends keyof EditForm>(field: K, value: EditForm[K]) =>
    setEditForm((prev) => ({ ...prev, [field]: value }));

  const setReset = (field: keyof ResetPasswordForm, value: string) =>
    setResetForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Users</h1>
            <p className="mt-1 text-sm text-gray-500">{filtered.length} total</p>
          </div>
          <button onClick={openCreate} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            + New User
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading users...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{user.firstName} {user.lastName}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' + (ROLE_COLOURS[user.role] ?? 'bg-gray-100 text-gray-700'))}>
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {user.isActive ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Active</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatLastLogin(user.lastLoginAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(user)} className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">Edit</button>
                          <button onClick={() => openReset(user)} className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">Reset Password</button>
                          {user.isActive ? (
                            <button onClick={() => disableMutation.mutate({ id: user.id, isActive: false })} className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Disable</button>
                          ) : (
                            <button onClick={() => disableMutation.mutate({ id: user.id, isActive: true })} className="rounded px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50">Enable</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">New User</h2>
              <button onClick={closeCreate} className="text-gray-400 hover:text-gray-600" aria-label="Close">&times;</button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>First Name *</label>
                  <input type="text" required value={createForm.firstName} onChange={(e) => setCreate("firstName", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Last Name *</label>
                  <input type="text" required value={createForm.lastName} onChange={(e) => setCreate("lastName", e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" required value={createForm.email} onChange={(e) => setCreate("email", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select value={createForm.role} onChange={(e) => setCreate("role", e.target.value)} className={inputCls}>
                  <option value="fleet_manager">Fleet Manager</option>
                  <option value="operator_admin">Operator Admin</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Mobile Number</label>
                <input type="text" placeholder="+27 XX XXX XXXX" value={createForm.mobileNumber} onChange={(e) => setCreate("mobileNumber", e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Password *</label>
                  <input type="password" required minLength={8} value={createForm.password} onChange={(e) => setCreate("password", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Confirm Password *</label>
                  <input type="password" required value={createForm.confirmPassword} onChange={(e) => setCreate("confirmPassword", e.target.value)} className={inputCls} />
                </div>
              </div>
              {createError && (
                <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeCreate} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Edit User &mdash; {editingUser.firstName} {editingUser.lastName}
              </h2>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-600" aria-label="Close">&times;</button>
            </div>
            <form onSubmit={handleEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>First Name *</label>
                  <input type="text" required value={editForm.firstName} onChange={(e) => setEdit("firstName", e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Last Name *</label>
                  <input type="text" required value={editForm.lastName} onChange={(e) => setEdit("lastName", e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Mobile Number</label>
                <input type="text" placeholder="+27 XX XXX XXXX" value={editForm.mobileNumber} onChange={(e) => setEdit("mobileNumber", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select value={editForm.role} onChange={(e) => setEdit("role", e.target.value)} className={inputCls}>
                  <option value="fleet_manager">Fleet Manager</option>
                  <option value="operator_admin">Operator Admin</option>
                  <option value="super_admin">Super Admin</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input id="isActive" type="checkbox" checked={editForm.isActive} onChange={(e) => setEdit("isActive", e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Active account</label>
              </div>
              {editError && (
                <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeEdit} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={updateMutation.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Reset Password &mdash; {resetUser.firstName} {resetUser.lastName}
              </h2>
              <button onClick={closeReset} className="text-gray-400 hover:text-gray-600" aria-label="Close">&times;</button>
            </div>
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label className={labelCls}>New Password *</label>
                <input type="password" required minLength={8} value={resetForm.newPassword} onChange={(e) => setReset("newPassword", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Confirm Password *</label>
                <input type="password" required value={resetForm.confirmPassword} onChange={(e) => setReset("confirmPassword", e.target.value)} className={inputCls} />
              </div>
              {resetError && (
                <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{resetError}</p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeReset} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={resetPasswordMutation.isPending} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {resetPasswordMutation.isPending ? "Saving..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}