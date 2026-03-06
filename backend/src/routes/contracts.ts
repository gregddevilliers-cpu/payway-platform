import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import { logAction } from '../services/auditService';
import {
  getExpiringContracts,
  getExpiredContracts,
  getContractRenewalsDue,
  getContractSummary,
  terminateContract,
  renewContract,
  syncVehicleFields,
} from '../services/contractService';

const router = Router();

router.use(authenticate);

const contractReadAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');
const contractWriteAccess = requireRole('super_admin', 'operator_admin');

// ---------------------------------------------------------------------------
// Static routes — must be registered BEFORE /:id
// ---------------------------------------------------------------------------

// GET /api/v1/contracts/expiring
router.get('/expiring', contractReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const days = Math.min(365, Math.max(1, parseInt((req.query.days as string) ?? '30', 10)));
    const data = await getExpiringContracts(operatorId, days, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/contracts/renewals-due
router.get('/renewals-due', contractReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const data = await getContractRenewalsDue(operatorId, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/contracts/summary
router.get('/summary', contractReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const data = await getContractSummary(operatorId, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/contracts/export
router.post('/export', contractReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { status, contractType } = req.body as { status?: string; contractType?: string };

    const contracts = await prisma.vehicleContract.findMany({
      where: {
        operatorId,
        deletedAt: null,
        ...(status ? { status } : {}),
        ...(contractType ? { contractType } : {}),
      },
      include: {
        vehicle: { select: { registrationNumber: true, make: true, model: true } },
      },
      orderBy: { endDate: 'asc' },
    });

    const header = 'Vehicle Reg,Make,Model,Contract Type,Provider,Start Date,End Date,Monthly Amount (ZAR),Status\n';
    const rows = contracts.map(
      (c: any) =>
        [
          c.vehicle.registrationNumber,
          c.vehicle.make,
          c.vehicle.model,
          c.contractType,
          c.provider,
          c.startDate.toISOString().split('T')[0],
          c.endDate.toISOString().split('T')[0],
          c.monthlyAmount !== null ? Number(c.monthlyAmount).toFixed(2) : '',
          c.status,
        ]
          .map((v) => `"${v}"`)
          .join(','),
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="contracts-export.csv"');
    res.send(header + rows.join('\n'));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/contracts — list
// ---------------------------------------------------------------------------
router.get('/', contractReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const {
      vehicleId,
      contractType,
      status,
      provider,
      expiringDays,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const now = new Date();
    const expiryFilter = expiringDays
      ? {
          endDate: {
            gte: now,
            lte: new Date(now.getTime() + parseInt(expiringDays, 10) * 24 * 60 * 60 * 1000),
          },
        }
      : {};

    const where = {
      operatorId,
      deletedAt: null,
      ...(vehicleId ? { vehicleId } : {}),
      ...(contractType ? { contractType } : {}),
      ...(status ? { status } : {}),
      ...(provider ? { provider: { contains: provider, mode: 'insensitive' as const } } : {}),
      ...expiryFilter,
    };

    const [contracts, total] = await prisma.$transaction([
      prisma.vehicleContract.findMany({
        where,
        include: {
          vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
        },
        orderBy: { endDate: 'asc' },
        skip,
        take: limitNum,
      }),
      prisma.vehicleContract.count({ where }),
    ]);

    const contractsWithDays = contracts.map((c: any) => ({
      ...c,
      daysRemaining: Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    }));

    res.json({
      success: true,
      data: contractsWithDays,
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/contracts — create
// ---------------------------------------------------------------------------
router.post('/', contractWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const {
      vehicleId,
      contractType,
      provider,
      contractNumber,
      startDate,
      endDate,
      monthlyAmount,
      totalContractValue,
      depositPaid,
      residualValue,
      escalationRate,
      paymentDay,
      terms,
      renewalType,
      renewalNoticeDays,
      dailyKmLimit,
      monthlyKmLimit,
      totalKmLimit,
      excessKmRate,
      kmAtStart,
      notes,
    } = req.body as {
      vehicleId?: string;
      contractType?: string;
      provider?: string;
      contractNumber?: string;
      startDate?: string;
      endDate?: string;
      monthlyAmount?: number;
      totalContractValue?: number;
      depositPaid?: number;
      residualValue?: number;
      escalationRate?: number;
      paymentDay?: number;
      terms?: string;
      renewalType?: string;
      renewalNoticeDays?: number;
      dailyKmLimit?: number;
      monthlyKmLimit?: number;
      totalKmLimit?: number;
      excessKmRate?: number;
      kmAtStart?: number;
      notes?: string;
    };

    if (!vehicleId) throw new AppError(400, 'vehicleId is required');
    if (!contractType) throw new AppError(400, 'contractType is required');
    if (!provider?.trim()) throw new AppError(400, 'provider is required');
    if (!startDate) throw new AppError(400, 'startDate is required');
    if (!endDate) throw new AppError(400, 'endDate is required');

    // Verify vehicle belongs to operator
    const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, operatorId, deletedAt: null } });
    if (!vehicle) throw new AppError(404, 'Vehicle not found');

    const contract = await prisma.vehicleContract.create({
      data: {
        operatorId,
        vehicleId,
        contractType,
        provider: provider.trim(),
        contractNumber: contractNumber ?? null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        monthlyAmount: monthlyAmount ?? null,
        totalContractValue: totalContractValue ?? null,
        depositPaid: depositPaid ?? null,
        residualValue: residualValue ?? null,
        escalationRate: escalationRate ?? null,
        paymentDay: paymentDay ?? null,
        terms: terms ?? null,
        renewalType: renewalType ?? null,
        renewalNoticeDays: renewalNoticeDays ?? null,
        dailyKmLimit: dailyKmLimit ?? null,
        monthlyKmLimit: monthlyKmLimit ?? null,
        totalKmLimit: totalKmLimit ?? null,
        excessKmRate: excessKmRate ?? null,
        kmAtStart: kmAtStart ?? null,
        status: 'active',
        notes: notes ?? null,
      },
    });

    await syncVehicleFields(contract.id, prisma);

    await logAction({
      operatorId,
      userId,
      action: 'create',
      entityType: 'contract',
      entityId: contract.id,
      metadata: { vehicleId, contractType, provider },
    });

    res.status(201).json({ success: true, data: contract });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/contracts/:id
// ---------------------------------------------------------------------------
router.get('/:id', contractReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { id } = req.params as { id: string };

    const contract = await prisma.vehicleContract.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        vehicle: { select: { id: true, registrationNumber: true, make: true, model: true, year: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });

    if (!contract) throw new AppError(404, 'Contract not found');

    const now = new Date();
    const totalPaid = contract.payments
      .filter((p: any) => p.status === 'completed')
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    res.json({
      success: true,
      data: {
        ...contract,
        daysRemaining: Math.ceil((contract.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        totalPaid: Math.round(totalPaid * 100) / 100,
        remainingBalance:
          contract.totalContractValue !== null
            ? Math.round((Number(contract.totalContractValue) - totalPaid) * 100) / 100
            : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/contracts/:id
// ---------------------------------------------------------------------------
router.patch('/:id', contractWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const existing = await prisma.vehicleContract.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!existing) throw new AppError(404, 'Contract not found');

    const {
      provider,
      contractNumber,
      startDate,
      endDate,
      monthlyAmount,
      totalContractValue,
      depositPaid,
      residualValue,
      escalationRate,
      paymentDay,
      terms,
      renewalType,
      renewalNoticeDays,
      dailyKmLimit,
      monthlyKmLimit,
      totalKmLimit,
      excessKmRate,
      kmAtStart,
      notes,
      status,
    } = req.body as Record<string, unknown>;

    const updated = await prisma.vehicleContract.update({
      where: { id },
      data: {
        ...(provider !== undefined ? { provider: String(provider).trim() } : {}),
        ...(contractNumber !== undefined ? { contractNumber: contractNumber as string | null } : {}),
        ...(startDate !== undefined ? { startDate: new Date(startDate as string) } : {}),
        ...(endDate !== undefined ? { endDate: new Date(endDate as string) } : {}),
        ...(monthlyAmount !== undefined ? { monthlyAmount: monthlyAmount as number | null } : {}),
        ...(totalContractValue !== undefined ? { totalContractValue: totalContractValue as number | null } : {}),
        ...(depositPaid !== undefined ? { depositPaid: depositPaid as number | null } : {}),
        ...(residualValue !== undefined ? { residualValue: residualValue as number | null } : {}),
        ...(escalationRate !== undefined ? { escalationRate: escalationRate as number | null } : {}),
        ...(paymentDay !== undefined ? { paymentDay: paymentDay as number | null } : {}),
        ...(terms !== undefined ? { terms: terms as string | null } : {}),
        ...(renewalType !== undefined ? { renewalType: renewalType as string | null } : {}),
        ...(renewalNoticeDays !== undefined ? { renewalNoticeDays: renewalNoticeDays as number | null } : {}),
        ...(dailyKmLimit !== undefined ? { dailyKmLimit: dailyKmLimit as number | null } : {}),
        ...(monthlyKmLimit !== undefined ? { monthlyKmLimit: monthlyKmLimit as number | null } : {}),
        ...(totalKmLimit !== undefined ? { totalKmLimit: totalKmLimit as number | null } : {}),
        ...(excessKmRate !== undefined ? { excessKmRate: excessKmRate as number | null } : {}),
        ...(kmAtStart !== undefined ? { kmAtStart: kmAtStart as number | null } : {}),
        ...(notes !== undefined ? { notes: notes as string | null } : {}),
        ...(status !== undefined ? { status: status as string } : {}),
      },
    });

    await syncVehicleFields(id, prisma);

    await logAction({
      operatorId,
      userId,
      action: 'update',
      entityType: 'contract',
      entityId: id,
      metadata: req.body as Record<string, unknown>,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/contracts/:id — soft delete
// ---------------------------------------------------------------------------
router.delete('/:id', contractWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };

    const contract = await prisma.vehicleContract.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!contract) throw new AppError(404, 'Contract not found');

    await prisma.vehicleContract.update({ where: { id }, data: { deletedAt: new Date() } });

    await logAction({
      operatorId,
      userId,
      action: 'delete',
      entityType: 'contract',
      entityId: id,
    });

    res.json({ success: true, data: { message: 'Contract deleted' } });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/contracts/:id/terminate
// ---------------------------------------------------------------------------
router.post('/:id/terminate', contractWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { terminationReason } = req.body as { terminationReason?: string };
    if (!terminationReason?.trim()) throw new AppError(400, 'terminationReason is required');

    const result = await terminateContract(
      id,
      terminationReason.trim(),
      req.user!.id,
      req.user!.operatorId!,
      prisma,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/contracts/:id/renew
// ---------------------------------------------------------------------------
router.post('/:id/renew', contractWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const result = await renewContract(id, req.user!.id, req.user!.operatorId!, prisma);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/contracts/:id/payments
// ---------------------------------------------------------------------------
router.get('/:id/payments', contractReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { id } = req.params as { id: string };

    const contract = await prisma.vehicleContract.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!contract) throw new AppError(404, 'Contract not found');

    const payments = await prisma.contractPayment.findMany({
      where: { contractId: id },
      orderBy: { paymentDate: 'desc' },
    });

    const totalPaid = payments
      .filter((p: any) => p.status === 'completed')
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    res.json({
      success: true,
      data: payments,
      meta: { totalPaid: Math.round(totalPaid * 100) / 100 },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/contracts/:id/km-usage
// ---------------------------------------------------------------------------
router.get('/:id/km-usage', contractReadAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { id } = req.params as { id: string };

    const contract = await prisma.vehicleContract.findFirst({
      where: { id, operatorId, deletedAt: null },
      include: {
        vehicle: { select: { currentOdometer: true } },
      },
    });

    if (!contract) throw new AppError(404, 'Contract not found');

    const kmAtStart = contract.kmAtStart !== null ? contract.kmAtStart : null;

    if (kmAtStart === null) {
      res.json({
        success: true,
        data: {
          totalKmUsed: null,
          kmAtStart: null,
          currentOdometer: contract.vehicle.currentOdometer ?? null,
          dailyAverage: null,
          monthlyAverage: null,
          daily: null,
          monthly: null,
          total: null,
          excessKm: null,
          excessCost: null,
        },
      });
      return;
    }

    const currentKm = contract.vehicle.currentOdometer ?? 0;
    const totalKmUsed = Math.max(0, currentKm - kmAtStart);

    const now = new Date();
    const startDate = new Date(contract.startDate);
    const msElapsed = now.getTime() - startDate.getTime();
    const daysElapsed = Math.max(1, msElapsed / (1000 * 60 * 60 * 24));
    const monthsElapsed = daysElapsed / 30.44;

    const dailyAverage = Math.round((totalKmUsed / daysElapsed) * 100) / 100;
    const monthlyAverage = Math.round((totalKmUsed / monthsElapsed) * 100) / 100;

    const calcLimitStatus = (limit: number | null, used: number) => {
      if (limit === null || limit === 0) return null;
      const percentage = Math.round((used / limit) * 10000) / 100;
      let status: 'ok' | 'warning' | 'exceeded' = 'ok';
      if (percentage >= 100) status = 'exceeded';
      else if (percentage >= 80) status = 'warning';
      return { limit, used: Math.round(used * 100) / 100, percentage, status };
    };

    const daily = calcLimitStatus(contract.dailyKmLimit, dailyAverage);
    const monthly = calcLimitStatus(contract.monthlyKmLimit, monthlyAverage);
    const total = calcLimitStatus(contract.totalKmLimit, totalKmUsed);

    let excessKm = 0;
    let excessCost = 0;
    if (contract.totalKmLimit !== null && contract.excessKmRate !== null) {
      excessKm = Math.max(0, totalKmUsed - contract.totalKmLimit);
      excessCost = Math.round(excessKm * Number(contract.excessKmRate) * 100) / 100;
    }

    res.json({
      success: true,
      data: {
        totalKmUsed,
        kmAtStart,
        currentOdometer: currentKm,
        dailyAverage,
        monthlyAverage,
        daily,
        monthly,
        total,
        excessKm,
        excessCost,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/contracts/:id/payments — record a payment
// ---------------------------------------------------------------------------
router.post('/:id/payments', contractWriteAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const userId = req.user!.id;
    const { id } = req.params as { id: string };
    const { paymentDate, amount, vatAmount, paymentMethod, reference, status, notes } = req.body as {
      paymentDate?: string;
      amount?: number;
      vatAmount?: number;
      paymentMethod?: string;
      reference?: string;
      status?: string;
      notes?: string;
    };

    if (!paymentDate) throw new AppError(400, 'paymentDate is required');
    if (amount === undefined || amount <= 0) throw new AppError(400, 'amount must be a positive number');

    const contract = await prisma.vehicleContract.findFirst({ where: { id, operatorId, deletedAt: null } });
    if (!contract) throw new AppError(404, 'Contract not found');

    const payment = await prisma.contractPayment.create({
      data: {
        contractId: id,
        operatorId,
        paymentDate: new Date(paymentDate),
        amount,
        vatAmount: vatAmount ?? null,
        paymentMethod: paymentMethod ?? null,
        reference: reference ?? null,
        status: status ?? 'completed',
        notes: notes ?? null,
      },
    });

    await logAction({
      operatorId,
      userId,
      action: 'create',
      entityType: 'contract_payment',
      entityId: payment.id,
      metadata: { contractId: id, amount, paymentDate },
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
});

export default router;
