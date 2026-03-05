'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCostCentres, useSpendSummary, useCreateCostCentre } from '@/hooks/useCostCentres';
import Modal from '@/components/Modal';
import { formatZAR } from '@/lib/utils';

export default function CostCentresPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    code: '',
    description: '',
    budget: '',
    budgetPeriod: 'monthly',
    parentId: '',
  });
  const [addError, setAddError] = useState('');

  const { data: ccData, isLoading, error } = useCostCentres();
  const { data: spendData } = useSpendSummary();
  const createCC = useCreateCostCentre();

  const costCentres = ccData?.data ?? [];

  // Build spend lookup
  const spendMap = new Map((spendData?.data ?? []).map((s) => [s.costCentreId, s]));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    try {
      await createCC.mutateAsync({
        name: addForm.name,
        code: addForm.code,
        description: addForm.description || undefined,
        budget: addForm.budget ? parseFloat(addForm.budget) : undefined,
        budgetPeriod: addForm.budgetPeriod || undefined,
        parentId: addForm.parentId || undefined,
      });
      setShowAddModal(false);
      setAddForm({ name: '', code: '', description: '', budget: '', budgetPeriod: 'monthly', parentId: '' });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to create cost centre');
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cost Centres</h1>
          <p className="text-sm text-gray-500 mt-1">Hierarchical cost allocation for financial reporting</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Add Cost Centre
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-500">Loading cost centres…</div>
        ) : error ? (
          <div className="p-12 text-center text-red-600">Failed to load. Check backend is running.</div>
        ) : costCentres.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No cost centres yet. Add one to get started.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Code</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Budget</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Current Spend</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Variance</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Vehicles</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {costCentres.map((cc) => {
                const spend = spendMap.get(cc.id);
                const budget = spend?.budget ?? null;
                const totalSpend = spend?.totalSpend ?? 0;
                const variance = budget !== null ? budget - totalSpend : null;
                const variancePct = budget !== null && budget > 0 ? ((totalSpend / budget) * 100) : null;

                return (
                  <tr key={cc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/cost-centres/${cc.id}`} className="font-medium text-blue-700 hover:underline">
                        {cc.parentId ? <span className="text-gray-400 mr-1">↳</span> : null}
                        {cc.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{cc.code}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {budget !== null ? (
                        <span>
                          {formatZAR(budget)}
                          <span className="text-xs text-gray-400 ml-1">/{spend?.budgetPeriod ?? 'mo'}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatZAR(totalSpend)}</td>
                    <td className="px-4 py-3">
                      {variance !== null ? (
                        <span className={variance >= 0 ? 'text-green-700' : 'text-red-700'}>
                          {formatZAR(Math.abs(variance))}
                          {variancePct !== null && (
                            <span className="text-xs ml-1">({variancePct.toFixed(0)}%)</span>
                          )}
                          {variance < 0 ? ' over' : ' under'}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{cc._count?.vehicles ?? 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          cc.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {cc.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Cost Centre Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Cost Centre">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Northern Route"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={addForm.code}
                onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. NR-001"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={addForm.description}
              onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget (ZAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={addForm.budget}
                onChange={(e) => setAddForm((f) => ({ ...f, budget: e.target.value }))}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget Period</label>
              <select
                value={addForm.budgetPeriod}
                onChange={(e) => setAddForm((f) => ({ ...f, budgetPeriod: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Cost Centre</label>
            <select
              value={addForm.parentId}
              onChange={(e) => setAddForm((f) => ({ ...f, parentId: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">None (top-level)</option>
              {costCentres.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.name} ({cc.code})
                </option>
              ))}
            </select>
          </div>
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={createCC.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createCC.isPending ? 'Creating…' : 'Create Cost Centre'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
