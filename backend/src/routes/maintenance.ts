import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';
import { generateChanges } from '../services/auditService';
import {
  calculateNextService,
  getOverdueServices,
  getUpcomingServices,
} from '../services/maintenanceService';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── GET /api/v1/maintenance/due ─────────────────────────────────────────────
// Must be registered before /:id to avoid route collision
router.get('/due', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req) ?? req.user!.operatorId!;
  const overdueOnly = req.query.overdueOnly === 'true';
  const daysAhead = parseInt(req.query.daysAhead as string ?? '30', 10);

  const overdue = await getOverdueServices(operatorId, prisma);
  if (overdueOnly) {
    res.json(ok(overdue, { count: overdue.length }));
    return;
  }

  const upcoming = await getUpcomingServices(operatorId, daysAhead, prisma);
  // Merge, avoid duplicates
  const overdueIds = new Set(overdue.map((s) => s.id));
  const combined = [...overdue, ...upcoming.filter((s) => !overdueIds.has(s.id))];
  res.json(ok(combined, { count: combined.length, overdueCount: overdue.length }));
});

// ─── GET /api/v1/maintenance/schedules ───────────────────────────────────────
router.get('/schedules', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const vehicleId = req.query.vehicleId as string | undefined;

  const where: Prisma.MaintenanceScheduleWhereInput = {
    ...(operatorId ? { operatorId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
  };

  const schedules = await prisma.maintenanceSchedule.findMany({
    where,
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true, currentOdometer: true } },
    },
    orderBy: { nextDueDate: 'asc' },
  });

  res.json(ok(schedules));
});

// ─── POST /api/v1/maintenance/schedules ──────────────────────────────────────
router.post('/schedules', async (req: Request, res: Response): Promise<void> => {
  const { vehicleId, maintenanceType, intervalMonths, intervalKm } = req.body as {
    vehicleId: string;
    maintenanceType: string;
    intervalMonths?: number;
    intervalKm?: number;
  };

  if (!vehicleId || !maintenanceType) {
    res.status(400).json(fail('vehicleId and maintenanceType are required'));
    return;
  }
  if (!intervalMonths && !intervalKm) {
    res.status(400).json(fail('At least one of intervalMonths or intervalKm is required'));
    return;
  }

  const operatorId = getOperatorScope(req) ?? req.user!.operatorId!;

  const schedule = await prisma.maintenanceSchedule.create({
    data: {
      operatorId,
      vehicleId,
      maintenanceType,
      intervalMonths: intervalMonths ?? null,
      intervalKm: intervalKm ?? null,
    },
  });

  await auditLog(req, 'create', 'maintenance_record', schedule.id, undefined,
    `Created maintenance schedule for vehicle ${vehicleId}: ${maintenanceType}`);

  res.status(201).json(ok(schedule));
});

// ─── PATCH /api/v1/maintenance/schedules/:id ─────────────────────────────────
router.patch('/schedules/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.MaintenanceScheduleWhereInput = {
    id: req.params.id as string,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.maintenanceSchedule.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Schedule not found')); return; }

  const updated = await prisma.maintenanceSchedule.update({
    where: { id: existing.id },
    data: req.body as Prisma.MaintenanceScheduleUpdateInput,
  });

  await auditLog(req, 'update', 'maintenance_record', existing.id, undefined,
    `Updated maintenance schedule ${existing.id}`);

  res.json(ok(updated));
});

// ─── DELETE /api/v1/maintenance/schedules/:id ────────────────────────────────
router.delete('/schedules/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.MaintenanceScheduleWhereInput = {
    id: req.params.id as string,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.maintenanceSchedule.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Schedule not found')); return; }

  await prisma.maintenanceSchedule.update({
    where: { id: existing.id },
    data: { isActive: false },
  });

  await auditLog(req, 'delete', 'maintenance_record', existing.id, undefined,
    `Deactivated maintenance schedule ${existing.id}`);

  res.json(ok({ deactivated: true }));
});

// ─── GET /api/v1/maintenance ─────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const {
    vehicleId, fleetId, maintenanceType, status,
    dateFrom, dateTo,
    cursor, limit = '50',
  } = req.query as Record<string, string>;

  const take = Math.min(parseInt(limit, 10) || 50, 200);
  const operatorId = getOperatorScope(req);

  const where: Prisma.MaintenanceRecordWhereInput = {
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(fleetId ? { fleetId } : {}),
    ...(maintenanceType ? { maintenanceType } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          serviceDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const records = await prisma.maintenanceRecord.findMany({
    where,
    orderBy: { serviceDate: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
    },
  });

  const hasMore = records.length > take;
  const data = hasMore ? records.slice(0, take) : records;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

  res.json(ok(data, { nextCursor, hasMore, count: data.length }));
});

// ─── POST /api/v1/maintenance/bulk-action ────────────────────────────────────
router.post('/bulk-action', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const { ids, action, payload } = req.body as { ids: string[]; action: string; payload?: Record<string, unknown> };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json(fail('No IDs provided'));
    return;
  }

  const where: Prisma.MaintenanceRecordWhereInput = {
    id: { in: ids },
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  switch (action) {
    case 'change_status': {
      const status = payload?.status as string;
      if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        res.status(400).json(fail('Invalid status'));
        return;
      }
      const result = await prisma.maintenanceRecord.updateMany({ where, data: { status, updatedAt: new Date() } });
      await auditLog(req, 'bulk_action', 'maintenance_record', ids.join(','), undefined, `Bulk status change to ${status} (${result.count} records)`);
      res.json(ok({ affected: result.count }));
      return;
    }
    case 'delete': {
      const result = await prisma.maintenanceRecord.updateMany({ where, data: { deletedAt: new Date() } });
      await auditLog(req, 'bulk_action', 'maintenance_record', ids.join(','), undefined, `Bulk delete (${result.count} records)`);
      res.json(ok({ affected: result.count }));
      return;
    }
    default:
      res.status(400).json(fail(`Unknown action: ${action}`));
  }
});

// ─── POST /api/v1/maintenance ─────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {
    vehicleId, maintenanceType, description, serviceDate,
    provider, cost, vatAmount, odometer, nextServiceDate,
    nextServiceOdometer, isScheduled, status, notes,
  } = req.body as {
    vehicleId: string;
    maintenanceType: string;
    description: string;
    serviceDate: string;
    provider?: string;
    cost?: number;
    vatAmount?: number;
    odometer?: number;
    nextServiceDate?: string;
    nextServiceOdometer?: number;
    isScheduled?: boolean;
    status?: string;
    notes?: string;
  };

  if (!vehicleId || !maintenanceType || !description || !serviceDate) {
    res.status(400).json(fail('vehicleId, maintenanceType, description, and serviceDate are required'));
    return;
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
    select: { operatorId: true, fleetId: true, registrationNumber: true },
  });
  if (!vehicle) { res.status(404).json(fail('Vehicle not found')); return; }

  const operatorScope = getOperatorScope(req);
  if (operatorScope && vehicle.operatorId !== operatorScope) {
    res.status(403).json(fail('Access denied'));
    return;
  }

  const record = await prisma.maintenanceRecord.create({
    data: {
      operatorId: vehicle.operatorId,
      vehicleId,
      fleetId: vehicle.fleetId,
      maintenanceType,
      description,
      provider: provider ?? null,
      cost: cost != null ? cost : null,
      vatAmount: vatAmount != null ? vatAmount : null,
      odometer: odometer ?? null,
      serviceDate: new Date(serviceDate),
      nextServiceDate: nextServiceDate ? new Date(nextServiceDate) : null,
      nextServiceOdometer: nextServiceOdometer ?? null,
      isScheduled: isScheduled ?? false,
      status: status ?? 'completed',
      notes: notes ?? null,
    },
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
    },
  });

  // Update linked schedule if one exists
  const schedule = await prisma.maintenanceSchedule.findFirst({
    where: {
      vehicleId,
      maintenanceType,
      isActive: true,
    },
  });
  if (schedule && record.status === 'completed') {
    await calculateNextService(schedule, record, prisma);
  }

  await auditLog(req, 'create', 'maintenance_record', record.id, undefined,
    `Logged maintenance for vehicle ${vehicle.registrationNumber}: ${maintenanceType}`);

  res.status(201).json(ok(record));
});

// ─── GET /api/v1/maintenance/:id ──────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.MaintenanceRecordWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const record = await prisma.maintenanceRecord.findFirst({
    where,
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true, fleetId: true } },
      fleet: { select: { id: true, name: true } },
    },
  });

  if (!record) { res.status(404).json(fail('Maintenance record not found')); return; }
  res.json(ok(record));
});

// ─── PATCH /api/v1/maintenance/:id ────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.MaintenanceRecordWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.maintenanceRecord.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Maintenance record not found')); return; }

  const updated = await prisma.maintenanceRecord.update({
    where: { id: existing.id },
    data: req.body as Prisma.MaintenanceRecordUpdateInput,
  });

  const changes = generateChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    ['maintenanceType', 'description', 'provider', 'cost', 'status', 'serviceDate', 'nextServiceDate', 'odometer'],
  );

  await auditLog(req, 'update', 'maintenance_record', existing.id, changes,
    `Updated maintenance record ${existing.id}`);

  res.json(ok(updated));
});

// ─── DELETE /api/v1/maintenance/:id ───────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.MaintenanceRecordWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.maintenanceRecord.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Maintenance record not found')); return; }

  await prisma.maintenanceRecord.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });

  await auditLog(req, 'delete', 'maintenance_record', existing.id, undefined,
    `Deleted maintenance record ${existing.id}`);

  res.json(ok({ deleted: true }));
});

export default router;
