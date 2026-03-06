import type { PrismaClient } from '@prisma/client';
import { VAT_CONFIG } from '../config/vatConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

/**
 * Calculate VAT for a fuel transaction (VAT-inclusive total — standard at SA pumps).
 */
export function calculateTransactionVat(totalCost: number) {
  return VAT_CONFIG.calculateVatInclusive(totalCost);
}

/**
 * Aggregate VAT across all transaction types for a period.
 */
export async function getVatSummary(
  operatorId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
) {
  const [fuelAgg, maintenanceAgg, repairAgg]: any[] = await Promise.all([
    (prisma.fuelTransaction.aggregate as any)({
      where: { operatorId, transactionDate: { gte: dateFrom, lte: dateTo } },
      _sum: { totalAmount: true, amountExclVat: true, vatAmount: true },
      _count: { _all: true },
    }),
    (prisma.maintenanceRecord.aggregate as any)({
      where: { operatorId, serviceDate: { gte: dateFrom, lte: dateTo }, deletedAt: null },
      _sum: { cost: true, costExclVat: true, vatAmount: true, costInclVat: true },
      _count: { _all: true },
    }),
    (prisma.repairJob.aggregate as any)({
      where: { operatorId, createdAt: { gte: dateFrom, lte: dateTo }, deletedAt: null },
      _sum: { totalCost: true, vatAmount: true },
      _count: { _all: true },
    }),
  ]);

  const fuelInclVat = Number(fuelAgg._sum?.totalAmount ?? 0);
  const fuelVat = Number(fuelAgg._sum?.vatAmount ?? 0);
  const fuelExclVat = fuelVat > 0
    ? Number(fuelAgg._sum?.amountExclVat ?? 0)
    : r2(fuelInclVat / (1 + VAT_CONFIG.rate));

  const maintenanceInclVat = Number(fuelAgg._sum?.totalAmount !== null
    ? (maintenanceAgg._sum?.costInclVat ?? maintenanceAgg._sum?.cost ?? 0)
    : 0);
  const maintenanceVat = Number(maintenanceAgg._sum?.vatAmount ?? 0);
  const maintenanceExclVat = Number(maintenanceAgg._sum?.costExclVat ?? 0) ||
    r2(maintenanceInclVat - maintenanceVat);

  const repairInclVat = Number(repairAgg._sum?.totalCost ?? 0);
  const repairVat = Number(repairAgg._sum?.vatAmount ?? 0);
  const repairExclVat = r2(repairInclVat - repairVat);

  // Recalculate maintenance properly
  const mainInclVat2 = Number(maintenanceAgg._sum?.costInclVat ?? maintenanceAgg._sum?.cost ?? 0);
  const mainVat2 = Number(maintenanceAgg._sum?.vatAmount ?? 0);
  const mainExclVat2 = Number(maintenanceAgg._sum?.costExclVat ?? 0) || r2(mainInclVat2 - mainVat2);

  return {
    fuelVat: {
      totalExclVat: r2(fuelExclVat),
      totalVat: r2(fuelVat),
      totalInclVat: r2(fuelInclVat),
      transactionCount: fuelAgg._count?._all ?? 0,
    },
    maintenanceVat: {
      totalExclVat: r2(mainExclVat2),
      totalVat: r2(mainVat2),
      totalInclVat: r2(mainInclVat2),
      recordCount: maintenanceAgg._count?._all ?? 0,
    },
    repairVat: {
      totalExclVat: r2(repairExclVat),
      totalVat: r2(repairVat),
      totalInclVat: r2(repairInclVat),
      jobCount: repairAgg._count?._all ?? 0,
    },
    combined: {
      totalExclVat: r2(fuelExclVat + mainExclVat2 + repairExclVat),
      totalVat: r2(fuelVat + mainVat2 + repairVat),
      totalInclVat: r2(fuelInclVat + mainInclVat2 + repairInclVat),
    },
  };
}

/**
 * VAT breakdown grouped by fleet.
 */
export async function getVatByFleet(
  operatorId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
) {
  const fleets = await prisma.fleet.findMany({
    where: { operatorId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const [fuelByFleet, maintenanceByFleet, repairByFleet]: any[] = await Promise.all([
    (prisma.fuelTransaction.groupBy as any)({
      by: ['fleetId'],
      where: { operatorId, transactionDate: { gte: dateFrom, lte: dateTo } },
      _sum: { totalAmount: true, vatAmount: true, amountExclVat: true },
    }),
    (prisma.maintenanceRecord.groupBy as any)({
      by: ['fleetId'],
      where: { operatorId, serviceDate: { gte: dateFrom, lte: dateTo }, deletedAt: null },
      _sum: { cost: true, vatAmount: true, costExclVat: true, costInclVat: true },
    }),
    (prisma.repairJob.groupBy as any)({
      by: ['fleetId'],
      where: { operatorId, createdAt: { gte: dateFrom, lte: dateTo }, deletedAt: null },
      _sum: { totalCost: true, vatAmount: true },
    }),
  ]);

  const fuelMap = new Map(fuelByFleet.map((r: any) => [r.fleetId, r._sum]));
  const maintenanceMap = new Map(maintenanceByFleet.map((r: any) => [r.fleetId, r._sum]));
  const repairMap = new Map(repairByFleet.map((r: any) => [r.fleetId, r._sum]));

  return fleets.map((fleet) => {
    const fuel: any = fuelMap.get(fleet.id);
    const maint: any = maintenanceMap.get(fleet.id);
    const repair: any = repairMap.get(fleet.id);

    const fuelInclVat = Number(fuel?.totalAmount ?? 0);
    const fuelVat = Number(fuel?.vatAmount ?? 0);
    const fuelExclVat = Number(fuel?.amountExclVat ?? 0) || r2(fuelInclVat - fuelVat);

    const maintInclVat = Number(maint?.costInclVat ?? maint?.cost ?? 0);
    const maintVat = Number(maint?.vatAmount ?? 0);
    const maintExclVat = Number(maint?.costExclVat ?? 0) || r2(maintInclVat - maintVat);

    const repairInclVat = Number(repair?.totalCost ?? 0);
    const repairVat = Number(repair?.vatAmount ?? 0);
    const repairExclVat = r2(repairInclVat - repairVat);

    return {
      fleetId: fleet.id,
      fleetName: fleet.name,
      fuel: { exclVat: r2(fuelExclVat), vatAmount: r2(fuelVat), inclVat: r2(fuelInclVat) },
      maintenance: { exclVat: r2(maintExclVat), vatAmount: r2(maintVat), inclVat: r2(maintInclVat) },
      repair: { exclVat: r2(repairExclVat), vatAmount: r2(repairVat), inclVat: r2(repairInclVat) },
      total: {
        exclVat: r2(fuelExclVat + maintExclVat + repairExclVat),
        vatAmount: r2(fuelVat + maintVat + repairVat),
        inclVat: r2(fuelInclVat + maintInclVat + repairInclVat),
      },
    };
  });
}

/**
 * VAT breakdown grouped by cost centre.
 */
export async function getVatByCostCentre(
  operatorId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
) {
  const costCentres = await prisma.costCentre.findMany({
    where: { operatorId, deletedAt: null },
    select: { id: true, name: true, code: true },
    orderBy: { name: 'asc' },
  });

  const [fuelByCC, maintenanceByCC, repairByCC]: any[] = await Promise.all([
    (prisma.fuelTransaction.groupBy as any)({
      by: ['costCentreId'],
      where: { operatorId, transactionDate: { gte: dateFrom, lte: dateTo }, costCentreId: { not: null } },
      _sum: { totalAmount: true, vatAmount: true, amountExclVat: true },
    }),
    (prisma.maintenanceRecord.groupBy as any)({
      by: ['costCentreId'],
      where: { operatorId, serviceDate: { gte: dateFrom, lte: dateTo }, deletedAt: null, costCentreId: { not: null } },
      _sum: { cost: true, vatAmount: true, costExclVat: true, costInclVat: true },
    }),
    (prisma.repairJob.groupBy as any)({
      by: ['costCentreId'],
      where: { operatorId, createdAt: { gte: dateFrom, lte: dateTo }, deletedAt: null, costCentreId: { not: null } },
      _sum: { totalCost: true, vatAmount: true },
    }),
  ]);

  const fuelMap = new Map(fuelByCC.map((r: any) => [r.costCentreId ?? '', r._sum]));
  const maintMap = new Map(maintenanceByCC.map((r: any) => [r.costCentreId ?? '', r._sum]));
  const repairMap = new Map(repairByCC.map((r: any) => [r.costCentreId ?? '', r._sum]));

  return costCentres.map((cc) => {
    const fuel: any = fuelMap.get(cc.id);
    const maint: any = maintMap.get(cc.id);
    const repair: any = repairMap.get(cc.id);

    const fuelInclVat = Number(fuel?.totalAmount ?? 0);
    const fuelVat = Number(fuel?.vatAmount ?? 0);
    const fuelExclVat = Number(fuel?.amountExclVat ?? 0) || r2(fuelInclVat - fuelVat);

    const maintInclVat = Number(maint?.costInclVat ?? maint?.cost ?? 0);
    const maintVat = Number(maint?.vatAmount ?? 0);
    const maintExclVat = Number(maint?.costExclVat ?? 0) || r2(maintInclVat - maintVat);

    const repairInclVat = Number(repair?.totalCost ?? 0);
    const repairVat = Number(repair?.vatAmount ?? 0);
    const repairExclVat = r2(repairInclVat - repairVat);

    return {
      costCentreId: cc.id,
      costCentreName: cc.name,
      code: cc.code,
      fuel: { exclVat: r2(fuelExclVat), vatAmount: r2(fuelVat), inclVat: r2(fuelInclVat) },
      maintenance: { exclVat: r2(maintExclVat), vatAmount: r2(maintVat), inclVat: r2(maintInclVat) },
      repair: { exclVat: r2(repairExclVat), vatAmount: r2(repairVat), inclVat: r2(repairInclVat) },
      total: {
        exclVat: r2(fuelExclVat + maintExclVat + repairExclVat),
        vatAmount: r2(fuelVat + maintVat + repairVat),
        inclVat: r2(fuelInclVat + maintInclVat + repairInclVat),
      },
    };
  });
}

/**
 * Monthly VAT totals for the last N months.
 */
export async function getMonthlyVatTrend(
  operatorId: string,
  monthsBack: number,
  prisma: PrismaClient,
) {
  const now = new Date();
  const results = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

    const [fuelAgg, maintAgg, repairAgg]: any[] = await Promise.all([
      (prisma.fuelTransaction.aggregate as any)({
        where: { operatorId, transactionDate: { gte: from, lte: to } },
        _sum: { vatAmount: true },
      }),
      (prisma.maintenanceRecord.aggregate as any)({
        where: { operatorId, serviceDate: { gte: from, lte: to }, deletedAt: null },
        _sum: { vatAmount: true },
      }),
      (prisma.repairJob.aggregate as any)({
        where: { operatorId, createdAt: { gte: from, lte: to }, deletedAt: null },
        _sum: { vatAmount: true },
      }),
    ]);

    const fuelVat = r2(Number(fuelAgg._sum?.vatAmount ?? 0));
    const maintenanceVat = r2(Number(maintAgg._sum?.vatAmount ?? 0));
    const repairVat = r2(Number(repairAgg._sum?.vatAmount ?? 0));

    results.push({
      month: from.getMonth() + 1,
      year: from.getFullYear(),
      fuelVat,
      maintenanceVat,
      repairVat,
      totalVat: r2(fuelVat + maintenanceVat + repairVat),
    });
  }

  return results;
}
