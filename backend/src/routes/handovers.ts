import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import { logAction } from '../services/auditService';
import { PrismaClient } from '@prisma/client';

const router = Router();

router.use(authenticate);

const handoverReadAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');
const handoverWriteAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');

// ---------------------------------------------------------------------------
// Helper — generate handover number (HND-YYYYMM-NNNN)
// ---------------------------------------------------------------------------
async function generateHandoverNumber(p: PrismaClient): Promise<string> {
  const now = new Date();
  const prefix = `HND-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = await p.vehicleHandover.findFirst({
    where: { handoverNumber: { startsWith: prefix } },
    orderBy: { handoverNumber: 'desc' },
  });
  const seq = latest ? parseInt(latest.handoverNumber.slice(-4)) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// GET /api/v1/handovers — list with cursor-based pagination & filters
// ---------------------------------------------------------------------------
router.get('/', handoverReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { vehicleId, driverId, handoverType, cursor, limit = '50' } = req.query as Record<string, string>;

    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));

    const where = {
      operatorId,
      deletedAt: null,
      ...(vehicleId ? { vehicleId } : {}),
      ...(driverId ? { driverId } : {}),
      ...(handoverType ? { handoverType } : {}),
    };

    const handovers = await prisma.vehicleHandover.findMany({
      where,
      include: {
        vehicle: { select: { registrationNumber: true, make: true, model: true } },
        driver: { select: { firstName: true, lastName: true } },
        fleet: { select: { name: true } },
      },
      orderBy: { handoverDatetime: 'desc' },
      take: limitNum + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = handovers.length > limitNum;
    if (hasMore) handovers.pop();

    const nextCursor = hasMore ? handovers[handovers.length - 1]?.id : undefined;

    res.json({
      success: true,
      data: handovers,
      meta: {
        limit: limitNum,
        hasMore,
        nextCursor,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/handovers — create handover
// ---------------------------------------------------------------------------
router.post('/', handoverWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const {
      vehicleId,
      driverId,
      handoverType,
      handoverDatetime,
      odometerReading,
      fuelLevel,
      exteriorCondition,
      interiorCondition,
      damageNotes,
      equipmentChecklist,
      driverSignature,
      managerSignature,
      photos,
      notes,
      latitude,
      longitude,
    } = req.body as {
      vehicleId?: string;
      driverId?: string;
      handoverType?: string;
      handoverDatetime?: string;
      odometerReading?: number;
      fuelLevel?: number;
      exteriorCondition?: string;
      interiorCondition?: string;
      damageNotes?: string;
      equipmentChecklist?: unknown;
      driverSignature?: string;
      managerSignature?: string;
      photos?: unknown;
      notes?: string;
      latitude?: number;
      longitude?: number;
    };

    if (!vehicleId?.trim()) throw new AppError(400, 'vehicleId is required');
    if (!handoverType?.trim()) throw new AppError(400, 'handoverType is required');
    if (!['check_out', 'check_in'].includes(handoverType)) {
      throw new AppError(400, 'handoverType must be check_out or check_in');
    }
    if (!handoverDatetime) throw new AppError(400, 'handoverDatetime is required');

    // Look up vehicle to auto-populate fleetId and operatorId
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
      select: { id: true, operatorId: true, fleetId: true },
    });
    if (!vehicle) throw new AppError(404, 'Vehicle not found');

    const operatorId = vehicle.operatorId;

    const handoverNumber = await generateHandoverNumber(prisma as unknown as PrismaClient);

    const handover = await prisma.vehicleHandover.create({
      data: {
        operatorId,
        vehicleId,
        driverId: driverId ?? null,
        fleetId: vehicle.fleetId ?? null,
        handoverNumber,
        handoverType,
        handoverDatetime: new Date(handoverDatetime),
        odometerReading: odometerReading ?? null,
        fuelLevel: fuelLevel != null ? String(fuelLevel) : null,
        exteriorCondition: exteriorCondition ?? null,
        interiorCondition: interiorCondition ?? null,
        damageNotes: damageNotes ?? null,
        equipmentChecklist: equipmentChecklist ? JSON.stringify(equipmentChecklist) : undefined,
        driverSignature: driverSignature ?? null,
        managerSignature: managerSignature ?? null,
        photos: photos ? JSON.stringify(photos) : undefined,
        notes: notes ?? null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      },
    });

    await logAction({
      operatorId,
      userId,
      action: 'create',
      entityType: 'vehicleHandover',
      entityId: handover.id,
      metadata: { handoverNumber, vehicleId, handoverType },
    });

    res.status(201).json({ success: true, data: handover });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/handovers/:id — detail
// ---------------------------------------------------------------------------
router.get('/:id', handoverReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { id } = req.params as { id: string };

    const handover = await prisma.vehicleHandover.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        vehicle: { select: { registrationNumber: true, make: true, model: true } },
        driver: { select: { firstName: true, lastName: true } },
        fleet: { select: { name: true } },
      },
    });

    if (!handover) throw new AppError(404, 'Handover not found');

    res.json({ success: true, data: handover });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/handovers/:id — update
// ---------------------------------------------------------------------------
router.patch('/:id', handoverWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const existing = await prisma.vehicleHandover.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!existing) throw new AppError(404, 'Handover not found');

    const {
      driverId,
      handoverType,
      handoverDatetime,
      odometerReading,
      fuelLevel,
      exteriorCondition,
      interiorCondition,
      damageNotes,
      equipmentChecklist,
      driverSignature,
      managerSignature,
      photos,
      notes,
      latitude,
      longitude,
    } = req.body as {
      driverId?: string | null;
      handoverType?: string;
      handoverDatetime?: string;
      odometerReading?: number | null;
      fuelLevel?: number | null;
      exteriorCondition?: string | null;
      interiorCondition?: string | null;
      damageNotes?: string | null;
      equipmentChecklist?: unknown;
      driverSignature?: string | null;
      managerSignature?: string | null;
      photos?: unknown;
      notes?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };

    if (handoverType !== undefined && !['check_out', 'check_in'].includes(handoverType)) {
      throw new AppError(400, 'handoverType must be check_out or check_in');
    }

    const updateData: Record<string, unknown> = {};
    if (driverId !== undefined) updateData.driverId = driverId;
    if (handoverType !== undefined) updateData.handoverType = handoverType;
    if (handoverDatetime !== undefined) updateData.handoverDatetime = new Date(handoverDatetime);
    if (odometerReading !== undefined) updateData.odometerReading = odometerReading;
    if (fuelLevel !== undefined) updateData.fuelLevel = fuelLevel != null ? String(fuelLevel) : null;
    if (exteriorCondition !== undefined) updateData.exteriorCondition = exteriorCondition;
    if (interiorCondition !== undefined) updateData.interiorCondition = interiorCondition;
    if (damageNotes !== undefined) updateData.damageNotes = damageNotes;
    if (equipmentChecklist !== undefined) updateData.equipmentChecklist = equipmentChecklist;
    if (driverSignature !== undefined) updateData.driverSignature = driverSignature;
    if (managerSignature !== undefined) updateData.managerSignature = managerSignature;
    if (photos !== undefined) updateData.photos = photos;
    if (notes !== undefined) updateData.notes = notes;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;

    const updated = await prisma.vehicleHandover.update({
      where: { id },
      data: updateData as Parameters<typeof prisma.vehicleHandover.update>[0]['data'],
    });

    await logAction({
      operatorId,
      userId,
      action: 'update',
      entityType: 'vehicleHandover',
      entityId: id,
      metadata: req.body as Record<string, unknown>,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/handovers/:id — soft delete
// ---------------------------------------------------------------------------
router.delete('/:id', handoverWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const handover = await prisma.vehicleHandover.findFirst({
      where: { id, operatorId, deletedAt: null },
    });

    if (!handover) throw new AppError(404, 'Handover not found');

    await prisma.vehicleHandover.update({ where: { id }, data: { deletedAt: new Date() } });

    await logAction({
      operatorId,
      userId,
      action: 'delete',
      entityType: 'vehicleHandover',
      entityId: id,
    });

    res.json({ success: true, data: { message: 'Handover deleted' } });
  } catch (err) {
    next(err);
  }
});

export default router;
