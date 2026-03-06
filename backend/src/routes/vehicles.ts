import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope, requireOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── GET /api/v1/vehicles ─────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const fleetId = req.query.fleetId as string | undefined;
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const take = Math.min(parseInt((req.query.limit as string) ?? '25', 10), 100);

  const where: Prisma.VehicleWhereInput = {
    ...(operatorId ? { operatorId } : {}),
    deletedAt: null,
    ...(fleetId ? { fleetId } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { registrationNumber: { contains: search } },
            { make: { contains: search } },
            { model: { contains: search } },
            { vinNumber: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, vehicles] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      include: { fleet: { select: { id: true, name: true } } },
      orderBy: { registrationNumber: 'asc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const nextCursor = vehicles.length === take ? vehicles[vehicles.length - 1].id : null;
  res.json(ok(vehicles, { total, nextCursor }));
});

// ─── POST /api/v1/vehicles ────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = requireOperatorScope(req);
  if (!operatorId) { res.status(403).json(fail('operatorId is required')); return; }
  const body = req.body as {
    fleetId: string; registrationNumber: string; vinNumber?: string; make: string; model: string;
    year: number; colour?: string; fuelType: string; tankCapacity: number;
  };

  if (!body.fleetId || !body.registrationNumber || !body.make || !body.model || !body.year || !body.fuelType || !body.tankCapacity) {
    res.status(400).json(fail('Missing required fields'));
    return;
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      operatorId, fleetId: body.fleetId, registrationNumber: body.registrationNumber,
      vinNumber: body.vinNumber, make: body.make, model: body.model, year: Number(body.year),
      colour: body.colour, fuelType: body.fuelType, tankCapacity: body.tankCapacity,
    },
  });

  await auditLog(req, 'create', 'vehicle', vehicle.id, undefined, `Created vehicle ${body.registrationNumber}`);
  res.status(201).json(ok(vehicle));
});

// ─── POST /api/v1/vehicles/bulk-action ───────────────────────────────────────
// Must be before /:id to avoid route collision
router.post('/bulk-action', async (req: Request, res: Response): Promise<void> => {
  const operatorId = requireOperatorScope(req);
  if (!operatorId) { res.status(403).json(fail('operatorId is required')); return; }
  const { ids, action, payload } = req.body as { ids: string[]; action: string; payload?: Record<string, unknown> };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json(fail('No IDs provided'));
    return;
  }

  const where: Prisma.VehicleWhereInput = {
    id: { in: ids },
    ...(operatorId ? { operatorId } : {}),
    deletedAt: null,
  };

  switch (action) {
    case 'change_status': {
      const newStatus = (payload?.status as string) ?? '';
      if (!['active', 'inactive', 'maintenance', 'decommissioned'].includes(newStatus)) {
        res.status(400).json(fail('Invalid status'));
        return;
      }
      const result = await prisma.vehicle.updateMany({ where, data: { status: newStatus, updatedAt: new Date() } });
      await auditLog(req, 'bulk_action', 'vehicle', ids.join(','), undefined, `Bulk status → ${newStatus} (${result.count} vehicles)`);
      res.json(ok({ affected: result.count }));
      return;
    }
    case 'reassign_fleet': {
      const fleetId = (payload?.fleetId as string) ?? '';
      if (!fleetId) {
        res.status(400).json(fail('fleetId required'));
        return;
      }
      const result = await prisma.vehicle.updateMany({ where, data: { fleetId, updatedAt: new Date() } });
      await auditLog(req, 'bulk_action', 'vehicle', ids.join(','), undefined, `Bulk fleet reassignment (${result.count} vehicles)`);
      res.json(ok({ affected: result.count }));
      return;
    }
    case 'export': {
      const rows = await prisma.vehicle.findMany({
        where,
        include: { fleet: { select: { name: true } } },
        orderBy: { registrationNumber: 'asc' },
      });
      const header = 'Registration,Make,Model,Year,Fleet,Status,Fuel Type\n';
      const csv = rows.map((v) =>
        `"${v.registrationNumber}","${v.make}","${v.model}",${v.year},"${v.fleet.name}","${v.status}","${v.fuelType}"`
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="vehicles-export.csv"');
      res.send(header + csv);
      return;
    }
    default:
      res.status(400).json(fail(`Unknown action: ${action}`));
  }
});

// ─── GET /api/v1/vehicles/:id ─────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.VehicleWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const vehicle = await prisma.vehicle.findFirst({
    where,
    include: {
      fleet: true,
      maintenanceRecords: { where: { deletedAt: null }, orderBy: { serviceDate: 'desc' }, take: 5 },
      maintenanceSchedules: { where: { isActive: true }, orderBy: { nextDueDate: 'asc' } },
    },
  });
  if (!vehicle) { res.status(404).json(fail('Vehicle not found')); return; }
  res.json(ok(vehicle));
});

// ─── PATCH /api/v1/vehicles/:id ───────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.VehicleWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const existing = await prisma.vehicle.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Vehicle not found')); return; }

  const body = req.body as Partial<{
    registrationNumber: string; vinNumber: string; make: string; model: string;
    year: number; colour: string; fuelType: string; tankCapacity: number;
    currentOdometer: number; status: string; fleetId: string;
  }>;
  const updated = await prisma.vehicle.update({
    where: { id: existing.id },
    data: {
      ...(body.registrationNumber !== undefined && { registrationNumber: body.registrationNumber }),
      ...(body.vinNumber !== undefined && { vinNumber: body.vinNumber }),
      ...(body.make !== undefined && { make: body.make }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.year !== undefined && { year: Number(body.year) }),
      ...(body.colour !== undefined && { colour: body.colour }),
      ...(body.fuelType !== undefined && { fuelType: body.fuelType }),
      ...(body.tankCapacity !== undefined && { tankCapacity: body.tankCapacity }),
      ...(body.currentOdometer !== undefined && { currentOdometer: Number(body.currentOdometer) }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.fleetId !== undefined && { fleetId: body.fleetId }),
    },
  });
  await auditLog(req, 'update', 'vehicle', updated.id, undefined, `Updated vehicle ${updated.registrationNumber}`);
  res.json(ok(updated));
});

// ─── DELETE /api/v1/vehicles/:id ──────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.VehicleWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const existing = await prisma.vehicle.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Vehicle not found')); return; }
  await prisma.vehicle.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  await auditLog(req, 'delete', 'vehicle', existing.id, undefined, `Deleted vehicle ${existing.registrationNumber}`);
  res.json(ok({ deleted: true }));
});

// ─── GET /api/v1/vehicles/:id/repairs ────────────────────────────────────────
router.get('/:id/repairs', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.VehicleWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };
  const vehicle = await prisma.vehicle.findFirst({ where, select: { id: true } });
  if (!vehicle) { res.status(404).json(fail('Vehicle not found')); return; }

  const repairs = await prisma.repairJob.findMany({
    where: { vehicleId: vehicle.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      repairProvider: { select: { id: true, name: true } },
    },
  });

  res.json(ok(repairs));
});

export default router;
