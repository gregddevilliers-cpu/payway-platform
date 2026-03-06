import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';
import { generateChanges } from '../services/auditService';
import {
  calculateEfficiency,
  getVehicleRollingAverage,
  calculateLitresPer100km,
  calculateCostPerKm,
} from '../services/fuelEfficiencyService';
import { detectAnomalies, resolveAnomaly, AnomalyFlag } from '../services/anomalyDetectionService';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── GET /api/v1/fuel-transactions ───────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { vehicleId, fleetId, driverId, dateFrom, dateTo, cursor, limit = '50' } =
    req.query as Record<string, string>;

  const take = Math.min(parseInt(limit, 10) || 50, 200);
  const operatorId = getOperatorScope(req);

  const where: Prisma.FuelTransactionWhereInput = {
    ...(operatorId ? { operatorId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(fleetId ? { fleetId } : {}),
    ...(driverId ? { driverId } : {}),
    ...(dateFrom || dateTo
      ? {
          transactionDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const txns = await prisma.fuelTransaction.findMany({
    where,
    orderBy: { transactionDate: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const hasMore = txns.length > take;
  const data = hasMore ? txns.slice(0, take) : txns;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

  res.json(ok(data, { nextCursor, hasMore, count: data.length }));
});

// ─── POST /api/v1/fuel-transactions ──────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {
    vehicleId, driverId, fleetId, transactionDate,
    litresFilled, pricePerLitre, totalAmount, fuelType,
    odometer, siteCode, siteName,
  } = req.body as {
    vehicleId: string;
    driverId: string;
    fleetId?: string;
    transactionDate?: string;
    litresFilled: number;
    pricePerLitre: number;
    totalAmount: number;
    fuelType: string;
    odometer?: number;
    siteCode?: string;
    siteName?: string;
  };

  if (!vehicleId || !driverId || !litresFilled || !pricePerLitre || !totalAmount || !fuelType) {
    res.status(400).json(fail('vehicleId, driverId, litresFilled, pricePerLitre, totalAmount, and fuelType are required'));
    return;
  }

  // Resolve vehicle to get operatorId and fleetId
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, deletedAt: null },
    select: { operatorId: true, fleetId: true },
  });
  if (!vehicle) { res.status(404).json(fail('Vehicle not found')); return; }

  const operatorScope = getOperatorScope(req);
  if (operatorScope && vehicle.operatorId !== operatorScope) {
    res.status(403).json(fail('Access denied'));
    return;
  }

  // Calculate fuel efficiency if odometer is provided
  let fuelEfficiency: number | null = null;
  if (odometer != null) {
    // Find previous transaction for this vehicle that has an odometer reading
    const prev = await prisma.fuelTransaction.findFirst({
      where: { vehicleId, odometer: { not: null } },
      orderBy: { transactionDate: 'desc' },
      select: { odometer: true },
    });
    if (prev?.odometer != null) {
      fuelEfficiency = calculateEfficiency(odometer, prev.odometer, litresFilled);
    }
  }

  const txn = await prisma.fuelTransaction.create({
    data: {
      operatorId: vehicle.operatorId,
      fleetId: fleetId ?? vehicle.fleetId,
      vehicleId,
      driverId,
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      litresFilled,
      pricePerLitre,
      totalAmount,
      fuelType,
      odometer: odometer ?? null,
      siteCode: siteCode ?? null,
      siteName: siteName ?? null,
      fuelEfficiency: fuelEfficiency ?? undefined,
      anomalyFlags: '[]',
    },
    include: {
      vehicle: { select: { id: true, registrationNumber: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const txnWithRels = txn as typeof txn & { vehicle: { id: string; registrationNumber: string } };
  await auditLog(req, 'create', 'fuel_transaction', txn.id, undefined,
    `Fuel transaction for vehicle ${txnWithRels.vehicle.registrationNumber}: ${litresFilled}L`);

  // Run anomaly detection asynchronously (don't block response)
  detectAnomalies(
    {
      id: txn.id,
      operatorId: txn.operatorId,
      vehicleId: txn.vehicleId,
      driverId: txn.driverId,
      fleetId: txn.fleetId,
      transactionDate: txn.transactionDate,
      litresFilled: txn.litresFilled,
      totalAmount: txn.totalAmount,
      fuelType: txn.fuelType,
      odometer: txn.odometer ?? null,
    },
    prisma,
  ).then(async (flags) => {
    if (flags.length > 0) {
      await prisma.fuelTransaction.update({
        where: { id: txn.id },
        data: { anomalyFlags: JSON.stringify(flags) },
      });
    }
  }).catch((err: unknown) => console.error('[Anomaly Detection]', err));

  res.status(201).json(ok(txn));
});

// ─── GET /api/v1/fuel-transactions/anomalies/summary ─────────────────────────
router.get('/anomalies/summary', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const txnsWithFlags = await prisma.fuelTransaction.findMany({
    where: { ...(operatorId ? { operatorId } : {}) },
    select: { id: true, anomalyFlags: true, vehicleId: true, driverId: true, transactionDate: true,
      vehicle: { select: { registrationNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
    },
  });

  const summary = { unresolvedHigh: 0, unresolvedMedium: 0, unresolvedLow: 0, resolvedThisMonth: 0 };
  const codeCounts: Record<string, number> = {};

  for (const t of txnsWithFlags) {
    const flags = t.anomalyFlags as unknown as AnomalyFlag[];
    if (!Array.isArray(flags) || flags.length === 0) continue;
    for (const f of flags) {
      if (f.resolution == null) {
        if (f.severity === 'high') summary.unresolvedHigh++;
        else if (f.severity === 'medium') summary.unresolvedMedium++;
        else summary.unresolvedLow++;
        codeCounts[f.code] = (codeCounts[f.code] ?? 0) + 1;
      } else if (f.resolvedAt && new Date(f.resolvedAt) >= monthStart) {
        summary.resolvedThisMonth++;
      }
    }
  }

  const topAnomalyTypes = Object.entries(codeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  res.json(ok({ summary, topAnomalyTypes }));
});

// ─── GET /api/v1/fuel-transactions/anomalies ─────────────────────────────────
router.get('/anomalies', async (req: Request, res: Response): Promise<void> => {
  const { vehicleId, fleetId, driverId, severity, dateFrom, dateTo, resolved, cursor, limit = '50' } =
    req.query as Record<string, string>;
  const take = Math.min(parseInt(limit, 10) || 50, 200);
  const operatorId = getOperatorScope(req);

  const where: Prisma.FuelTransactionWhereInput = {
    ...(operatorId ? { operatorId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(fleetId ? { fleetId } : {}),
    ...(driverId ? { driverId } : {}),
    ...(dateFrom || dateTo ? {
      transactionDate: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    } : {}),
  };

  const txns = await prisma.fuelTransaction.findMany({
    where,
    orderBy: { transactionDate: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  // Filter to only those with anomaly flags, then apply severity/resolved filters in memory
  let data = txns.slice(0, take)
    .map((t) => ({ ...t, anomalyFlags: t.anomalyFlags as unknown as AnomalyFlag[] }))
    .filter((t) => t.anomalyFlags.length > 0);

  if (severity) {
    data = data.filter((t) => t.anomalyFlags.some((f) => f.severity === severity));
  }
  if (resolved === 'true') {
    data = data.filter((t) => t.anomalyFlags.some((f) => f.resolution != null));
  } else if (resolved === 'false') {
    data = data.filter((t) => t.anomalyFlags.some((f) => f.resolution == null));
  }

  const hasMore = txns.length > take;
  const nextCursor = hasMore ? (txns[take - 1]?.id ?? null) : null;
  res.json(ok(data, { nextCursor, hasMore, count: data.length }));
});

// ─── GET /api/v1/fuel-transactions/:id ───────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.FuelTransactionWhereInput = {
    id: req.params.id as string,
    ...(operatorId ? { operatorId } : {}),
  };

  const txn = await prisma.fuelTransaction.findFirst({
    where,
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true, tankCapacity: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
      fleet: { select: { id: true, name: true } },
    },
  });

  if (!txn) { res.status(404).json(fail('Transaction not found')); return; }

  // Efficiency metrics
  const rollingAvgKpl = await getVehicleRollingAverage(txn.vehicleId, 10, prisma);
  const kpl = txn.fuelEfficiency ? Number(txn.fuelEfficiency) : null;
  const l100km = kpl ? calculateLitresPer100km(kpl) : null;
  const costPerKm = (kpl && txn.odometer)
    ? calculateCostPerKm(Number(txn.totalAmount), Number(txn.litresFilled) * kpl)
    : null;

  res.json(ok({
    ...txn,
    efficiency: {
      kpl,
      l100km,
      costPerKm,
      rollingAvgKpl,
      rollingAvgL100km: rollingAvgKpl ? calculateLitresPer100km(rollingAvgKpl) : null,
    },
  }));
});

// ─── PATCH /api/v1/fuel-transactions/:id ─────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.FuelTransactionWhereInput = {
    id: req.params.id as string,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.fuelTransaction.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Transaction not found')); return; }

  const updated = await prisma.fuelTransaction.update({
    where: { id: existing.id },
    data: req.body as Prisma.FuelTransactionUpdateInput,
  });

  const changes = generateChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    ['litresFilled', 'pricePerLitre', 'totalAmount', 'fuelType', 'odometer', 'status'],
  );

  await auditLog(req, 'update', 'fuel_transaction', existing.id, changes);
  res.json(ok(updated));
});

// ─── PATCH /api/v1/fuel-transactions/:id/anomalies/:code ─────────────────────
router.patch('/:id/anomalies/:code', async (req: Request, res: Response): Promise<void> => {
  const { resolution } = req.body as { resolution: 'dismissed' | 'confirmed' | 'under_review' };
  if (!['dismissed', 'confirmed', 'under_review'].includes(resolution)) {
    res.status(400).json(fail('resolution must be dismissed, confirmed, or under_review'));
    return;
  }

  const operatorId = getOperatorScope(req);
  const txn = await prisma.fuelTransaction.findFirst({
    where: { id: req.params.id as string, ...(operatorId ? { operatorId } : {}) },
  });
  if (!txn) { res.status(404).json(fail('Transaction not found')); return; }

  const userId = (req as unknown as { user: { id: string } }).user.id;
  await resolveAnomaly(req.params.id as string, req.params.code as string, resolution, userId, prisma);
  await auditLog(req, 'update', 'fuel_transaction', txn.id, undefined,
    `Anomaly '${req.params.code}' marked as '${resolution}'`);

  res.json(ok({ resolved: true }));
});

export default router;
