import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import { logAction } from '../services/auditService';

const router = Router();

router.use(authenticate);

const insurerReadAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');
const insurerWriteAccess = requireRole('super_admin', 'operator_admin');

// ---------------------------------------------------------------------------
// GET /api/v1/insurers — list with cursor-based pagination, search, status filter
// ---------------------------------------------------------------------------
router.get('/', insurerReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { search, status, cursor, limit = '50' } = req.query as Record<string, string>;

    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));

    const where = {
      operatorId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search
        ? { companyName: { contains: search } }
        : {}),
    };

    const insurers = await prisma.insurer.findMany({
      where,
      include: {
        _count: { select: { vehicles: true } },
      },
      orderBy: { companyName: 'asc' },
      take: limitNum + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = insurers.length > limitNum;
    if (hasMore) insurers.pop();

    const nextCursor = hasMore ? insurers[insurers.length - 1]?.id : undefined;

    res.json({
      success: true,
      data: insurers,
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
// POST /api/v1/insurers — create insurer
// ---------------------------------------------------------------------------
router.post('/', insurerWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const {
      companyName,
      claimsPhone,
      claimsEmail,
      generalPhone,
      brokerName,
      brokerPhone,
      brokerEmail,
      notes,
      status,
    } = req.body as {
      companyName?: string;
      claimsPhone?: string;
      claimsEmail?: string;
      generalPhone?: string;
      brokerName?: string;
      brokerPhone?: string;
      brokerEmail?: string;
      notes?: string;
      status?: string;
    };

    if (!companyName?.trim()) throw new AppError(400, 'companyName is required');

    const insurer = await prisma.insurer.create({
      data: {
        operatorId,
        companyName: companyName.trim(),
        claimsPhone: claimsPhone ?? null,
        claimsEmail: claimsEmail ?? null,
        generalPhone: generalPhone ?? null,
        brokerName: brokerName ?? null,
        brokerPhone: brokerPhone ?? null,
        brokerEmail: brokerEmail ?? null,
        notes: notes ?? null,
        status: status ?? 'active',
      },
    });

    await logAction({
      operatorId,
      userId,
      action: 'create',
      entityType: 'insurer',
      entityId: insurer.id,
      metadata: { companyName },
    });

    res.status(201).json({ success: true, data: insurer });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/insurers/:id — detail
// ---------------------------------------------------------------------------
router.get('/:id', insurerReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { id } = req.params as { id: string };

    const insurer = await prisma.insurer.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        _count: { select: { vehicles: true } },
      },
    });

    if (!insurer) throw new AppError(404, 'Insurer not found');

    res.json({ success: true, data: insurer });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/insurers/:id — update
// ---------------------------------------------------------------------------
router.patch('/:id', insurerWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const existing = await prisma.insurer.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!existing) throw new AppError(404, 'Insurer not found');

    const {
      companyName,
      claimsPhone,
      claimsEmail,
      generalPhone,
      brokerName,
      brokerPhone,
      brokerEmail,
      notes,
      status,
    } = req.body as {
      companyName?: string;
      claimsPhone?: string | null;
      claimsEmail?: string | null;
      generalPhone?: string | null;
      brokerName?: string | null;
      brokerPhone?: string | null;
      brokerEmail?: string | null;
      notes?: string | null;
      status?: string;
    };

    const updated = await prisma.insurer.update({
      where: { id },
      data: {
        ...(companyName !== undefined ? { companyName: companyName.trim() } : {}),
        ...(claimsPhone !== undefined ? { claimsPhone } : {}),
        ...(claimsEmail !== undefined ? { claimsEmail } : {}),
        ...(generalPhone !== undefined ? { generalPhone } : {}),
        ...(brokerName !== undefined ? { brokerName } : {}),
        ...(brokerPhone !== undefined ? { brokerPhone } : {}),
        ...(brokerEmail !== undefined ? { brokerEmail } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    });

    await logAction({
      operatorId,
      userId,
      action: 'update',
      entityType: 'insurer',
      entityId: id,
      metadata: req.body as Record<string, unknown>,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/insurers/:id — soft delete
// ---------------------------------------------------------------------------
router.delete('/:id', insurerWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const insurer = await prisma.insurer.findFirst({
      where: { id, operatorId, deletedAt: null },
    });

    if (!insurer) throw new AppError(404, 'Insurer not found');

    await prisma.insurer.update({ where: { id }, data: { deletedAt: new Date() } });

    await logAction({
      operatorId,
      userId,
      action: 'delete',
      entityType: 'insurer',
      entityId: id,
    });

    res.json({ success: true, data: { message: 'Insurer deleted' } });
  } catch (err) {
    next(err);
  }
});

export default router;
