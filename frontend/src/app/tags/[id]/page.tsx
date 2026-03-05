'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  useTag,
  useAssignTag,
  useUnassignTag,
  useBlockTag,
  useUnblockTag,
  useReportLost,
  useReplaceTag,
  useTransferTag,
  useDecommissionTag,
} from '@/hooks/useTags';
import StatusBadge from '@/components/StatusBadge';
import Modal from '@/components/Modal';
import { formatDate, cn } from '@/lib/utils';
import type { BlockedReason, TagHistoryAction } from '@/types';

// ---------------------------------------------------------------------------
// Action colour scheme for history timeline
// ---------------------------------------------------------------------------
const ACTION_STYLE: Record<TagHistoryAction, { colour: string; icon: string }> = {
  created: { colour: 'bg-gray-400', icon: '✦' },
  assigned: { colour: 'bg-green-500', icon: '↗' },
  unassigned: { colour: 'bg-gray-400', icon: '↙' },
  activated: { colour: 'bg-green-500', icon: '▶' },
  blocked: { colour: 'bg-red-500', icon: '⛔' },
  unblocked: { colour: 'bg-green-400', icon: '✓' },
  transferred: { colour: 'bg-blue-500', icon: '⇄' },
  replaced: { colour: 'bg-purple-500', icon: '⟳' },
  lost_reported: { colour: 'bg-red-700', icon: '✗' },
  expired: { colour: 'bg-orange-500', icon: '⏱' },
  decommissioned: { colour: 'bg-gray-600', icon: '⬛' },
};

const BLOCKED_REASON_OPTIONS: { value: BlockedReason; label: string }[] = [
  { value: 'stolen', label: 'Stolen' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'fraud_suspected', label: 'Fraud Suspected' },
  { value: 'operator_request', label: 'Operator Request' },
  { value: 'system_block', label: 'System Block' },
  { value: 'other', label: 'Other' },
];

export default function TagDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params['id'] as string;

  const { data: tag, isLoading, error } = useTag(id);

  const assign = useAssignTag(id);
  const unassign = useUnassignTag(id);
  const block = useBlockTag(id);
  const unblock = useUnblockTag(id);
  const reportLost = useReportLost(id);
  const replace = useReplaceTag(id);
  const transfer = useTransferTag(id);
  const decommission = useDecommissionTag(id);

  // Modal state
  const [modal, setModal] = useState<
    | null
    | 'assign'
    | 'unassign'
    | 'block'
    | 'report-lost'
    | 'replace'
    | 'transfer'
    | 'decommission'
  >(null);

  const [assignVehicleId, setAssignVehicleId] = useState('');
  const [blockReason, setBlockReason] = useState<BlockedReason>('operator_request');
  const [replaceTagId, setReplaceTagId] = useState('');
  const [transferVehicleId, setTransferVehicleId] = useState('');
  const [actionError, setActionError] = useState('');

  const closeModal = () => {
    setModal(null);
    setActionError('');
    setAssignVehicleId('');
    setReplaceTagId('');
    setTransferVehicleId('');
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError('');
    try {
      await action();
      closeModal();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  if (isLoading) {
    return <div className="p-8 text-gray-500">Loading tag…</div>;
  }

  if (error || !tag) {
    return (
      <div className="p-8">
        <p className="text-red-600">Tag not found or failed to load.</p>
        <Link href="/tags" className="text-blue-600 hover:underline mt-2 block">
          ← Back to Tags
        </Link>
      </div>
    );
  }

  const isActive = tag.status === 'active';
  const isBlocked = tag.status === 'blocked';
  const isUnassigned = tag.status === 'unassigned';
  const isLost = tag.status === 'lost';

  return (
    <div className="p-6 max-w-4xl">
      {/* Back + Header */}
      <Link href="/tags" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-4">
        ← Tags
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono text-gray-900">{tag.tagNumber}</h1>
            <StatusBadge status={tag.status} />
          </div>
          {tag.blockedReason && (
            <p className="text-sm text-red-600 mt-1">Blocked reason: {tag.blockedReason}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {isUnassigned && (
            <ActionBtn colour="blue" onClick={() => setModal('assign')}>
              Assign to Vehicle
            </ActionBtn>
          )}
          {isActive && (
            <>
              <ActionBtn colour="gray" onClick={() => setModal('unassign')}>Unassign</ActionBtn>
              <ActionBtn colour="red" onClick={() => setModal('block')}>Block</ActionBtn>
              <ActionBtn colour="orange" onClick={() => setModal('report-lost')}>Report Lost</ActionBtn>
              <ActionBtn colour="blue" onClick={() => setModal('transfer')}>Transfer</ActionBtn>
            </>
          )}
          {isBlocked && (
            <>
              <ActionBtn colour="green" onClick={() => runAction(() => unblock.mutateAsync())}>Unblock</ActionBtn>
              <ActionBtn colour="purple" onClick={() => setModal('replace')}>Replace</ActionBtn>
            </>
          )}
          {isLost && (
            <ActionBtn colour="purple" onClick={() => setModal('replace')}>Replace</ActionBtn>
          )}
          {(isUnassigned || isBlocked || isLost) && (
            <ActionBtn colour="gray" onClick={() => setModal('decommission')}>Decommission</ActionBtn>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Overview card */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Tag Details</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <DetailRow label="Tag Number" value={<span className="font-mono">{tag.tagNumber}</span>} />
            <DetailRow label="Status" value={<StatusBadge status={tag.status} />} />
            {tag.vehicle && (
              <>
                <DetailRow label="Vehicle" value={tag.vehicle.registrationNumber} />
                <DetailRow label="Make / Model" value={`${tag.vehicle.make} ${tag.vehicle.model}`} />
              </>
            )}
            <DetailRow label="Issued Date" value={formatDate(tag.issuedDate)} />
            <DetailRow label="Expiry Date" value={formatDate(tag.expiryDate)} />
            <DetailRow label="Activated At" value={formatDate(tag.activatedAt, { time: true })} />
            {tag.blockedAt && (
              <DetailRow label="Blocked At" value={formatDate(tag.blockedAt, { time: true })} />
            )}
            <DetailRow label="Last Used" value={formatDate(tag.lastUsedAt, { time: true })} />
            <DetailRow label="Last Forecourt" value={tag.lastUsedForecourtId ?? '—'} />
            <DetailRow label="Created" value={formatDate(tag.createdAt, { time: true })} />
            {tag.notes && (
              <div className="col-span-2">
                <dt className="text-gray-500 font-medium">Notes</dt>
                <dd className="mt-0.5 text-gray-800">{tag.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Blocked reason details */}
        {tag.blockedReason && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 h-fit">
            <h2 className="text-sm font-semibold text-red-900 uppercase tracking-wide mb-2">
              Blocked
            </h2>
            <p className="text-sm text-red-800 font-medium capitalize">{tag.blockedReason.replace(/_/g, ' ')}</p>
            <p className="text-xs text-red-600 mt-1">{formatDate(tag.blockedAt, { time: true })}</p>
            <button
              onClick={() => runAction(() => unblock.mutateAsync())}
              disabled={unblock.isPending}
              className="mt-3 w-full bg-green-600 text-white py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {unblock.isPending ? 'Unblocking…' : 'Unblock Tag'}
            </button>
          </div>
        )}
      </div>

      {/* History Timeline */}
      {tag.histories && tag.histories.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
            Tag History
          </h2>
          <ol className="relative border-l border-gray-200 ml-3">
            {tag.histories.map((entry) => {
              const style = ACTION_STYLE[entry.action as TagHistoryAction] ?? {
                colour: 'bg-gray-400',
                icon: '•',
              };
              return (
                <li key={entry.id} className="mb-6 ml-4">
                  <span
                    className={cn(
                      'absolute -left-1.5 flex items-center justify-center w-6 h-6 rounded-full text-white text-xs',
                      style.colour,
                    )}
                  >
                    {style.icon}
                  </span>
                  <div className="bg-gray-50 rounded-lg border border-gray-100 px-4 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm capitalize text-gray-900">
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                      <StatusBadge status={entry.newStatus} />
                      <span className="text-xs text-gray-400 ml-auto">
                        {formatDate(entry.createdAt, { time: true })}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                      {entry.fromVehicleId && (
                        <p>From vehicle: <span className="font-mono">{entry.fromVehicleId}</span></p>
                      )}
                      {entry.toVehicleId && (
                        <p>To vehicle: <span className="font-mono">{entry.toVehicleId}</span></p>
                      )}
                      {entry.reason && <p>Reason: {entry.reason}</p>}
                      <p className="text-gray-400">By: {entry.performedBy}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* -------- Modals -------- */}

      {/* Assign */}
      <Modal open={modal === 'assign'} onClose={closeModal} title="Assign Tag to Vehicle">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vehicle ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={assignVehicleId}
              onChange={(e) => setAssignVehicleId(e.target.value)}
              placeholder="Enter vehicle ID"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => runAction(() => assign.mutateAsync(assignVehicleId))}
              disabled={!assignVehicleId || assign.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {assign.isPending ? 'Assigning…' : 'Assign'}
            </button>
            <button onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Unassign */}
      <Modal open={modal === 'unassign'} onClose={closeModal} title="Unassign Tag">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This will remove tag <strong className="font-mono">{tag.tagNumber}</strong> from{' '}
            <strong>{tag.vehicle?.registrationNumber}</strong> and set it back to unassigned.
          </p>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => runAction(() => unassign.mutateAsync(undefined))}
              disabled={unassign.isPending}
              className="flex-1 bg-gray-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
            >
              {unassign.isPending ? 'Unassigning…' : 'Unassign'}
            </button>
            <button onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Block */}
      <Modal open={modal === 'block'} onClose={closeModal} title="Block Tag">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Blocking <strong className="font-mono">{tag.tagNumber}</strong> will prevent it from
            authorising fuel transactions.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <select
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value as BlockedReason)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {BLOCKED_REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => runAction(() => block.mutateAsync(blockReason))}
              disabled={block.isPending}
              className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {block.isPending ? 'Blocking…' : 'Block Tag'}
            </button>
            <button onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Report Lost */}
      <Modal open={modal === 'report-lost'} onClose={closeModal} title="Report Tag as Lost">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Reporting <strong className="font-mono">{tag.tagNumber}</strong> as lost will immediately
            prevent it from authorising transactions. This action cannot be undone.
          </p>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => runAction(() => reportLost.mutateAsync())}
              disabled={reportLost.isPending}
              className="flex-1 bg-red-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-red-800 disabled:opacity-50"
            >
              {reportLost.isPending ? 'Reporting…' : 'Confirm — Report Lost'}
            </button>
            <button onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Replace */}
      <Modal open={modal === 'replace'} onClose={closeModal} title="Replace Tag">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This tag will be blocked (reason: replaced) and the new tag will be assigned to the same
            vehicle.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Tag ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={replaceTagId}
              onChange={(e) => setReplaceTagId(e.target.value)}
              placeholder="Enter replacement tag ID"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => runAction(() => replace.mutateAsync(replaceTagId))}
              disabled={!replaceTagId || replace.isPending}
              className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {replace.isPending ? 'Replacing…' : 'Replace Tag'}
            </button>
            <button onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Transfer */}
      <Modal open={modal === 'transfer'} onClose={closeModal} title="Transfer Tag">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Move <strong className="font-mono">{tag.tagNumber}</strong> from{' '}
            <strong>{tag.vehicle?.registrationNumber}</strong> to another vehicle.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination Vehicle ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={transferVehicleId}
              onChange={(e) => setTransferVehicleId(e.target.value)}
              placeholder="Enter destination vehicle ID"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => runAction(() => transfer.mutateAsync(transferVehicleId))}
              disabled={!transferVehicleId || transfer.isPending}
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {transfer.isPending ? 'Transferring…' : 'Transfer'}
            </button>
            <button onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Decommission */}
      <Modal open={modal === 'decommission'} onClose={closeModal} title="Decommission Tag">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Permanently retire <strong className="font-mono">{tag.tagNumber}</strong>. This tag will no
            longer be usable.
          </p>
          {actionError && <p className="text-sm text-red-600">{actionError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => {
                runAction(() => decommission.mutateAsync()).then(() => router.push('/tags'));
              }}
              disabled={decommission.isPending}
              className="flex-1 bg-gray-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
            >
              {decommission.isPending ? 'Decommissioning…' : 'Decommission'}
            </button>
            <button onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 font-medium">{label}</dt>
      <dd className="mt-0.5 text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

function ActionBtn({
  colour,
  onClick,
  disabled,
  children,
}: {
  colour: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const COLOURS: Record<string, string> = {
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
    green: 'bg-green-600 hover:bg-green-700 text-white',
    orange: 'bg-orange-500 hover:bg-orange-600 text-white',
    purple: 'bg-purple-600 hover:bg-purple-700 text-white',
    gray: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
        COLOURS[colour] ?? COLOURS['gray'],
      )}
    >
      {children}
    </button>
  );
}
