import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';
import {
  generateRepairNumber,
  validateStatusTransition,
  handleStatusChange,
  checkWarrantyRecurrence,
} from '../services/repairService';
import { notify } from '../services/notificationService';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── POST /api/v1/repairs/export ─────────────────────────────────────────────
router.post('/export', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const { fleetId, vehicleId, status, priority, repairType, providerId, dateFrom, dateTo } =
    req.body as Record<string, string>;

  const where: Prisma.RepairJobWhereInput = {
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
    ...(fleetId ? { fleetId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(repairType ? { repairType } : {}),
    ...(providerId ? { providerId } : {}),
    ...(dateFrom || dateTo
      ? { createdAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
      : {}),
  };

  const rows = await prisma.repairJob.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      vehicle: { select: { registrationNumber: true } },
      repairProvider: { select: { name: true } },
    },
  });

  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const cols = ['Repair #', 'Vehicle', 'Type', 'Priority', 'Status', 'Provider', 'Reported Date', 'Est. Completion', 'Total Cost'];
  const csvRows = rows.map((r) =>
    [
      r.repairNumber,
      r.vehicle.registrationNumber,
      r.repairType.replace(/_/g, ' '),
      r.priority,
      r.status.replace(/_/g, ' '),
      r.repairProvider?.name ?? '',
      r.createdAt.toISOString().slice(0, 10),
      r.estimatedCompletion?.toISOString().slice(0, 10) ?? '',
      r.totalCost ?? '',
    ]
      .map(escape)
      .join(','),
  );

  const csv = [cols.join(','), ...csvRows].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="repairs-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

// ─── GET /api/v1/repairs ─────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const fleetId = req.query.fleetId as string | undefined;
  const vehicleId = req.query.vehicleId as string | undefined;
  const status = req.query.status as string | undefined;
  const priority = req.query.priority as string | undefined;
  const repairType = req.query.repairType as string | undefined;
  const providerId = req.query.providerId as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const take = Math.min(parseInt((req.query.limit as string) ?? '25', 10), 100);

  const where: Prisma.RepairJobWhereInput = {
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
    ...(fleetId ? { fleetId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(repairType ? { repairType } : {}),
    ...(providerId ? { providerId } : {}),
    ...(dateFrom || dateTo
      ? { createdAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
      : {}),
  };

  const [total, repairs] = await Promise.all([
    prisma.repairJob.count({ where }),
    prisma.repairJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        repairProvider: { select: { id: true, name: true } },
        fleet: { select: { id: true, name: true } },
      },
    }),
  ]);

  const nextCursor = repairs.length === take ? repairs[repairs.length - 1]?.id ?? null : null;
  res.json(ok(repairs, { total, nextCursor }));
});

// ─── POST /api/v1/repairs ────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    vehicleId: string;
    driverId?: string;
    repairType: string;
    priority: string;
    description: string;
    isDrivable: boolean;
    odometerAtReport?: number;
    breakdownLatitude?: number;
    breakdownLongitude?: number;
    estimatedCompletion?: string;
    incidentId?: string;
  };

  if (!body.vehicleId || !body.repairType || !body.priority || !body.description || body.isDrivable === undefined) {
    res.status(400).json(fail('vehicleId, repairType, priority, description, and isDrivable are required'));
    return;
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: body.vehicleId, deletedAt: null },
    select: { operatorId: true, fleetId: true, registrationNumber: true },
  });
  if (!vehicle) { res.status(404).json(fail('Vehicle not found')); return; }

  const operatorScope = getOperatorScope(req);
  if (operatorScope && vehicle.operatorId !== operatorScope) {
    res.status(403).json(fail('Access denied'));
    return;
  }

  // Check for active warranty
  const warrantyMatch = await checkWarrantyRecurrence(body.vehicleId, body.repairType, prisma);

  // Wrap number generation + create in a transaction to prevent duplicate repair numbers
  const repair = await prisma.$transaction(async (tx) => {
    const repairNumber = await generateRepairNumber(tx);
    return tx.repairJob.create({
      data: {
        operatorId: vehicle.operatorId,
        vehicleId: body.vehicleId,
        driverId: body.driverId ?? null,
        fleetId: vehicle.fleetId,
        incidentId: body.incidentId ?? null,
        repairNumber,
        repairType: body.repairType,
        priority: body.priority,
        description: body.description,
        isDrivable: body.isDrivable,
        odometerAtReport: body.odometerAtReport ?? null,
        breakdownLatitude: body.breakdownLatitude ?? null,
        breakdownLongitude: body.breakdownLongitude ?? null,
        estimatedCompletion: body.estimatedCompletion ? new Date(body.estimatedCompletion) : null,
      },
      include: {
        vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
      },
    });
  });

  await auditLog(req, 'create', 'repair_job', repair.id, undefined,
    `Logged repair ${repair.repairNumber} for vehicle ${vehicle.registrationNumber}`);

  await notify({
    operatorId: vehicle.operatorId,
    type: 'repair_reported',
    title: `New Repair Logged — ${vehicle.registrationNumber}`,
    message: `${repair.repairNumber}: ${body.repairType.replace(/_/g, ' ')} (${body.priority} priority) reported for ${vehicle.registrationNumber}.`,
    metadata: { repairJobId: repair.id, repairNumber: repair.repairNumber, vehicleId: body.vehicleId },
  }, prisma);

  res.status(201).json(ok({
    ...repair,
    warrantyMatch: warrantyMatch ? { id: warrantyMatch.id, repairNumber: warrantyMatch.repairNumber } : null,
  }));
});

// ─── GET /api/v1/repairs/:id ─────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.RepairJobWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const repair = await prisma.repairJob.findFirst({
    where,
    include: {
      vehicle: true,
      driver: true,
      fleet: true,
      repairProvider: true,
      repairQuotes: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: { repairProvider: { select: { id: true, name: true } } },
      },
      workLogs: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!repair) { res.status(404).json(fail('Repair not found')); return; }
  res.json(ok(repair));
});

// ─── PATCH /api/v1/repairs/:id ───────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.RepairJobWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.repairJob.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Repair not found')); return; }

  const body = req.body as Partial<{
    status: string; priority: string; repairType: string; description: string;
    diagnosisNotes: string; isDrivable: boolean; odometerAtReport: number;
    providerId: string; estimatedCompletion: string; actualCompletion: string;
    totalCost: number; labourCost: number; partsCost: number; towingCost: number;
    vatAmount: number; warrantyMonths: number; cancellationReason: string;
  }>;

  // Validate status transition if status is changing
  if (body.status && body.status !== existing.status) {
    if (!validateStatusTransition(existing.status, body.status)) {
      res.status(400).json(fail(`Invalid status transition: ${existing.status} → ${body.status}`));
      return;
    }
    if (body.status === 'cancelled' && !body.cancellationReason) {
      res.status(400).json(fail('cancellationReason is required when cancelling a repair'));
      return;
    }
  }

  // Compute derived fields for completion
  let actualCompletion: Date | undefined;
  let downtimeDays: number | undefined;
  let warrantyExpiry: Date | undefined;

  if (body.status === 'completed') {
    actualCompletion = body.actualCompletion ? new Date(body.actualCompletion) : new Date();
    const msElapsed = actualCompletion.getTime() - existing.createdAt.getTime();
    downtimeDays = Math.max(0, Math.floor(msElapsed / (1000 * 60 * 60 * 24)));

    const months = body.warrantyMonths ?? existing.warrantyMonths;
    if (months) {
      warrantyExpiry = new Date(actualCompletion);
      warrantyExpiry.setMonth(warrantyExpiry.getMonth() + months);
    }
  }

  const updated = await prisma.repairJob.update({
    where: { id: existing.id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.repairType !== undefined && { repairType: body.repairType }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.diagnosisNotes !== undefined && { diagnosisNotes: body.diagnosisNotes }),
      ...(body.isDrivable !== undefined && { isDrivable: body.isDrivable }),
      ...(body.odometerAtReport !== undefined && { odometerAtReport: body.odometerAtReport }),
      ...(body.providerId !== undefined && { providerId: body.providerId }),
      ...(body.estimatedCompletion !== undefined && { estimatedCompletion: new Date(body.estimatedCompletion) }),
      ...(body.totalCost !== undefined && { totalCost: body.totalCost }),
      ...(body.labourCost !== undefined && { labourCost: body.labourCost }),
      ...(body.partsCost !== undefined && { partsCost: body.partsCost }),
      ...(body.towingCost !== undefined && { towingCost: body.towingCost }),
      ...(body.vatAmount !== undefined && { vatAmount: body.vatAmount }),
      ...(body.warrantyMonths !== undefined && { warrantyMonths: body.warrantyMonths }),
      ...(body.cancellationReason !== undefined && { cancellationReason: body.cancellationReason }),
      ...(actualCompletion !== undefined && { actualCompletion }),
      ...(downtimeDays !== undefined && { downtimeDays }),
      ...(warrantyExpiry !== undefined && { warrantyExpiry }),
    },
  });

  // Handle vehicle status side effects
  if (body.status && body.status !== existing.status) {
    await handleStatusChange(updated, body.status, prisma);
    await auditLog(req, 'status_change', 'repair_job', updated.id,
      { status: { old: existing.status, new: body.status } },
      `Repair ${updated.repairNumber} status: ${existing.status} → ${body.status}`);

    // Status-specific notifications
    if (body.status === 'completed') {
      await notify({
        operatorId: updated.operatorId,
        type: 'repair_completed',
        title: `Repair Completed — ${updated.repairNumber}`,
        message: `Repair ${updated.repairNumber} has been completed. Downtime: ${updated.downtimeDays ?? 0} day(s). Total cost: ${updated.totalCost ? `R ${Number(updated.totalCost).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}` : 'TBC'}.`,
        metadata: { repairJobId: updated.id, repairNumber: updated.repairNumber, vehicleId: updated.vehicleId },
      }, prisma);
    } else if (body.status === 'in_progress') {
      // Check if repair is overdue (est. completion in the past)
      if (updated.estimatedCompletion && updated.estimatedCompletion < new Date()) {
        await notify({
          operatorId: updated.operatorId,
          type: 'repair_overdue',
          title: `Repair Overdue — ${updated.repairNumber}`,
          message: `Repair ${updated.repairNumber} is now in progress but was estimated to complete by ${updated.estimatedCompletion.toLocaleDateString('en-ZA')}.`,
          metadata: { repairJobId: updated.id, repairNumber: updated.repairNumber },
        }, prisma);
      }
    }
  } else {
    await auditLog(req, 'update', 'repair_job', updated.id, undefined, `Updated repair ${updated.repairNumber}`);
  }

  res.json(ok(updated));
});

// ─── POST /api/v1/repairs/:id/quotes ─────────────────────────────────────────
router.post('/:id/quotes', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.RepairJobWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const repair = await prisma.repairJob.findFirst({ where });
  if (!repair) { res.status(404).json(fail('Repair not found')); return; }

  const body = req.body as {
    providerId: string;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
    labourTotal: number;
    partsTotal: number;
    totalExclVat: number;
    vatAmount: number;
    totalInclVat: number;
    estimatedDays?: number;
    warrantyMonths?: number;
    validUntil?: string;
    quoteNumber?: string;
    documentUrl?: string;
  };

  if (!body.providerId || !body.lineItems || body.totalInclVat === undefined) {
    res.status(400).json(fail('providerId, lineItems, and totalInclVat are required'));
    return;
  }

  const quote = await prisma.repairQuote.create({
    data: {
      repairJobId: repair.id,
      providerId: body.providerId,
      quoteNumber: body.quoteNumber ?? null,
      lineItems: body.lineItems as unknown as Prisma.InputJsonValue,
      labourTotal: body.labourTotal,
      partsTotal: body.partsTotal,
      totalExclVat: body.totalExclVat,
      vatAmount: body.vatAmount,
      totalInclVat: body.totalInclVat,
      estimatedDays: body.estimatedDays ?? null,
      warrantyMonths: body.warrantyMonths ?? null,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      documentUrl: body.documentUrl ?? null,
    },
    include: { repairProvider: { select: { id: true, name: true } } },
  });

  await auditLog(req, 'create', 'repair_job', repair.id, undefined,
    `Quote submitted for repair ${repair.repairNumber}`);

  res.status(201).json(ok(quote));
});

// ─── PATCH /api/v1/repairs/:id/quotes/:quoteId ───────────────────────────────
router.patch('/:id/quotes/:quoteId', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const repairWhere: Prisma.RepairJobWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const repair = await prisma.repairJob.findFirst({ where: repairWhere });
  if (!repair) { res.status(404).json(fail('Repair not found')); return; }

  const quote = await prisma.repairQuote.findFirst({
    where: { id: req.params.quoteId as string, repairJobId: repair.id, deletedAt: null },
  });
  if (!quote) { res.status(404).json(fail('Quote not found')); return; }

  const { status } = req.body as { status: 'approved' | 'rejected' };
  if (!['approved', 'rejected'].includes(status)) {
    res.status(400).json(fail('status must be "approved" or "rejected"'));
    return;
  }

  const updatedQuote = await prisma.repairQuote.update({
    where: { id: quote.id },
    data: { status },
  });

  // On approve: link provider + quote to repair, move to quoted status
  if (status === 'approved') {
    await prisma.repairJob.update({
      where: { id: repair.id },
      data: {
        approvedQuoteId: quote.id,
        providerId: quote.providerId,
        status: 'quoted',
        totalCost: Number(quote.totalInclVat),
        labourCost: Number(quote.labourTotal),
        partsCost: Number(quote.partsTotal),
        vatAmount: Number(quote.vatAmount),
        warrantyMonths: quote.warrantyMonths ?? undefined,
      },
    });

    // Reject all other pending quotes for this repair
    await prisma.repairQuote.updateMany({
      where: { repairJobId: repair.id, id: { not: quote.id }, status: 'pending' },
      data: { status: 'rejected' },
    });

    await auditLog(req, 'status_change', 'repair_job', repair.id,
      { status: { old: repair.status, new: 'quoted' } },
      `Quote approved for repair ${repair.repairNumber}`);

    await notify({
      operatorId: repair.operatorId,
      type: 'repair_quote_approved',
      title: `Quote Approved — ${repair.repairNumber}`,
      message: `A quote of R ${Number(quote.totalInclVat).toLocaleString('en-ZA', { minimumFractionDigits: 2 })} has been approved for repair ${repair.repairNumber}. Work can now proceed.`,
      metadata: { repairJobId: repair.id, repairNumber: repair.repairNumber, quoteId: quote.id },
    }, prisma);
  } else {
    await auditLog(req, 'update', 'repair_job', repair.id, undefined,
      `Quote rejected for repair ${repair.repairNumber}`);
  }

  res.json(ok(updatedQuote));
});

// ─── POST /api/v1/repairs/:id/work-log ───────────────────────────────────────
router.post('/:id/work-log', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.RepairJobWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const repair = await prisma.repairJob.findFirst({ where });
  if (!repair) { res.status(404).json(fail('Repair not found')); return; }

  const body = req.body as {
    note: string;
    photosJson?: string[];
    partsReplaced?: Array<{ partName: string; partNumber?: string; cost?: number }>;
  };

  if (!body.note) {
    res.status(400).json(fail('note is required'));
    return;
  }

  const entry = await prisma.repairWorkLog.create({
    data: {
      repairJobId: repair.id,
      userId: req.user!.id,
      note: body.note,
      photosJson: body.photosJson ? (body.photosJson as unknown as Prisma.InputJsonValue) : undefined,
      partsReplaced: body.partsReplaced ? (body.partsReplaced as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  res.status(201).json(ok(entry));
});

// ─── GET /api/v1/repairs/:id/work-log ────────────────────────────────────────
router.get('/:id/work-log', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.RepairJobWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const repair = await prisma.repairJob.findFirst({ where });
  if (!repair) { res.status(404).json(fail('Repair not found')); return; }

  const logs = await prisma.repairWorkLog.findMany({
    where: { repairJobId: repair.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json(ok(logs));
});

export default router;
