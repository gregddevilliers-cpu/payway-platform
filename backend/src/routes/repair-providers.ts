import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope, requireOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── GET /api/v1/repair-providers ────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const take = Math.min(parseInt((req.query.limit as string) ?? '25', 10), 100);

  const where: Prisma.RepairProviderWhereInput = {
    ...(operatorId ? { operatorId } : {}),
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { contactPerson: { contains: search } },
          ],
        }
      : {}),
  };

  const [total, providers] = await Promise.all([
    prisma.repairProvider.count({ where }),
    prisma.repairProvider.findMany({
      where,
      include: { _count: { select: { repairJobs: true } } },
      orderBy: { name: 'asc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const nextCursor = providers.length === take ? providers[providers.length - 1]?.id ?? null : null;
  res.json(ok(providers.map((p) => ({ ...p, repairCount: p._count.repairJobs })), { total, nextCursor }));
});

// ─── POST /api/v1/repair-providers ───────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = requireOperatorScope(req);
  if (!operatorId) { res.status(403).json(fail('operatorId is required')); return; }
  const body = req.body as {
    name: string;
    contactPhone: string;
    contactPerson?: string;
    contactEmail?: string;
    address?: string;
    specialisations?: string[];
  };

  if (!body.name || !body.contactPhone) {
    res.status(400).json(fail('name and contactPhone are required'));
    return;
  }

  const provider = await prisma.repairProvider.create({
    data: {
      operatorId,
      name: body.name,
      contactPhone: body.contactPhone,
      contactPerson: body.contactPerson,
      contactEmail: body.contactEmail,
      address: body.address,
      specialisations: JSON.stringify(body.specialisations ?? []),
    },
  });

  await auditLog(req, 'create', 'repair_provider', provider.id, undefined, `Created repair provider ${body.name}`);
  res.status(201).json(ok(provider));
});

// ─── GET /api/v1/repair-providers/:id ────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.RepairProviderWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const provider = await prisma.repairProvider.findFirst({
    where,
    include: {
      _count: { select: { repairJobs: true } },
    },
  });

  if (!provider) { res.status(404).json(fail('Repair provider not found')); return; }

  res.json(ok({ ...provider, repairCount: provider._count.repairJobs }));
});

// ─── PATCH /api/v1/repair-providers/:id ──────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.RepairProviderWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.repairProvider.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Repair provider not found')); return; }

  const body = req.body as Partial<{
    name: string; contactPhone: string; contactPerson: string; contactEmail: string;
    address: string; specialisations: string[]; rating: number; status: string;
  }>;

  const updated = await prisma.repairProvider.update({
    where: { id: existing.id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.contactPhone !== undefined && { contactPhone: body.contactPhone }),
      ...(body.contactPerson !== undefined && { contactPerson: body.contactPerson }),
      ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.specialisations !== undefined && { specialisations: JSON.stringify(body.specialisations) }),
      ...(body.rating !== undefined && { rating: body.rating }),
      ...(body.status !== undefined && { status: body.status }),
    },
  });

  await auditLog(req, 'update', 'repair_provider', updated.id, undefined, `Updated repair provider ${updated.name}`);
  res.json(ok(updated));
});

// ─── DELETE /api/v1/repair-providers/:id ─────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.RepairProviderWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const existing = await prisma.repairProvider.findFirst({ where });
  if (!existing) { res.status(404).json(fail('Repair provider not found')); return; }

  await prisma.repairProvider.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  await auditLog(req, 'delete', 'repair_provider', existing.id, undefined, `Deleted repair provider ${existing.name}`);
  res.json(ok({ deleted: true }));
});

export default router;
