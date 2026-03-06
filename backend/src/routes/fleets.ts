import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope, requireOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── GET /api/v1/fleets ───────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;

  const where: Prisma.FleetWhereInput = {
    ...(operatorId ? { operatorId } : {}),
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const fleets = await prisma.fleet.findMany({
    where,
    include: { _count: { select: { vehicles: true, drivers: true } } },
    orderBy: { name: 'asc' },
  });

  res.json(ok(fleets.map((f) => ({ ...f, vehicleCount: f._count.vehicles, driverCount: f._count.drivers }))));
});

// ─── POST /api/v1/fleets ──────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = requireOperatorScope(req);
  if (!operatorId) { res.status(403).json(fail('operatorId is required')); return; }
  const body = req.body as {
    name: string; code?: string; contactPerson?: string; contactPhone?: string;
    contactEmail?: string; region?: string; monthlyBudget?: number;
  };

  if (!body.name) {
    res.status(400).json(fail('Fleet name is required'));
    return;
  }

  const fleet = await prisma.fleet.create({
    data: {
      operatorId, name: body.name, code: body.code, contactPerson: body.contactPerson,
      contactPhone: body.contactPhone, contactEmail: body.contactEmail,
      region: body.region, monthlyBudget: body.monthlyBudget,
    },
  });

  await auditLog(req, 'create', 'fleet', fleet.id, undefined, `Created fleet ${body.name}`);
  res.status(201).json(ok(fleet));
});

// ─── GET /api/v1/fleets/:id ───────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.FleetWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const fleet = await prisma.fleet.findFirst({
    where,
    include: {
      vehicles: { where: { deletedAt: null }, select: { id: true, registrationNumber: true, make: true, model: true, status: true }, take: 20 },
      drivers: { where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true, status: true }, take: 20 },
      _count: { select: { vehicles: true, drivers: true } },
    },
  });
  if (!fleet) { res.status(404).json(fail('Fleet not found')); return; }
  res.json(ok(fleet));
});

// ─── PATCH /api/v1/fleets/:id ─────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.FleetWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const existing = await prisma.fleet.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Fleet not found')); return; }

  const body = req.body as Partial<{
    name: string; code: string; contactPerson: string; contactPhone: string;
    contactEmail: string; region: string; monthlyBudget: number; status: string;
  }>;
  const updated = await prisma.fleet.update({
    where: { id: existing.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.code !== undefined && { code: body.code }),
      ...(body.contactPerson !== undefined && { contactPerson: body.contactPerson }),
      ...(body.contactPhone !== undefined && { contactPhone: body.contactPhone }),
      ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
      ...(body.region !== undefined && { region: body.region }),
      ...(body.monthlyBudget !== undefined && { monthlyBudget: body.monthlyBudget }),
      ...(body.status !== undefined && { status: body.status }),
    },
  });
  await auditLog(req, 'update', 'fleet', updated.id, undefined, `Updated fleet ${updated.name}`);
  res.json(ok(updated));
});

// ─── DELETE /api/v1/fleets/:id ────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.FleetWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const existing = await prisma.fleet.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Fleet not found')); return; }
  await prisma.fleet.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  await auditLog(req, 'delete', 'fleet', existing.id, undefined, `Deleted fleet ${existing.name}`);
  res.json(ok({ deleted: true }));
});

export default router;
