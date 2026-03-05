import type { PrismaClient } from '@prisma/client';
import { logAudit } from './auditService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OWNERSHIP_MAP: Record<string, string> = {
  lease: 'leased',
  finance: 'financed',
  rental: 'rented',
};

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Find all active contracts expiring within N days.
 */
export async function getExpiringContracts(
  operatorId: string,
  daysAhead: number,
  prisma: PrismaClient,
) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  const contracts = await prisma.vehicleContract.findMany({
    where: {
      operatorId,
      status: 'active',
      endDate: { gte: now, lte: future },
      deletedAt: null,
    },
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
    },
    orderBy: { endDate: 'asc' },
  });

  return contracts.map((c) => ({
    ...c,
    daysRemaining: Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  }));
}

/**
 * Find contracts past endDate still marked active. Auto-update status to "expired".
 */
export async function getExpiredContracts(operatorId: string, prisma: PrismaClient) {
  const now = new Date();

  const contracts = await prisma.vehicleContract.findMany({
    where: {
      operatorId,
      status: 'active',
      endDate: { lt: now },
      deletedAt: null,
    },
    include: {
      vehicle: { select: { id: true, registrationNumber: true } },
    },
  });

  if (contracts.length > 0) {
    await prisma.vehicleContract.updateMany({
      where: { id: { in: contracts.map((c) => c.id) } },
      data: { status: 'expired' },
    });
  }

  return contracts;
}

/**
 * Sum contract payments for a vehicle in a date range, grouped by contract type.
 */
export async function calculateContractCosts(
  vehicleId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
) {
  const payments = await prisma.contractPayment.findMany({
    where: {
      contract: { vehicleId },
      paymentDate: { gte: dateFrom, lte: dateTo },
      status: 'completed',
    },
    include: {
      contract: { select: { contractType: true } },
    },
  });

  let leasePayments = 0;
  let financePayments = 0;
  let insurancePayments = 0;
  let otherPayments = 0;

  for (const payment of payments) {
    const amount = Number(payment.amount);
    switch (payment.contract.contractType) {
      case 'lease':
        leasePayments += amount;
        break;
      case 'finance':
        financePayments += amount;
        break;
      case 'insurance':
        insurancePayments += amount;
        break;
      default:
        otherPayments += amount;
    }
  }

  const totalContractCost = leasePayments + financePayments + insurancePayments + otherPayments;
  return {
    leasePayments: Math.round(leasePayments * 100) / 100,
    financePayments: Math.round(financePayments * 100) / 100,
    insurancePayments: Math.round(insurancePayments * 100) / 100,
    otherPayments: Math.round(otherPayments * 100) / 100,
    totalContractCost: Math.round(totalContractCost * 100) / 100,
  };
}

/**
 * Contracts where renewal notice period falls within the next 30 days.
 */
export async function getContractRenewalsDue(operatorId: string, prisma: PrismaClient) {
  const thirtyDaysAhead = new Date();
  thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

  const contracts = await prisma.vehicleContract.findMany({
    where: {
      operatorId,
      status: 'active',
      renewalType: { not: 'fixed_term' },
      renewalNoticeDays: { not: null },
      deletedAt: null,
    },
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
    },
  });

  return contracts.filter((c) => {
    if (!c.renewalNoticeDays) return false;
    const noticeDate = new Date(c.endDate);
    noticeDate.setDate(noticeDate.getDate() - c.renewalNoticeDays);
    return noticeDate <= thirtyDaysAhead;
  });
}

/**
 * Sum of remaining monthly payments across all active contracts.
 */
export async function getTotalContractLiabilities(operatorId: string, prisma: PrismaClient) {
  const now = new Date();

  const contracts = await prisma.vehicleContract.findMany({
    where: {
      operatorId,
      status: 'active',
      endDate: { gt: now },
      monthlyAmount: { not: null },
      deletedAt: null,
    },
    select: { id: true, endDate: true, monthlyAmount: true, contractType: true },
  });

  let totalLiability = 0;

  for (const contract of contracts) {
    const monthsRemaining = Math.max(
      0,
      (contract.endDate.getFullYear() - now.getFullYear()) * 12 +
        (contract.endDate.getMonth() - now.getMonth()),
    );
    totalLiability += Number(contract.monthlyAmount!) * monthsRemaining;
  }

  // Breakdown by contract type
  const byType: Record<string, number> = {};
  for (const contract of contracts) {
    const months = Math.max(
      0,
      (contract.endDate.getFullYear() - now.getFullYear()) * 12 +
        (contract.endDate.getMonth() - now.getMonth()),
    );
    const value = Number(contract.monthlyAmount!) * months;
    byType[contract.contractType] = (byType[contract.contractType] ?? 0) + value;
  }

  return {
    totalLiability: Math.round(totalLiability * 100) / 100,
    activeContracts: contracts.length,
    byType: Object.fromEntries(
      Object.entries(byType).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
  };
}

/**
 * Sync Vehicle quick-reference fields from the contract.
 * Call after contract create/update.
 */
export async function syncVehicleFields(contractId: string, prisma: PrismaClient) {
  const contract = await prisma.vehicleContract.findFirst({
    where: { id: contractId, deletedAt: null },
    select: { vehicleId: true, contractType: true, endDate: true },
  });

  if (!contract) return;

  const ownershipType = OWNERSHIP_MAP[contract.contractType];

  await prisma.vehicle.update({
    where: { id: contract.vehicleId },
    data: {
      ...(ownershipType ? { ownershipType } : {}),
      ...(contract.contractType === 'lease' ? { leaseExpiry: contract.endDate } : {}),
    },
  });
}

/**
 * Get fleet-wide contract summary: counts by type, monthly obligations, liabilities.
 */
export async function getContractSummary(operatorId: string, prisma: PrismaClient) {
  const now = new Date();

  const [activeContracts, countByType, expiring30, liabilities] = await Promise.all([
    prisma.vehicleContract.count({
      where: { operatorId, status: 'active', deletedAt: null },
    }),
    prisma.vehicleContract.groupBy({
      by: ['contractType'],
      where: { operatorId, status: 'active', deletedAt: null },
      _count: { id: true },
      _sum: { monthlyAmount: true },
    }),
    prisma.vehicleContract.count({
      where: {
        operatorId,
        status: 'active',
        endDate: {
          gte: now,
          lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
        deletedAt: null,
      },
    }),
    getTotalContractLiabilities(operatorId, prisma),
  ]);

  const totalMonthlyObligations = countByType.reduce(
    (sum, r) => sum + Number(r._sum.monthlyAmount ?? 0),
    0,
  );

  return {
    activeContracts,
    totalMonthlyObligations: Math.round(totalMonthlyObligations * 100) / 100,
    expiringWithin30Days: expiring30,
    totalRemainingLiabilities: liabilities.totalLiability,
    byType: Object.fromEntries(
      countByType.map((r) => [
        r.contractType,
        {
          count: r._count.id,
          monthlyAmount: Math.round(Number(r._sum.monthlyAmount ?? 0) * 100) / 100,
        },
      ]),
    ),
  };
}

/**
 * Terminate a contract early.
 */
export async function terminateContract(
  contractId: string,
  terminationReason: string,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const contract = await prisma.vehicleContract.findFirst({
    where: { id: contractId, operatorId, deletedAt: null },
  });
  if (!contract) throw new Error('Contract not found');
  if (contract.status === 'terminated') throw new Error('Contract is already terminated');

  const updated = await prisma.vehicleContract.update({
    where: { id: contractId },
    data: {
      status: 'terminated',
      terminationReason,
      terminationDate: new Date(),
    },
  });

  await logAudit(
    {
      operatorId,
      userId,
      action: 'TERMINATE_CONTRACT',
      entityType: 'VehicleContract',
      entityId: contractId,
      changes: { terminationReason, status: 'terminated' },
    },
    prisma,
  );

  return updated;
}

/**
 * Renew a contract — creates a new contract with start = old end + 1 day.
 */
export async function renewContract(
  contractId: string,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const old = await prisma.vehicleContract.findFirst({
    where: { id: contractId, operatorId, deletedAt: null },
  });
  if (!old) throw new Error('Contract not found');
  if (!['active', 'expiring'].includes(old.status)) {
    throw new Error(`Cannot renew a contract with status "${old.status}"`);
  }

  const newStart = new Date(old.endDate);
  newStart.setDate(newStart.getDate() + 1);

  // Calculate same duration
  const durationMs = old.endDate.getTime() - old.startDate.getTime();
  const newEnd = new Date(newStart.getTime() + durationMs);

  const newContract = await prisma.$transaction(async (tx) => {
    await tx.vehicleContract.update({
      where: { id: contractId },
      data: { status: 'renewed' },
    });

    const created = await tx.vehicleContract.create({
      data: {
        operatorId,
        vehicleId: old.vehicleId,
        contractType: old.contractType,
        provider: old.provider,
        contractNumber: old.contractNumber,
        startDate: newStart,
        endDate: newEnd,
        monthlyAmount: old.monthlyAmount,
        totalContractValue: old.totalContractValue,
        depositPaid: null,
        residualValue: old.residualValue,
        escalationRate: old.escalationRate,
        paymentDay: old.paymentDay,
        terms: old.terms,
        renewalType: old.renewalType,
        renewalNoticeDays: old.renewalNoticeDays,
        status: 'active',
        notes: `Renewed from contract ${contractId}`,
      },
    });

    return created;
  });

  await logAudit(
    {
      operatorId,
      userId,
      action: 'RENEW_CONTRACT',
      entityType: 'VehicleContract',
      entityId: contractId,
      changes: { newContractId: newContract.id },
    },
    prisma,
  );

  await syncVehicleFields(newContract.id, prisma);

  return newContract;
}
