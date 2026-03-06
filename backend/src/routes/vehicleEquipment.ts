import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import { logAction } from '../services/auditService';

const router = Router({ mergeParams: true });

router.use(authenticate);

const equipmentReadAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager', 'driver');
const equipmentWriteAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');

const EQUIPMENT_TYPES = [
  'branding',
  'lights',
  'radio',
  'fire_extinguisher',
  'first_aid_kit',
  'tools',
  'jack',
  'spare_wheel',
  'warning_triangle',
  'reflective_vest',
  'other',
] as const;

const VALID_STATUSES = ['present', 'missing', 'expired', 'damaged'] as const;

/**
 * Helper: verify vehicle belongs to the operator and is not soft-deleted.
 */
async function resolveVehicle(vehicleId: string, operatorId: string) {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, operatorId, deletedAt: null },
  });
  if (!vehicle) throw new AppError(404, 'Vehicle not found');
  return vehicle;
}

// ---------------------------------------------------------------------------
// GET /api/v1/vehicles/:vehicleId/equipment — list all equipment for a vehicle
// ---------------------------------------------------------------------------
router.get('/', equipmentReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { vehicleId } = req.params as { vehicleId: string };

    await resolveVehicle(vehicleId, operatorId);

    const equipment = await prisma.vehicleEquipment.findMany({
      where: { vehicleId },
      orderBy: { equipmentType: 'asc' },
    });

    res.json({ success: true, data: equipment });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/vehicles/:vehicleId/equipment/generate — auto-generate all 11
// ---------------------------------------------------------------------------
router.post('/generate', equipmentWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { vehicleId } = req.params as { vehicleId: string };

    await resolveVehicle(vehicleId, operatorId);

    // Fetch existing equipment types for this vehicle to avoid duplicates
    const existing = await prisma.vehicleEquipment.findMany({
      where: { vehicleId },
      select: { equipmentType: true },
    });
    const existingTypes = new Set(existing.map((e) => e.equipmentType));

    const newTypes = EQUIPMENT_TYPES.filter((t) => !existingTypes.has(t));

    if (newTypes.length > 0) {
      await prisma.vehicleEquipment.createMany({
        data: newTypes.map((equipmentType) => ({
          vehicleId,
          equipmentType,
          status: 'present',
        })),
        skipDuplicates: true,
      });
    }

    const equipment = await prisma.vehicleEquipment.findMany({
      where: { vehicleId },
      orderBy: { equipmentType: 'asc' },
    });

    await logAction({
      operatorId,
      userId,
      action: 'create',
      entityType: 'vehicle' as any,
      entityId: vehicleId,
      metadata: { subEntity: 'equipment', generated: newTypes },
    });

    res.status(201).json({ success: true, data: equipment });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/vehicles/:vehicleId/equipment/:id — update single equipment
// ---------------------------------------------------------------------------
router.patch('/:id', equipmentWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { vehicleId, id } = req.params as { vehicleId: string; id: string };

    await resolveVehicle(vehicleId, operatorId);

    const existing = await prisma.vehicleEquipment.findFirst({
      where: { id, vehicleId },
    });
    if (!existing) throw new AppError(404, 'Equipment record not found');

    const { status, expiryDate, lastChecked, notes } = req.body as {
      status?: string;
      expiryDate?: string | null;
      lastChecked?: string | null;
      notes?: string | null;
    };

    if (status !== undefined && !(VALID_STATUSES as readonly string[]).includes(status)) {
      throw new AppError(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }

    const updated = await prisma.vehicleEquipment.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(expiryDate !== undefined ? { expiryDate: expiryDate ? new Date(expiryDate) : null } : {}),
        ...(lastChecked !== undefined ? { lastChecked: lastChecked ? new Date(lastChecked) : null } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });

    await logAction({
      operatorId,
      userId,
      action: 'update',
      entityType: 'vehicle' as any,
      entityId: vehicleId,
      metadata: { subEntity: 'equipment', equipmentId: id, changes: req.body as Record<string, unknown> },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/vehicles/:vehicleId/equipment — bulk update (checklist form)
// ---------------------------------------------------------------------------
router.patch('/', equipmentWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { vehicleId } = req.params as { vehicleId: string };

    await resolveVehicle(vehicleId, operatorId);

    const { items } = req.body as {
      items: Array<{
        equipmentType: string;
        status: string;
        expiryDate?: string | null;
        notes?: string | null;
      }>;
    };

    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError(400, 'items array is required and must not be empty');
    }

    // Validate each item
    for (const item of items) {
      if (!item.equipmentType?.trim()) {
        throw new AppError(400, 'Each item must have an equipmentType');
      }
      if (!(VALID_STATUSES as readonly string[]).includes(item.status)) {
        throw new AppError(400, `Invalid status "${item.status}" for ${item.equipmentType}. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }
    }

    // Upsert each item inside a transaction
    await prisma.$transaction(
      items.map((item) =>
        prisma.vehicleEquipment.upsert({
          where: {
            vehicleId_equipmentType: {
              vehicleId,
              equipmentType: item.equipmentType,
            },
          },
          create: {
            vehicleId,
            equipmentType: item.equipmentType,
            status: item.status,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
            notes: item.notes ?? null,
          },
          update: {
            status: item.status,
            ...(item.expiryDate !== undefined ? { expiryDate: item.expiryDate ? new Date(item.expiryDate) : null } : {}),
            ...(item.notes !== undefined ? { notes: item.notes } : {}),
          },
        }),
      ),
    );

    const equipment = await prisma.vehicleEquipment.findMany({
      where: { vehicleId },
      orderBy: { equipmentType: 'asc' },
    });

    await logAction({
      operatorId,
      userId,
      action: 'bulk_action',
      entityType: 'vehicle' as any,
      entityId: vehicleId,
      metadata: { subEntity: 'equipment', itemCount: items.length },
    });

    res.json({ success: true, data: equipment });
  } catch (err) {
    next(err);
  }
});

export default router;
