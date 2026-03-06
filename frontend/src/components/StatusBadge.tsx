import type { TagStatus } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<
  TagStatus,
  { label: string; className: string }
> = {
  unassigned: {
    label: 'Unassigned',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  blocked: {
    label: 'Blocked',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  lost: {
    label: 'Lost',
    className: 'bg-red-100 text-red-900 border-red-300 line-through',
  },
  expired: {
    label: 'Expired',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  decommissioned: {
    label: 'Decommissioned',
    className: 'bg-gray-100 text-gray-500 border-gray-200 line-through',
  },
};

interface Props {
  status: TagStatus | string;
  className?: string;
}

export default function StatusBadge({ status, className }: Props) {
  const config = STATUS_CONFIG[status as TagStatus] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
