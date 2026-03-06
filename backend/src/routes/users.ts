import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { AppError } from '../middleware/errorHandler';
import { auditLog } from '../middleware/auditMiddleware';

const router = Router();

// All user management routes require authentication and admin-level role
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN));

// Fields selected on every user read — passwordHash is deliberately excluded
const USER_SELECT = {
  id: true,
  operatorId: true,
  email: true,
  role: true,
  firstName: true,
  lastName: true,
  mobileNumber: true,
  isActive: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

// ─── GET /api/v1/users ──────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const search    = req.query.search   as string | undefined;
  const role      = req.query.role     as string | undefined;
  const isActive  = req.query.isActive as string | undefined;
  const cursor    = req.query.cursor   as string | undefined;
  const take      = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 100);

  const where: Prisma.UserWhereInput = {
    ...(operatorId ? { operatorId } : {}),
    deletedAt: null,
    ...(role ? { role } : {}),
    ...(isActive !== undefined
      ? { isActive: isActive === 'true' }
      : {}),
    ...(search
      ? {
          OR: [
            { firstName:    { contains: search, mode: 'insensitive' } },
            { lastName:     { contains: search, mode: 'insensitive' } },
            { email:        { contains: search, mode: 'insensitive' } },
            { mobileNumber: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: USER_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const nextCursor = users.length === take ? users[users.length - 1].id : null;
  res.json(ok(users, { total, nextCursor }));
});

// ─── POST /api/v1/users ───────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req) ?? req.user!.operatorId!;

  const body = req.body as {
    firstName:     string;
    lastName:      string;
    email:         string;
    password:      string;
    role?:         string;
    mobileNumber?: string;
  };

  // Required field validation
  if (!body.firstName || !body.lastName || !body.email || !body.password) {
    res.status(400).json(fail('firstName, lastName, email, and password are required'));
    return;
  }

  if (body.password.length < 8) {
    res.status(400).json(fail('Password must be at least 8 characters'));
    return;
  }

  const normalisedEmail = body.email.toLowerCase().trim();

  // Email uniqueness check
  const existing = await prisma.user.findFirst({
    where: { email: normalisedEmail, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, 'A user with this email address already exists');
  }

  const passwordHash = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      operatorId,
      email:        normalisedEmail,
      passwordHash,
      firstName:    body.firstName,
      lastName:     body.lastName,
      role:         body.role ?? ROLES.FLEET_MANAGER,
      mobileNumber: body.mobileNumber,
    },
    select: USER_SELECT,
  });

  await auditLog(
    req,
    'create',
    'user',
    user.id,
    undefined,
    `Created user ${user.firstName} ${user.lastName} (${user.email})`,
  );

  res.status(201).json(ok(user));
});

// ─── GET /api/v1/users/:id ──────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);

  const user = await prisma.user.findFirst({
    where: {
      id: req.params.id as string,
      deletedAt: null,
      ...(operatorId ? { operatorId } : {}),
    },
    select: USER_SELECT,
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  res.json(ok(user));
});

// ─── PATCH /api/v1/users/:id ────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);

  const existing = await prisma.user.findFirst({
    where: {
      id: req.params.id as string,
      deletedAt: null,
      ...(operatorId ? { operatorId } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!existing) {
    throw new AppError(404, 'User not found');
  }

  const body = req.body as Partial<{
    firstName:    string;
    lastName:     string;
    mobileNumber: string;
    role:         string;
    isActive:     boolean;
  }>;

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      ...(body.firstName    !== undefined && { firstName:    body.firstName }),
      ...(body.lastName     !== undefined && { lastName:     body.lastName }),
      ...(body.mobileNumber !== undefined && { mobileNumber: body.mobileNumber }),
      ...(body.role         !== undefined && { role:         body.role }),
      ...(body.isActive     !== undefined && { isActive:     body.isActive }),
    },
    select: USER_SELECT,
  });

  await auditLog(
    req,
    'update',
    'user',
    updated.id,
    undefined,
    `Updated user ${updated.firstName} ${updated.lastName}`,
  );

  res.json(ok(updated));
});

// ─── POST /api/v1/users/:id/reset-password ────────────────────────────
router.post('/:id/reset-password', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);

  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword) {
    res.status(400).json(fail('newPassword is required'));
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json(fail('Password must be at least 8 characters'));
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      id: req.params.id as string,
      deletedAt: null,
      ...(operatorId ? { operatorId } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await auditLog(
    req,
    'update',
    'user',
    user.id,
    undefined,
    `Admin reset password for ${user.firstName} ${user.lastName}`,
  );

  res.json(ok({ message: 'Password reset successfully' }));
});

// ─── DELETE /api/v1/users/:id ───────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);

  // Prevent self-deletion
  if (req.user!.id === req.params.id) {
    throw new AppError(400, 'You cannot delete your own account');
  }

  const existing = await prisma.user.findFirst({
    where: {
      id: req.params.id as string,
      deletedAt: null,
      ...(operatorId ? { operatorId } : {}),
    },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!existing) {
    throw new AppError(404, 'User not found');
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });

  await auditLog(
    req,
    'delete',
    'user',
    existing.id,
    undefined,
    `Deleted user ${existing.firstName} ${existing.lastName}`,
  );

  res.json(ok({ deleted: true }));
});

export default router;
