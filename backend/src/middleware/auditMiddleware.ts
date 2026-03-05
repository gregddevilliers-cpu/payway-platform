import { Request } from 'express';
import { logAction, AuditAction, AuditEntityType } from '../services/auditService';

/**
 * Helper called from route handlers after a successful DB operation.
 * Extracts user context from the request automatically.
 */
export async function auditLog(
  req: Request,
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string,
  changes?: Record<string, { old: unknown; new: unknown }>,
  description?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!req.user) return;

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    undefined;

  await logAction({
    userId: req.user.id,
    operatorId: req.user.operatorId ?? 'system',
    action,
    entityType,
    entityId,
    changes,
    description,
    ipAddress: ip,
    userAgent: req.headers['user-agent'] ?? undefined,
    metadata,
  });
}
