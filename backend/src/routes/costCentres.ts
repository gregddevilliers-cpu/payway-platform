import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import { logAction } from '../services/auditService';
import {
  getSpendByCostCentre,
  getCostCentreHierarchy,
} from '../services/costCentreService';

const router = Router();

router.use(authenticate);

// Super Admin + Op Admin: full CRUD; Fleet Manager: read-only
const ccReadAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');
const ccWriteAccess = requireRole('super_admin', 'operator_admin');

// ---------------------------------------------------------------------------
// GET /api/v1/cost-centres/spend-summary
// ---------------------------------------------------------------------------
router.get('/spend-summary', ccReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { dateFrom, dateTo } = req.query as Record<string, string>;

    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = dateTo ? new Date(dateTo) : new Date();

    const summary = await getSpendByCostCentre(operatorId, from, to, prisma);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/cost-centres — list (flat or tree)
// ---------------------------------------------------------------------------
router.get('/', ccReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { format, isActive } = req.query as Record<string, string>;

    if (format === 'tree') {
      const tree = await getCostCentreHierarchy(operatorId, prisma);
      return res.json({ success: true, data: tree });
    }

    const where = {
      operatorId,
      deletedAt: null,
      ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
    };

    const costCentres = await prisma.costCentre.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { vehicles: true, fleets: true } },
      },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: costCentres });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/cost-centres
// ---------------------------------------------------------------------------
router.post('/', ccWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { name, code, description, budget, budgetPeriod, parentId, isActive } = req.body as {
      name?: string;
      code?: string;
      description?: string;
      budget?: number;
      budgetPeriod?: string;
      parentId?: string;
      isActive?: boolean;
    };

    if (!name?.trim()) throw new AppError(400, 'name is required');
    if (!code?.trim()) throw new AppError(400, 'code is required');

    // Validate parent belongs to same operator
    if (parentId) {
      const parent = await prisma.costCentre.findFirst({ where: { id: parentId, operatorId, deletedAt: null } });
      if (!parent) throw new AppError(400, 'Parent cost centre not found');
    }

    const cc = await prisma.costCentre.create({
      data: {
        operatorId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description ?? null,
        budget: budget !== undefined ? budget : null,
        budgetPeriod: budgetPeriod ?? null,
        parentId: parentId ?? null,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    await logAction({
      operatorId,
      userId,
      action: 'create',
      entityType: 'cost_centre',
      entityId: cc.id,
      metadata: { name, code },
    });

    res.status(201).json({ success: true, data: cc });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/cost-centres/:id
// ---------------------------------------------------------------------------
router.get('/:id', ccReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { id } = req.params as { id: string };
    const { dateFrom, dateTo } = req.query as Record<string, string>;

    const cc = await prisma.costCentre.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { where: { deletedAt: null }, select: { id: true, name: true, code: true, isActive: true } },
        vehicles: {
          where: { deletedAt: null },
          select: { id: true, registrationNumber: true, make: true, model: true, status: true },
        },
        fleets: {
          where: { deletedAt: null },
          select: { id: true, name: true, code: true, status: true },
        },
      },
    });

    if (!cc) throw new AppError(404, 'Cost centre not found');

    // Spend breakdown
    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = dateTo ? new Date(dateTo) : new Date();

    // Join through Vehicle — FuelTransaction/MaintenanceRecord/RepairJob don't have costCentreId directly
    const vehicleIds = cc.vehicles.map((v) => v.id);

    const [fuelAgg, maintAgg, repairAgg] = await Promise.all([
      prisma.fuelTransaction.aggregate({
        where: { vehicleId: { in: vehicleIds }, transactionDate: { gte: from, lte: to } },
        _sum: { totalAmount: true },
      }),
      prisma.maintenanceRecord.aggregate({
        where: { vehicleId: { in: vehicleIds }, serviceDate: { gte: from, lte: to }, deletedAt: null },
        _sum: { cost: true },
      }),
      prisma.repairJob.aggregate({
        where: { vehicleId: { in: vehicleIds }, createdAt: { gte: from, lte: to }, deletedAt: null },
        _sum: { totalCost: true },
      }),
    ]);

    const fuelSpend = Number(fuelAgg._sum?.totalAmount ?? 0);
    const maintenanceSpend = Number(maintAgg._sum?.cost ?? 0);
    const repairSpend = Number(repairAgg._sum?.totalCost ?? 0);
    const totalSpend = fuelSpend + maintenanceSpend + repairSpend;
    const budget = cc.budget !== null ? Number(cc.budget) : null;

    res.json({
      success: true,
      data: {
        ...cc,
        spend: {
          fuelSpend: Math.round(fuelSpend * 100) / 100,
          maintenanceSpend: Math.round(maintenanceSpend * 100) / 100,
          repairSpend: Math.round(repairSpend * 100) / 100,
          totalSpend: Math.round(totalSpend * 100) / 100,
          budget,
          variance: budget !== null ? Math.round((budget - totalSpend) * 100) / 100 : null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/cost-centres/:id
// ---------------------------------------------------------------------------
router.patch('/:id', ccWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const existing = await prisma.costCentre.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!existing) throw new AppError(404, 'Cost centre not found');

    const { name, code, description, budget, budgetPeriod, parentId, isActive } = req.body as {
      name?: string;
      code?: string;
      description?: string;
      budget?: number | null;
      budgetPeriod?: string | null;
      parentId?: string | null;
      isActive?: boolean;
    };

    const updated = await prisma.costCentre.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(code !== undefined ? { code: code.trim().toUpperCase() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(budget !== undefined ? { budget } : {}),
        ...(budgetPeriod !== undefined ? { budgetPeriod } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    await logAction({
      operatorId,
      userId,
      action: 'update',
      entityType: 'cost_centre',
      entityId: id,
      metadata: req.body as Record<string, unknown>,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/cost-centres/:id — soft delete
// ---------------------------------------------------------------------------
router.delete('/:id', ccWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const cc = await prisma.costCentre.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        _count: { select: { vehicles: { where: { deletedAt: null } }, fleets: { where: { deletedAt: null } } } },
      },
    });

    if (!cc) throw new AppError(404, 'Cost centre not found');

    if (cc._count.vehicles > 0 || cc._count.fleets > 0) {
      throw new AppError(
        409,
        `Cannot delete: ${cc._count.vehicles} vehicles and ${cc._count.fleets} fleets are assigned. Reassign them first.`,
      );
    }

    await prisma.costCentre.update({ where: { id }, data: { deletedAt: new Date() } });

    await logAction({
      operatorId,
      userId,
      action: 'delete',
      entityType: 'cost_centre',
      entityId: id,
    });

    res.json({ success: true, data: { message: 'Cost centre deleted' } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/cost-centres/:id/transactions
// ---------------------------------------------------------------------------
router.get('/:id/transactions', ccReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { id } = req.params as { id: string };
    const { page = '1', limit = '50' } = req.query as Record<string, string>;

    const cc = await prisma.costCentre.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!cc) throw new AppError(404, 'Cost centre not found');

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Join through Vehicle — FuelTransaction doesn't have costCentreId directly
    const vehicleIds = (await prisma.vehicle.findMany({ where: { costCentreId: id, deletedAt: null }, select: { id: true } })).map((v) => v.id);

    const txWhere = { vehicleId: { in: vehicleIds } };

    const [transactions, total] = await prisma.$transaction([
      prisma.fuelTransaction.findMany({
        where: txWhere,
        include: {
          vehicle: { select: { registrationNumber: true, make: true, model: true } },
          driver: { select: { firstName: true, lastName: true } },
        },
        orderBy: { transactionDate: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.fuelTransaction.count({ where: txWhere }),
    ]);

    res.json({
      success: true,
      data: transactions,
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
