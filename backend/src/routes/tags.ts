import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  assignTag,
  unassignTag,
  blockTag,
  unblockTag,
  reportLost,
  replaceTag,
  transferTag,
  decommissionTag,
  checkTagExpiry,
  getTagSummary,
  BLOCKED_REASONS,
  type BlockedReason,
} from '../services/tagService';

const router = Router();

// All tag routes require authentication
router.use(authenticate);

// Drivers have no access to tag management
const tagAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');

// ---------------------------------------------------------------------------
// GET /api/v1/tags/summary
// ---------------------------------------------------------------------------
router.get('/summary', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const summary = await getTagSummary(operatorId, prisma);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/tags
// ---------------------------------------------------------------------------
router.get('/', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const {
      status,
      vehicleId,
      search,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where = {
      operatorId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(search ? { tagNumber: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [tags, total] = await prisma.$transaction([
      prisma.tag.findMany({
        where,
        include: {
          vehicle: {
            select: { id: true, registrationNumber: true, make: true, model: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.tag.count({ where }),
    ]);

    res.json({
      success: true,
      data: tags,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/tags — create tag in inventory
// ---------------------------------------------------------------------------
router.post('/', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const userId = req.user!.userId;
    const { tagNumber, expiryDate, notes } = req.body as {
      tagNumber?: string;
      expiryDate?: string;
      notes?: string;
    };

    if (!tagNumber?.trim()) {
      throw new AppError(400, 'tagNumber is required');
    }

    const tag = await prisma.tag.create({
      data: {
        operatorId,
        tagNumber: tagNumber.trim().toUpperCase(),
        status: 'unassigned',
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        notes: notes ?? null,
      },
    });

    // Create initial history entry
    await prisma.tagHistory.create({
      data: {
        tagId: tag.id,
        operatorId,
        action: 'created',
        previousStatus: null,
        newStatus: 'unassigned',
        performedBy: userId,
      },
    });

    res.status(201).json({ success: true, data: tag });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/tags/:id
// ---------------------------------------------------------------------------
router.get('/:id', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const { id } = req.params as { id: string };

    const tag = await prisma.tag.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        vehicle: {
          select: { id: true, registrationNumber: true, make: true, model: true, fuelType: true },
        },
        histories: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!tag) throw new AppError(404, 'Tag not found');

    res.json({ success: true, data: tag });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/tags/:id — update notes / expiryDate only
// ---------------------------------------------------------------------------
router.patch('/:id', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const { id } = req.params as { id: string };
    const { notes, expiryDate } = req.body as { notes?: string; expiryDate?: string };

    const existing = await prisma.tag.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!existing) throw new AppError(404, 'Tag not found');

    const updated = await prisma.tag.update({
      where: { id },
      data: {
        ...(notes !== undefined ? { notes } : {}),
        ...(expiryDate !== undefined ? { expiryDate: expiryDate ? new Date(expiryDate) : null } : {}),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/tags/:id — soft delete (only unassigned or decommissioned)
// ---------------------------------------------------------------------------
router.delete('/:id', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const { id } = req.params as { id: string };

    const tag = await prisma.tag.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!tag) throw new AppError(404, 'Tag not found');
    if (!['unassigned', 'decommissioned'].includes(tag.status)) {
      throw new AppError(400, 'Only unassigned or decommissioned tags can be deleted');
    }

    await prisma.tag.update({ where: { id }, data: { deletedAt: new Date() } });

    res.json({ success: true, data: { message: 'Tag deleted' } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Action endpoints
// ---------------------------------------------------------------------------

// POST /api/v1/tags/:id/assign
router.post('/:id/assign', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { vehicleId } = req.body as { vehicleId?: string };
    if (!vehicleId) throw new AppError(400, 'vehicleId is required');
    const result = await assignTag(id, vehicleId, req.user!.userId, req.user!.operatorId, prisma);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tags/:id/unassign
router.post('/:id/unassign', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };
    const result = await unassignTag(id, req.user!.userId, req.user!.operatorId, reason, prisma);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tags/:id/block
router.post('/:id/block', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };
    if (!reason) throw new AppError(400, `reason is required. Must be one of: ${BLOCKED_REASONS.join(', ')}`);
    const result = await blockTag(id, reason as BlockedReason, req.user!.userId, req.user!.operatorId, prisma);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tags/:id/unblock
router.post('/:id/unblock', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const result = await unblockTag(id, req.user!.userId, req.user!.operatorId, prisma);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tags/:id/report-lost
router.post('/:id/report-lost', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const result = await reportLost(id, req.user!.userId, req.user!.operatorId, prisma);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tags/:id/replace
router.post('/:id/replace', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { newTagId } = req.body as { newTagId?: string };
    if (!newTagId) throw new AppError(400, 'newTagId is required');
    const result = await replaceTag(id, newTagId, req.user!.userId, req.user!.operatorId, prisma);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tags/:id/transfer
router.post('/:id/transfer', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { toVehicleId } = req.body as { toVehicleId?: string };
    if (!toVehicleId) throw new AppError(400, 'toVehicleId is required');

    const tag = await prisma.tag.findFirst({
      where: { id, operatorId: req.user!.operatorId, deletedAt: null },
    });
    if (!tag) throw new AppError(404, 'Tag not found');
    if (!tag.vehicleId) throw new AppError(400, 'Tag is not assigned to any vehicle');

    const result = await transferTag(id, tag.vehicleId, toVehicleId, req.user!.userId, req.user!.operatorId, prisma);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tags/:id/decommission
router.post('/:id/decommission', requireRole('super_admin', 'operator_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const result = await decommissionTag(id, req.user!.userId, req.user!.operatorId, prisma);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/tags/:id/history
// ---------------------------------------------------------------------------
router.get('/:id/history', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const { id } = req.params as { id: string };

    const tag = await prisma.tag.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!tag) throw new AppError(404, 'Tag not found');

    const history = await prisma.tagHistory.findMany({
      where: { tagId: id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/tags/bulk-action
// ---------------------------------------------------------------------------
router.post('/bulk-action', requireRole('super_admin', 'operator_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const userId = req.user!.userId;
    const { ids, action, params } = req.body as {
      ids?: string[];
      action?: string;
      params?: { reason?: string };
    };

    if (!ids?.length) throw new AppError(400, 'ids array is required');
    if (!['block', 'decommission'].includes(action ?? '')) {
      throw new AppError(400, 'action must be "block" or "decommission"');
    }

    const results = [];
    const errors = [];

    for (const tagId of ids) {
      try {
        if (action === 'block') {
          const reason = (params?.reason ?? 'operator_request') as BlockedReason;
          results.push(await blockTag(tagId, reason, userId, operatorId, prisma));
        } else if (action === 'decommission') {
          results.push(await decommissionTag(tagId, userId, operatorId, prisma));
        }
      } catch (err) {
        errors.push({ tagId, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.json({
      success: true,
      data: { processed: results.length, failed: errors.length, errors },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/tags/export — CSV export
// ---------------------------------------------------------------------------
router.post('/export', tagAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId;
    const { status, vehicleId, search } = req.body as Record<string, string>;

    const tags = await prisma.tag.findMany({
      where: {
        operatorId,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(vehicleId ? { vehicleId } : {}),
        ...(search ? { tagNumber: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      include: {
        vehicle: { select: { registrationNumber: true, make: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'Tag Number,Vehicle Reg,Make,Model,Status,Issued Date,Expiry Date,Last Used,Blocked Reason\n';
    const rows = tags
      .map((t) =>
        [
          t.tagNumber,
          t.vehicle?.registrationNumber ?? '',
          t.vehicle?.make ?? '',
          t.vehicle?.model ?? '',
          t.status,
          t.issuedDate?.toISOString().split('T')[0] ?? '',
          t.expiryDate?.toISOString().split('T')[0] ?? '',
          t.lastUsedAt?.toISOString() ?? '',
          t.blockedReason ?? '',
        ]
          .map((v) => `"${v}"`)
          .join(','),
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tags-export.csv"');
    res.send(header + rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/tags/check-expiry — manual trigger (super admin only)
// ---------------------------------------------------------------------------
router.post('/check-expiry', requireRole('super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.role === 'super_admin' ? null : req.user!.operatorId;
    const count = await checkTagExpiry(operatorId, prisma);
    res.json({ success: true, data: { expiredCount: count } });
  } catch (err) {
    next(err);
  }
});

export default router;
