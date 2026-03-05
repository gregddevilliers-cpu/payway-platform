import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpendByCostCentre {
  costCentreId: string;
  costCentreName: string;
  code: string;
  fuelSpend: number;
  maintenanceSpend: number;
  repairSpend: number;
  totalSpend: number;
  budget: number | null;
  budgetPeriod: string | null;
  variance: number | null;
}

export interface CostCentreNode {
  id: string;
  name: string;
  code: string;
  description: string | null;
  budget: number | null;
  budgetPeriod: string | null;
  isActive: boolean;
  parentId: string | null;
  children: CostCentreNode[];
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Aggregate total spend per cost centre within a date range.
 * Includes fuel, maintenance, and repair spend.
 */
export async function getSpendByCostCentre(
  operatorId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
): Promise<SpendByCostCentre[]> {
  const costCentres = await prisma.costCentre.findMany({
    where: { operatorId, deletedAt: null },
    orderBy: { name: 'asc' },
  });

  if (costCentres.length === 0) return [];

  const [fuelAgg, maintenanceAgg, repairAgg] = await Promise.all([
    (prisma.fuelTransaction.groupBy as any)({
      by: ['costCentreId'],
      where: {
        operatorId,
        transactionDate: { gte: dateFrom, lte: dateTo },
        costCentreId: { not: null },
      },
      _sum: { totalAmount: true },
    }),
    (prisma.maintenanceRecord.groupBy as any)({
      by: ['costCentreId'],
      where: {
        operatorId,
        serviceDate: { gte: dateFrom, lte: dateTo },
        deletedAt: null,
        costCentreId: { not: null },
      },
      _sum: { cost: true },
    }),
    (prisma.repairJob.groupBy as any)({
      by: ['costCentreId'],
      where: {
        operatorId,
        createdAt: { gte: dateFrom, lte: dateTo },
        deletedAt: null,
        costCentreId: { not: null },
      },
      _sum: { totalCost: true },
    }),
  ]);

  const fuelMap = new Map<string, number>(fuelAgg.map((r: any) => [r.costCentreId ?? '', Number(r._sum?.totalAmount ?? 0)]));
  const maintenanceMap = new Map<string, number>(maintenanceAgg.map((r: any) => [r.costCentreId ?? '', Number(r._sum?.cost ?? 0)]));
  const repairMap = new Map<string, number>(repairAgg.map((r: any) => [r.costCentreId ?? '', Number(r._sum?.totalCost ?? 0)]));

  return costCentres.map((cc) => {
    const fuelSpend: number = fuelMap.get(cc.id) ?? 0;
    const maintenanceSpend: number = maintenanceMap.get(cc.id) ?? 0;
    const repairSpend: number = repairMap.get(cc.id) ?? 0;
    const totalSpend = fuelSpend + maintenanceSpend + repairSpend;
    const budget = cc.budget !== null ? Number(cc.budget) : null;
    const variance = budget !== null ? budget - totalSpend : null;

    return {
      costCentreId: cc.id,
      costCentreName: cc.name,
      code: cc.code,
      fuelSpend,
      maintenanceSpend,
      repairSpend,
      totalSpend,
      budget,
      budgetPeriod: cc.budgetPeriod,
      variance,
    };
  });
}

/**
 * Return cost centres as a nested tree structure.
 */
export async function getCostCentreHierarchy(
  operatorId: string,
  prisma: PrismaClient,
): Promise<CostCentreNode[]> {
  const all = await prisma.costCentre.findMany({
    where: { operatorId, deletedAt: null },
    orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
  });

  const nodeMap = new Map<string, CostCentreNode>(
    all.map((cc) => [
      cc.id,
      {
        id: cc.id,
        name: cc.name,
        code: cc.code,
        description: cc.description,
        budget: cc.budget !== null ? Number(cc.budget) : null,
        budgetPeriod: cc.budgetPeriod,
        isActive: cc.isActive,
        parentId: cc.parentId,
        children: [],
      },
    ]),
  );

  const roots: CostCentreNode[] = [];

  for (const cc of all) {
    const node = nodeMap.get(cc.id);
    if (!node) continue;

    if (cc.parentId) {
      const parent = nodeMap.get(cc.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node); // orphaned — parent may be deleted
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Resolve the effective cost centre for a vehicle.
 * Falls back from vehicle → fleet if vehicle has no cost centre.
 */
export async function autoAssignCostCentre(
  vehicleId: string,
  prisma: PrismaClient,
): Promise<string | null> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId },
    select: { costCentreId: true, fleetId: true },
  });
  if (!vehicle) return null;
  if (vehicle.costCentreId) return vehicle.costCentreId;

  const fleet = await prisma.fleet.findFirst({
    where: { id: vehicle.fleetId },
    select: { costCentreId: true },
  });
  return fleet?.costCentreId ?? null;
}
