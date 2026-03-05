import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';
import { generateChanges } from '../services/auditService';
import {
  generateIncidentNumber,
  calculateDowntimeDays,
} from '../services/incidentService';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── POST /api/v1/incidents/export ───────────────────────────────────────────
router.post('/export', async (req: Request, res: Response): Promise<void> => {
  const { fleetId, vehicleId, driverId, incidentType, severity, status, dateFrom, dateTo } =
    req.body as Record<string, string>;

  const operatorId = getOperatorScope(req);
  const where: Prisma.IncidentWhereInput = {
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
    ...(fleetId ? { fleetId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(driverId ? { driverId } : {}),
    ...(incidentType ? { incidentType } : {}),
    ...(severity ? { severity } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? { incidentDate: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
      : {}),
  };

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: { incidentDate: 'desc' },
    include: {
      vehicle: { select: { registrationNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
    },
  });

  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const cols = ['incidentNumber', 'incidentDate', 'vehicle', 'driver', 'incidentType', 'severity', 'status', 'claimStatus', 'costEstimate', 'location'];
  const rows = incidents.map((i) =>
    [
      i.incidentNumber,
      i.incidentDate.toISOString().slice(0, 10),
      i.vehicle.registrationNumber,
      i.driver ? `${i.driver.firstName} ${i.driver.lastName}` : '',
      i.incidentType,
      i.severity,
      i.status,
      i.claimStatus ?? '',
      i.costEstimate ?? '',
      i.location ?? '',
    ]
      .map(escape)
      .join(','),
  );

  const csv = [cols.join(','), ...rows].join('\n');
  const filename = `incidents-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ─── GET /api/v1/incidents ───────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const {
    fleetId, vehicleId, driverId, incidentType, severity, claimStatus, status,
    dateFrom, dateTo, cursor, limit = '50',
  } = req.query as Record<string, string>;

  const take = Math.min(parseInt(limit, 10) || 50, 200);
  const operatorId = getOperatorScope(req);

  const where: Prisma.IncidentWhereInput = {
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
    ...(fleetId ? { fleetId } : {}),
    ...(vehicleId ? { vehicleId } : {}),
    ...(driverId ? { driverId } : {}),
    ...(incidentType ? { incidentType } : {}),
    ...(severity ? { severity } : {}),
    ...(claimStatus ? { claimStatus } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          incidentDate: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const incidents = await prisma.incident.findMany({
    where,
    orderBy: { incidentDate: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const hasMore = incidents.length > take;
  const data = hasMore ? incidents.slice(0, take) : incidents;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;

  res.json(ok(data, { nextCursor, hasMore, count: data.length }));
});

// ─── POST /api/v1/incidents ──────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {
    vehicleId, driverId, incidentDate, incidentType, description, severity,
    location, latitude, longitude, policeCaseNumber, insuranceClaimNumber,
    claimStatus, claimAmount, payoutAmount, costEstimate,
    downtimeStart, downtimeEnd, thirdPartyInvolved, thirdPartyDetails, notes,
  } = req.body as {
    vehicleId: string;
    driverId?: string;
    incidentDate: string;
    incidentType: string;
    description: string;
    severity: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    policeCaseNumber?: string;
    insuranceClaimNumber?: string;
    claimStatus?: string;
    claimAmount?: number;
    payoutAmount?: number;
    costEstimate?: number;
    downtimeStart?: string;
    downtimeEnd?: string;
    thirdPartyInvolved?: boolean;
    thirdPartyDetails?: string;
    notes?: string;
  };

  if (!vehicleId || !incidentDate || !incidentType || !description || !severity) {
    res.status(400).json(fail('vehicleId, incidentDate, incidentType, description, and severity are required'));
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

  const incidentNumber = await generateIncidentNumber(prisma);

  // Calculate downtime days if both dates provided
  let downtimeDays: number | null = null;
  if (downtimeStart && downtimeEnd) {
    downtimeDays = calculateDowntimeDays(new Date(downtimeStart), new Date(downtimeEnd));
  }

  const incident = await prisma.incident.create({
    data: {
      operatorId: vehicle.operatorId,
      vehicleId,
      driverId: driverId ?? null,
      fleetId: vehicle.fleetId,
      incidentNumber,
      incidentDate: new Date(incidentDate),
      incidentType,
      description,
      severity,
      location: location ?? null,
      latitude: latitude != null ? latitude : null,
      longitude: longitude != null ? longitude : null,
      policeCaseNumber: policeCaseNumber ?? null,
      insuranceClaimNumber: insuranceClaimNumber ?? null,
      claimStatus: claimStatus ?? null,
      claimAmount: claimAmount != null ? claimAmount : null,
      payoutAmount: payoutAmount != null ? payoutAmount : null,
      costEstimate: costEstimate != null ? costEstimate : null,
      downtimeStart: downtimeStart ? new Date(downtimeStart) : null,
      downtimeEnd: downtimeEnd ? new Date(downtimeEnd) : null,
      downtimeDays,
      thirdPartyInvolved: thirdPartyInvolved ?? false,
      thirdPartyDetails: thirdPartyDetails ?? null,
      notes: notes ?? null,
    },
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  await auditLog(req, 'create', 'incident', incident.id, undefined,
    `Logged incident ${incidentNumber} for vehicle ${vehicle.registrationNumber}`);

  res.status(201).json(ok(incident));
});

// ─── GET /api/v1/incidents/:id ───────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.IncidentWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const incident = await prisma.incident.findFirst({
    where,
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true, fleetId: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
      fleet: { select: { id: true, name: true } },
    },
  });

  if (!incident) { res.status(404).json(fail('Incident not found')); return; }
  res.json(ok(incident));
});

// ─── PATCH /api/v1/incidents/:id ─────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.IncidentWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.incident.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Incident not found')); return; }

  const updateData = { ...req.body } as Prisma.IncidentUpdateInput;

  // Recalculate downtime if both ends are present in this update or already stored
  const start = (req.body.downtimeStart as string | undefined) ?? existing.downtimeStart?.toISOString();
  const end = (req.body.downtimeEnd as string | undefined) ?? existing.downtimeEnd?.toISOString();
  if (start && end) {
    (updateData as Record<string, unknown>)['downtimeDays'] = calculateDowntimeDays(new Date(start), new Date(end));
  }

  const updated = await prisma.incident.update({ where: { id: existing.id }, data: updateData });

  const changes = generateChanges(
    existing as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
    ['incidentType', 'severity', 'status', 'claimStatus', 'claimAmount', 'payoutAmount', 'costEstimate', 'description'],
  );

  await auditLog(req, 'update', 'incident', existing.id, changes,
    `Updated incident ${existing.incidentNumber}`);

  res.json(ok(updated));
});

// ─── DELETE /api/v1/incidents/:id ─────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.IncidentWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.incident.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Incident not found')); return; }

  await prisma.incident.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });

  await auditLog(req, 'delete', 'incident', existing.id, undefined,
    `Deleted incident ${existing.incidentNumber}`);

  res.json(ok({ deleted: true }));
});

export default router;
