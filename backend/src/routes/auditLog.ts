import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';

const router = Router();

// All audit log routes require at least fleet_manager
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── GET /api/v1/audit-log ────────────────────────────────────────────────────
// Paginated list with filters. Cursor-based pagination using `cursor` (last id seen).
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const {
    entityType,
    entityId,
    userId,
    action,
    startDate,
    endDate,
    cursor,
    limit = '50',
  } = req.query as Record<string, string>;

  const take = Math.min(parseInt(limit, 10) || 50, 200);
  const operatorId = getOperatorScope(req);

  const where: Record<string, unknown> = {};
  if (operatorId) where['operatorId'] = operatorId;
  if (entityType) where['entityType'] = entityType;
  if (entityId) where['entityId'] = entityId;
  if (userId) where['userId'] = userId;
  if (action) where['action'] = action;
  if (startDate || endDate) {
    where['createdAt'] = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = logs.length > take;
  const data = hasMore ? logs.slice(0, take) : logs;
  const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

  // Fetch user names for the result set
  const userIds = [...new Set(data.map((l) => l.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const enriched = data.map((log) => {
    const u = userMap.get(log.userId);
    return {
      ...log,
      userName: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
      userEmail: u?.email ?? null,
    };
  });

  res.json(ok(enriched, { nextCursor, hasMore, count: data.length }));
});

// ─── GET /api/v1/audit-log/export ────────────────────────────────────────────
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const { entityType, entityId, userId, action, startDate, endDate } =
    req.query as Record<string, string>;

  const operatorId = getOperatorScope(req);
  const where: Record<string, unknown> = {};
  if (operatorId) where['operatorId'] = operatorId;
  if (entityType) where['entityType'] = entityType;
  if (entityId) where['entityId'] = entityId;
  if (userId) where['userId'] = userId;
  if (action) where['action'] = action;
  if (startDate || endDate) {
    where['createdAt'] = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });

  const userIds = [...new Set(logs.map((l) => l.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const columns = ['timestamp', 'user', 'action', 'entityType', 'entityId', 'description', 'ipAddress'];
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const rows = logs.map((l) =>
    [
      l.createdAt.toISOString(),
      userMap.get(l.userId) ?? l.userId,
      l.action,
      l.entityType,
      l.entityId,
      l.description ?? '',
      l.ipAddress ?? '',
    ]
      .map(escape)
      .join(','),
  );

  const csv = [columns.join(','), ...rows].join('\n');
  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ─── GET /api/v1/audit-log/entity/:entityType/:entityId ──────────────────────
// All audit entries for one record (used on entity detail pages)
router.get('/entity/:entityType/:entityId', async (req: Request, res: Response): Promise<void> => {
  const { entityType, entityId } = req.params as { entityType: string; entityId: string };
  const operatorId = getOperatorScope(req);

  const where: Record<string, unknown> = { entityType, entityId };
  if (operatorId) where['operatorId'] = operatorId;

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const userIds = [...new Set(logs.map((l) => l.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const enriched = logs.map((log) => {
    const u = userMap.get(log.userId);
    return {
      ...log,
      userName: u ? `${u.firstName} ${u.lastName}` : 'Unknown',
      userEmail: u?.email ?? null,
    };
  });

  res.json(ok(enriched));
});

export default router;
