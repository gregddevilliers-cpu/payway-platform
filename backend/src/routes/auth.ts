import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { auditLog } from '../middleware/auditMiddleware';
import { ok, fail } from '../types/index';

const router = Router();

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json(fail('Email and password are required'));
    return;
  }

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), deletedAt: null },
  });

  if (!user || !user.isActive) {
    res.status(401).json(fail('Invalid credentials'));
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json(fail('Invalid credentials'));
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not set');

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      operatorId: user.operatorId,
      fleetId: null,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    secret,
    { expiresIn: '24h' },
  );

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Log login to audit trail if operatorId exists
  if (user.operatorId) {
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        operatorId: user.operatorId,
        action: 'login',
        entityType: 'user',
        entityId: user.id,
        description: `User ${user.firstName} ${user.lastName} logged in`,
        ipAddress:
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
          req.socket?.remoteAddress ??
          undefined,
        userAgent: req.headers['user-agent'] ?? undefined,
      },
    });
  }

  res.json(
    ok({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        operatorId: user.operatorId,
      },
    }),
  );
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findFirst({
    where: { id: req.user!.id, deletedAt: null },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      operatorId: true,
      mobileNumber: true,
      isActive: true,
      status: true,
      lastLoginAt: true,
    },
  });

  if (!user) {
    res.status(404).json(fail('User not found'));
    return;
  }

  res.json(ok(user));
});

// POST /api/v1/auth/change-password
router.post('/change-password', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json(fail('currentPassword and newPassword are required'));
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json(fail('New password must be at least 8 characters'));
    return;
  }

  const user = await prisma.user.findFirst({ where: { id: req.user!.id, deletedAt: null } });
  if (!user) {
    res.status(404).json(fail('User not found'));
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json(fail('Current password is incorrect'));
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  if (user.operatorId) {
    await auditLog(req, 'update', 'user', user.id, undefined, 'Password changed');
  }

  res.json(ok({ message: 'Password changed successfully' }));
});

export default router;
