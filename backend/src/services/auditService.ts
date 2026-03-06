import prisma from '../lib/prisma';

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'status_change'
  | 'login' | 'export' | 'import' | 'assignment' | 'bulk_action';

export type AuditEntityType =
  | 'vehicle' | 'driver' | 'fleet' | 'fuel_transaction' | 'wallet'
  | 'repair_job' | 'repair_provider' | 'maintenance_record' | 'incident' | 'user'
  | 'tag' | 'document' | 'notification_preference'
  | 'cost_centre' | 'contract' | 'contract_payment';

export interface LogActionParams {
  userId: string;
  operatorId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_FIELDS = new Set(['saIdNumber', 'driverPin', 'passwordHash']);

function maskSensitive(field: string, value: string): string {
  if (field === 'saIdNumber' && value.length >= 4) return `***${value.slice(-4)}`;
  return '***';
}

/**
 * Write an immutable audit log entry. Never throws — failures go to console.error.
 */
export async function logAction(params: LogActionParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        operatorId: params.operatorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        changes: params.changes as object ?? undefined,
        description: params.description,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: params.metadata as object ?? undefined,
      },
    });
  } catch (err) {
    console.error('[AuditService] Failed to write audit log:', err);
  }
}

/**
 * Diff two record snapshots and return only changed fields.
 * Sensitive fields are masked. updatedAt/createdAt are always skipped.
 */
export function generateChanges(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
  fieldsToTrack: string[],
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const field of fieldsToTrack) {
    if (field === 'updatedAt' || field === 'createdAt') continue;

    const rawOld = oldRecord[field];
    const rawNew = newRecord[field];

    // Normalise dates to ISO strings for comparison
    const oldVal = rawOld instanceof Date ? rawOld.toISOString() : rawOld;
    const newVal = rawNew instanceof Date ? rawNew.toISOString() : rawNew;

    if (oldVal === newVal) continue;

    if (SENSITIVE_FIELDS.has(field)) {
      changes[field] = {
        old: maskSensitive(field, String(oldVal ?? '')),
        new: maskSensitive(field, String(newVal ?? '')),
      };
    } else {
      changes[field] = { old: oldVal, new: newVal };
    }
  }

  return changes;
}

/**
 * Build a human-readable description for an audit entry.
 */
export function getEntityDescription(
  action: string,
  entityType: string,
  entityId: string,
  changes?: Record<string, { old: unknown; new: unknown }>,
): string {
  const entity = entityType.replace(/_/g, ' ');

  switch (action) {
    case 'create':
      return `Created ${entity} (${entityId})`;
    case 'delete':
      return `Deleted ${entity} (${entityId})`;
    case 'status_change': {
      const s = changes?.['status'];
      return s
        ? `${entity} status changed from "${s.old}" to "${s.new}"`
        : `${entity} status changed`;
    }
    case 'assignment': {
      const keys = changes ? Object.keys(changes) : [];
      if (keys.length > 0 && changes) {
        const key = keys[0]!;
        return `${entity} ${key} assigned: "${changes[key]!.new}"`;
      }
      return `${entity} assignment updated`;
    }
    case 'update': {
      if (changes && Object.keys(changes).length > 0) {
        const entries = Object.entries(changes);
        const first = entries[0]!;
        const extra = entries.length > 1 ? ` (+${entries.length - 1} more)` : '';
        return `Updated ${entity} — ${first[0]} changed from "${first[1].old}" to "${first[1].new}"${extra}`;
      }
      return `Updated ${entity} (${entityId})`;
    }
    default:
      return `${action} on ${entity} (${entityId})`;
  }
}
