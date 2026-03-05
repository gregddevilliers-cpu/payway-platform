import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BudgetEntityType = 'fleet' | 'cost_centre';

export type BudgetStatus = 'under_budget' | 'at_risk' | 'over_budget';

export interface BudgetVarianceEntry {
  entityId: string;
  entityName: string;
  budget: number;
  actualSpend: number;
  fuelSpend: number;
  maintenanceSpend: number;
  repairSpend: number;
  variance: number;
  variancePercent: number;
  status: BudgetStatus;
}

export interface BudgetAlert {
  entityType: BudgetEntityType;
  entityId: string;
  entityName: string;
  budget: number;
  currentSpend: number;
  percentConsumed: number;
  level: 'warning' | 'critical' | 'over';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBudgetStatus(actual: number, budget: number): BudgetStatus {
  if (budget <= 0) return 'under_budget';
  const pct = actual / budget;
  if (pct > 1) return 'over_budget';
  if (pct >= 0.75) return 'at_risk';
  return 'under_budget';
}

interface SpendBreakdown {
  fuel: number;
  maintenance: number;
  repair: number;
  total: number;
}

async function getActualSpend(
  entityType: BudgetEntityType,
  entityId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
): Promise<SpendBreakdown> {
  const fuelWhere =
    entityType === 'fleet'
      ? { fleetId: entityId, transactionDate: { gte: dateFrom, lte: dateTo } }
      : { costCentreId: entityId, transactionDate: { gte: dateFrom, lte: dateTo } };

  const maintWhere =
    entityType === 'fleet'
      ? { fleetId: entityId, serviceDate: { gte: dateFrom, lte: dateTo }, deletedAt: null as null }
      : { costCentreId: entityId, serviceDate: { gte: dateFrom, lte: dateTo }, deletedAt: null as null };

  const repairWhere =
    entityType === 'fleet'
      ? { fleetId: entityId, createdAt: { gte: dateFrom, lte: dateTo }, deletedAt: null as null }
      : { costCentreId: entityId, createdAt: { gte: dateFrom, lte: dateTo }, deletedAt: null as null };

  const [fuelAgg, maintAgg, repairAgg] = await Promise.all([
    prisma.fuelTransaction.aggregate({ where: fuelWhere, _sum: { totalAmount: true } }),
    prisma.maintenanceRecord.aggregate({ where: maintWhere, _sum: { cost: true } }),
    prisma.repairJob.aggregate({ where: repairWhere, _sum: { totalCost: true } }),
  ]);

  const fuel = Number(fuelAgg._sum.totalAmount ?? 0);
  const maintenance = Number(maintAgg._sum.cost ?? 0);
  const repair = Number(repairAgg._sum.totalCost ?? 0);

  return { fuel, maintenance, repair, total: fuel + maintenance + repair };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Fleet budget variance for a date range.
 */
export async function getFleetBudgetVariance(
  operatorId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
): Promise<BudgetVarianceEntry[]> {
  const fleets = await prisma.fleet.findMany({
    where: { operatorId, deletedAt: null, monthlyBudget: { not: null } },
    select: { id: true, name: true, monthlyBudget: true },
    orderBy: { name: 'asc' },
  });

  return Promise.all(
    fleets.map(async (fleet) => {
      const budget = Number(fleet.monthlyBudget!);
      const spend = await getActualSpend('fleet', fleet.id, dateFrom, dateTo, prisma);
      const variance = budget - spend.total;
      return {
        entityId: fleet.id,
        entityName: fleet.name,
        budget,
        actualSpend: Math.round(spend.total * 100) / 100,
        fuelSpend: Math.round(spend.fuel * 100) / 100,
        maintenanceSpend: Math.round(spend.maintenance * 100) / 100,
        repairSpend: Math.round(spend.repair * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        variancePercent: budget > 0 ? Math.round((variance / budget) * 10000) / 100 : 0,
        status: getBudgetStatus(spend.total, budget),
      };
    }),
  );
}

/**
 * Cost centre budget variance for a date range.
 * Adjusts budget to match the date range based on budgetPeriod.
 */
export async function getCostCentreBudgetVariance(
  operatorId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
): Promise<BudgetVarianceEntry[]> {
  const costCentres = await prisma.costCentre.findMany({
    where: { operatorId, deletedAt: null, budget: { not: null }, isActive: true },
    select: { id: true, name: true, code: true, budget: true, budgetPeriod: true },
    orderBy: { name: 'asc' },
  });

  // Calculate months in range
  const monthsInRange =
    (dateTo.getFullYear() - dateFrom.getFullYear()) * 12 +
    (dateTo.getMonth() - dateFrom.getMonth()) +
    1;

  return Promise.all(
    costCentres.map(async (cc) => {
      const rawBudget = Number(cc.budget!);

      // Scale budget to match date range
      let scaledBudget = rawBudget;
      if (cc.budgetPeriod === 'quarterly') {
        scaledBudget = (rawBudget / 3) * monthsInRange;
      } else if (cc.budgetPeriod === 'annual') {
        scaledBudget = (rawBudget / 12) * monthsInRange;
      } else {
        // monthly — scale proportionally
        scaledBudget = rawBudget * monthsInRange;
      }

      const spend = await getActualSpend('cost_centre', cc.id, dateFrom, dateTo, prisma);
      const variance = scaledBudget - spend.total;

      return {
        entityId: cc.id,
        entityName: `${cc.name} (${cc.code})`,
        budget: Math.round(scaledBudget * 100) / 100,
        actualSpend: Math.round(spend.total * 100) / 100,
        fuelSpend: Math.round(spend.fuel * 100) / 100,
        maintenanceSpend: Math.round(spend.maintenance * 100) / 100,
        repairSpend: Math.round(spend.repair * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        variancePercent: scaledBudget > 0 ? Math.round((variance / scaledBudget) * 10000) / 100 : 0,
        status: getBudgetStatus(spend.total, scaledBudget),
      };
    }),
  );
}

/**
 * Monthly budget vs actual trend for a fleet or cost centre.
 */
export async function getVarianceTrend(
  entityType: BudgetEntityType,
  entityId: string,
  monthsBack: number,
  prisma: PrismaClient,
) {
  let monthlyBudget = 0;

  if (entityType === 'fleet') {
    const fleet = await prisma.fleet.findFirst({ where: { id: entityId }, select: { monthlyBudget: true } });
    monthlyBudget = Number(fleet?.monthlyBudget ?? 0);
  } else {
    const cc = await prisma.costCentre.findFirst({ where: { id: entityId }, select: { budget: true, budgetPeriod: true } });
    if (cc?.budget) {
      const raw = Number(cc.budget);
      if (cc.budgetPeriod === 'quarterly') monthlyBudget = raw / 3;
      else if (cc.budgetPeriod === 'annual') monthlyBudget = raw / 12;
      else monthlyBudget = raw;
    }
  }

  const now = new Date();
  const results = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

    const spend = await getActualSpend(entityType, entityId, from, to, prisma);
    const variance = monthlyBudget - spend.total;

    results.push({
      month: from.getMonth() + 1,
      year: from.getFullYear(),
      budget: Math.round(monthlyBudget * 100) / 100,
      actual: Math.round(spend.total * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      variancePercent: monthlyBudget > 0 ? Math.round((variance / monthlyBudget) * 10000) / 100 : 0,
    });
  }

  return results;
}

/**
 * Current month spend forecast for a fleet or cost centre.
 */
export async function getBudgetForecast(
  entityType: BudgetEntityType,
  entityId: string,
  prisma: PrismaClient,
) {
  let budget = 0;

  if (entityType === 'fleet') {
    const fleet = await prisma.fleet.findFirst({ where: { id: entityId }, select: { monthlyBudget: true } });
    budget = Number(fleet?.monthlyBudget ?? 0);
  } else {
    const cc = await prisma.costCentre.findFirst({ where: { id: entityId }, select: { budget: true, budgetPeriod: true } });
    if (cc?.budget) {
      const raw = Number(cc.budget);
      if (cc.budgetPeriod === 'quarterly') budget = raw / 3;
      else if (cc.budgetPeriod === 'annual') budget = raw / 12;
      else budget = raw;
    }
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();

  const spend = await getActualSpend(entityType, entityId, startOfMonth, now, prisma);
  const currentSpend = spend.total;
  const projectedSpend =
    daysElapsed > 0 ? Math.round((currentSpend / daysElapsed) * daysInMonth * 100) / 100 : 0;
  const projectedVariance = Math.round((budget - projectedSpend) * 100) / 100;

  return {
    currentSpend: Math.round(currentSpend * 100) / 100,
    projectedSpend,
    budget: Math.round(budget * 100) / 100,
    projectedVariance,
    onTrack: projectedSpend <= budget,
    daysElapsed,
    daysInMonth,
  };
}

/**
 * All budget alerts across the operator (warning ≥75%, critical ≥90%, over ≥100%).
 */
export async function getBudgetAlerts(
  operatorId: string,
  prisma: PrismaClient,
): Promise<BudgetAlert[]> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [fleets, costCentres] = await Promise.all([
    prisma.fleet.findMany({
      where: { operatorId, deletedAt: null, monthlyBudget: { not: null } },
      select: { id: true, name: true, monthlyBudget: true },
    }),
    prisma.costCentre.findMany({
      where: { operatorId, deletedAt: null, budget: { not: null }, isActive: true },
      select: { id: true, name: true, code: true, budget: true },
    }),
  ]);

  const alerts: BudgetAlert[] = [];

  for (const fleet of fleets) {
    const budget = Number(fleet.monthlyBudget!);
    const spend = await getActualSpend('fleet', fleet.id, startOfMonth, now, prisma);
    const pct = budget > 0 ? spend.total / budget : 0;

    let level: BudgetAlert['level'] | null = null;
    if (pct >= 1) level = 'over';
    else if (pct >= 0.9) level = 'critical';
    else if (pct >= 0.75) level = 'warning';

    if (level) {
      alerts.push({
        entityType: 'fleet',
        entityId: fleet.id,
        entityName: fleet.name,
        budget,
        currentSpend: Math.round(spend.total * 100) / 100,
        percentConsumed: Math.round(pct * 10000) / 100,
        level,
      });
    }
  }

  for (const cc of costCentres) {
    const budget = Number(cc.budget!);
    const spend = await getActualSpend('cost_centre', cc.id, startOfMonth, now, prisma);
    const pct = budget > 0 ? spend.total / budget : 0;

    let level: BudgetAlert['level'] | null = null;
    if (pct >= 1) level = 'over';
    else if (pct >= 0.9) level = 'critical';
    else if (pct >= 0.75) level = 'warning';

    if (level) {
      alerts.push({
        entityType: 'cost_centre',
        entityId: cc.id,
        entityName: `${cc.name} (${cc.code})`,
        budget,
        currentSpend: Math.round(spend.total * 100) / 100,
        percentConsumed: Math.round(pct * 10000) / 100,
        level,
      });
    }
  }

  return alerts;
}
