import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope, requireOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── GET /api/v1/drivers ─────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const fleetId = req.query.fleetId as string | undefined;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const take = Math.min(parseInt((req.query.limit as string) ?? '25', 10), 100);

  const where: Prisma.DriverWhereInput = {
    ...(operatorId ? { operatorId } : {}),
    deletedAt: null,
    ...(fleetId ? { fleetId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { mobileNumber: { contains: search } },
            { saIdNumber: { contains: search } },
            { licenceNumber: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, drivers] = await Promise.all([
    prisma.driver.count({ where }),
    prisma.driver.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, mobileNumber: true, email: true,
        status: true, licenceCode: true, licenceExpiry: true, prdpExpiry: true,
        fleet: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const nextCursor = drivers.length === take ? drivers[drivers.length - 1].id : null;
  res.json(ok(drivers, { total, nextCursor }));
});

// ─── POST /api/v1/drivers ─────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = requireOperatorScope(req);
  if (!operatorId) { res.status(403).json(fail('operatorId is required')); return; }
  const body = req.body as {
    fleetId: string; firstName: string; lastName: string; mobileNumber: string; driverPin: string;
    email?: string; saIdNumber?: string; licenceNumber?: string; licenceCode?: string;
    licenceExpiry?: string; prdpNumber?: string; prdpExpiry?: string;
  };

  if (!body.fleetId || !body.firstName || !body.lastName || !body.mobileNumber || !body.driverPin) {
    res.status(400).json(fail('Missing required fields'));
    return;
  }

  const driver = await prisma.driver.create({
    data: {
      operatorId, fleetId: body.fleetId, firstName: body.firstName, lastName: body.lastName,
      mobileNumber: body.mobileNumber, driverPin: body.driverPin, email: body.email,
      saIdNumber: body.saIdNumber, licenceNumber: body.licenceNumber, licenceCode: body.licenceCode,
      licenceExpiry: body.licenceExpiry ? new Date(body.licenceExpiry) : undefined,
      prdpNumber: body.prdpNumber,
      prdpExpiry: body.prdpExpiry ? new Date(body.prdpExpiry) : undefined,
    },
  });

  await auditLog(req, 'create', 'driver', driver.id, undefined, `Created driver ${body.firstName} ${body.lastName}`);
  res.status(201).json(ok(driver));
});

// ─── POST /api/v1/drivers/bulk-action ────────────────────────────────────────
// Must be before /:id to avoid route collision
router.post('/bulk-action', async (req: Request, res: Response): Promise<void> => {
  const operatorId = requireOperatorScope(req);
  if (!operatorId) { res.status(403).json(fail('operatorId is required')); return; }
  const { ids, action, payload } = req.body as { ids: string[]; action: string; payload?: Record<string, unknown> };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json(fail('No IDs provided'));
    return;
  }

  const where: Prisma.DriverWhereInput = {
    id: { in: ids },
    ...(operatorId ? { operatorId } : {}),
    deletedAt: null,
  };

  switch (action) {
    case 'change_status': {
      const newStatus = (payload?.status as string) ?? '';
      if (!['active', 'inactive', 'suspended'].includes(newStatus)) {
        res.status(400).json(fail('Invalid status'));
        return;
      }
      const result = await prisma.driver.updateMany({ where, data: { status: newStatus, updatedAt: new Date() } });
      await auditLog(req, 'bulk_action', 'driver', ids.join(','), undefined, `Bulk status → ${newStatus} (${result.count} drivers)`);
      res.json(ok({ affected: result.count }));
      return;
    }
    case 'reassign_fleet': {
      const fleetId = (payload?.fleetId as string) ?? '';
      if (!fleetId) {
        res.status(400).json(fail('fleetId required'));
        return;
      }
      const result = await prisma.driver.updateMany({ where, data: { fleetId, updatedAt: new Date() } });
      await auditLog(req, 'bulk_action', 'driver', ids.join(','), undefined, `Bulk fleet reassignment (${result.count} drivers)`);
      res.json(ok({ affected: result.count }));
      return;
    }
    case 'export': {
      const rows = await prisma.driver.findMany({
        where,
        select: {
          firstName: true, lastName: true, mobileNumber: true, email: true,
          saIdNumber: true, licenceCode: true, licenceExpiry: true, status: true,
          fleet: { select: { name: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
      const header = 'First Name,Last Name,Mobile,Email,SA ID,Licence Code,Licence Expiry,Fleet,Status\n';
      const csv = rows.map((d) =>
        `"${d.firstName}","${d.lastName}","${d.mobileNumber}","${d.email ?? ''}","${d.saIdNumber ?? ''}","${d.licenceCode ?? ''}","${d.licenceExpiry?.toISOString().split('T')[0] ?? ''}","${d.fleet.name}","${d.status}"`
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="drivers-export.csv"');
      res.send(header + csv);
      return;
    }
    default:
      res.status(400).json(fail(`Unknown action: ${action}`));
  }
});

// ─── GET /api/v1/drivers/:id ─────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.DriverWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const driver = await prisma.driver.findFirst({ where, include: { fleet: true } });
  if (!driver) { res.status(404).json(fail('Driver not found')); return; }
  res.json(ok(driver));
});

// ─── PATCH /api/v1/drivers/:id ───────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.DriverWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const existing = await prisma.driver.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Driver not found')); return; }

  const body = req.body as Partial<{
    firstName: string; lastName: string; mobileNumber: string; email: string;
    status: string; fleetId: string; licenceCode: string; licenceExpiry: string;
    prdpNumber: string; prdpExpiry: string; dailySpendLimit: number; monthlySpendLimit: number;
  }>;
  const updated = await prisma.driver.update({
    where: { id: existing.id },
    data: {
      ...(body.firstName !== undefined && { firstName: body.firstName }),
      ...(body.lastName !== undefined && { lastName: body.lastName }),
      ...(body.mobileNumber !== undefined && { mobileNumber: body.mobileNumber }),
      ...(body.email !== undefined && { email: body.email }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.fleetId !== undefined && { fleetId: body.fleetId }),
      ...(body.licenceCode !== undefined && { licenceCode: body.licenceCode }),
      ...(body.licenceExpiry !== undefined && { licenceExpiry: new Date(body.licenceExpiry) }),
      ...(body.prdpNumber !== undefined && { prdpNumber: body.prdpNumber }),
      ...(body.prdpExpiry !== undefined && { prdpExpiry: new Date(body.prdpExpiry) }),
      ...(body.dailySpendLimit !== undefined && { dailySpendLimit: body.dailySpendLimit }),
      ...(body.monthlySpendLimit !== undefined && { monthlySpendLimit: body.monthlySpendLimit }),
    },
  });
  await auditLog(req, 'update', 'driver', updated.id, undefined, `Updated driver ${updated.firstName} ${updated.lastName}`);
  res.json(ok(updated));
});

// ─── DELETE /api/v1/drivers/:id ──────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.DriverWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const existing = await prisma.driver.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Driver not found')); return; }
  await prisma.driver.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  await auditLog(req, 'delete', 'driver', existing.id, undefined, `Deleted driver ${existing.firstName} ${existing.lastName}`);
  res.json(ok({ deleted: true }));
});

export default router;
