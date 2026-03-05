import { PrismaClient } from '@prisma/client';

export interface ReportFilters {
  fleetId?: string;
  vehicleId?: string;
  driverId?: string;
  dateFrom: string;
  dateTo: string;
  groupBy?: string;
}

type PrismaClient_ = PrismaClient;

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber();
  }
  return Number(v);
}

function dateRange(filters: ReportFilters) {
  return {
    gte: new Date(filters.dateFrom),
    lte: new Date(filters.dateTo),
  };
}

// ── 1. Fuel Consumption ──────────────────────────────────────────────────────
export async function fuelConsumption(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const where = {
    operatorId,
    transactionDate: dateRange(filters),
    ...(filters.fleetId ? { fleetId: filters.fleetId } : {}),
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters.driverId ? { driverId: filters.driverId } : {}),
  };

  const txns = await prisma.fuelTransaction.findMany({
    where,
    include: {
      vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
      fleet: { select: { id: true, name: true } },
    },
  });

  const dim = filters.groupBy ?? 'vehicle';
  const grouped: Record<string, { label: string; totalLitres: number; totalCost: number; totalAmount: number; efficiencies: number[]; count: number }> = {};

  for (const t of txns) {
    const key =
      dim === 'driver' ? (t.driver?.id ?? 'unknown') :
      dim === 'fleet' ? t.fleetId :
      t.vehicleId;
    const label =
      dim === 'driver' ? (t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : 'Unknown') :
      dim === 'fleet' ? t.fleet.name :
      t.vehicle.registrationNumber;

    if (!grouped[key]) grouped[key] = { label, totalLitres: 0, totalCost: 0, totalAmount: 0, efficiencies: [], count: 0 };
    grouped[key].totalLitres += toNum(t.litresFilled);
    grouped[key].totalCost += toNum(t.totalAmount);
    grouped[key].totalAmount += toNum(t.totalAmount);
    grouped[key].count++;
    if (t.fuelEfficiency) grouped[key].efficiencies.push(toNum(t.fuelEfficiency));
  }

  return Object.entries(grouped).map(([id, g]) => ({
    id,
    label: g.label,
    totalLitres: +g.totalLitres.toFixed(2),
    totalCost: +g.totalCost.toFixed(2),
    avgPricePerLitre: g.totalLitres > 0 ? +(g.totalCost / g.totalLitres).toFixed(4) : 0,
    avgL100km: g.efficiencies.length > 0
      ? +(100 / (g.efficiencies.reduce((a, b) => a + b, 0) / g.efficiencies.length)).toFixed(2)
      : null,
    transactionCount: g.count,
  }));
}

// ── 2. Spend Analysis ────────────────────────────────────────────────────────
export async function spendAnalysis(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const current = { gte: new Date(filters.dateFrom), lte: new Date(filters.dateTo) };
  const rangeMs = current.lte.getTime() - current.gte.getTime();
  const prevEnd = new Date(current.gte.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - rangeMs);
  const previous = { gte: prevStart, lte: prevEnd };

  const baseWhere = {
    operatorId,
    ...(filters.fleetId ? { fleetId: filters.fleetId } : {}),
    ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
    ...(filters.driverId ? { driverId: filters.driverId } : {}),
  };

  const [currTxns, prevTxns] = await Promise.all([
    prisma.fuelTransaction.findMany({ where: { ...baseWhere, transactionDate: current }, include: { fleet: { select: { name: true } } } }),
    prisma.fuelTransaction.findMany({ where: { ...baseWhere, transactionDate: previous } }),
  ]);

  const currTotal = currTxns.reduce((s, t) => s + toNum(t.totalAmount), 0);
  const prevTotal = prevTxns.reduce((s, t) => s + toNum(t.totalAmount), 0);
  const pctChange = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;

  // By fleet breakdown
  const byFleet: Record<string, { name: string; current: number; previous: number }> = {};
  for (const t of currTxns) {
    const fid = t.fleetId;
    if (!byFleet[fid]) byFleet[fid] = { name: t.fleet.name, current: 0, previous: 0 };
    byFleet[fid].current += toNum(t.totalAmount);
  }
  for (const t of prevTxns) {
    const fid = t.fleetId;
    if (!byFleet[fid]) byFleet[fid] = { name: fid, current: 0, previous: 0 };
    byFleet[fid].previous += toNum(t.totalAmount);
  }

  return {
    currentTotal: +currTotal.toFixed(2),
    previousTotal: +prevTotal.toFixed(2),
    percentageChange: pctChange != null ? +pctChange.toFixed(1) : null,
    byFleet: Object.entries(byFleet).map(([id, v]) => ({
      fleetId: id, name: v.name,
      current: +v.current.toFixed(2),
      previous: +v.previous.toFixed(2),
      change: v.previous > 0 ? +(((v.current - v.previous) / v.previous) * 100).toFixed(1) : null,
    })),
  };
}

// ── 3. Driver Performance ────────────────────────────────────────────────────
export async function driverPerformance(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const where = {
    operatorId,
    transactionDate: dateRange(filters),
    ...(filters.fleetId ? { fleetId: filters.fleetId } : {}),
  };

  const txns = await prisma.fuelTransaction.findMany({
    where,
    include: { driver: { select: { id: true, firstName: true, lastName: true } } },
  });

  // Anomaly counts per driver
  const anomalyCounts: Record<string, number> = {};
  for (const t of txns) {
    const flags = (t.anomalyFlags as unknown as { code: string }[]) ?? [];
    anomalyCounts[t.driverId] = (anomalyCounts[t.driverId] ?? 0) + flags.length;
  }

  const driverMap: Record<string, { label: string; totalSpend: number; efficiencies: number[]; count: number }> = {};
  for (const t of txns) {
    const id = t.driverId;
    const label = t.driver ? `${t.driver.firstName} ${t.driver.lastName}` : id;
    if (!driverMap[id]) driverMap[id] = { label, totalSpend: 0, efficiencies: [], count: 0 };
    driverMap[id].totalSpend += toNum(t.totalAmount);
    driverMap[id].count++;
    if (t.fuelEfficiency) driverMap[id].efficiencies.push(toNum(t.fuelEfficiency));
  }

  const fleetAvgKpl = (() => {
    const all: number[] = Object.values(driverMap).flatMap((d) => d.efficiencies);
    return all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  })();

  return Object.entries(driverMap).map(([id, d]) => {
    const avgKpl = d.efficiencies.length > 0 ? d.efficiencies.reduce((a, b) => a + b, 0) / d.efficiencies.length : null;
    const avgL100 = avgKpl ? +(100 / avgKpl).toFixed(2) : null;
    return {
      driverId: id,
      driverName: d.label,
      totalSpend: +d.totalSpend.toFixed(2),
      avgL100km: avgL100,
      avgKpl: avgKpl ? +avgKpl.toFixed(2) : null,
      vsFleetAvg: avgKpl && fleetAvgKpl > 0 ? +(((avgKpl - fleetAvgKpl) / fleetAvgKpl) * 100).toFixed(1) : null,
      anomalyCount: anomalyCounts[id] ?? 0,
      transactionCount: d.count,
    };
  }).sort((a, b) => (b.avgKpl ?? 0) - (a.avgKpl ?? 0));
}

// ── 4. Vehicle Performance ───────────────────────────────────────────────────
export async function vehiclePerformance(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const where = {
    operatorId,
    transactionDate: dateRange(filters),
    ...(filters.fleetId ? { fleetId: filters.fleetId } : {}),
  };

  const [txns, maintenanceRecords] = await Promise.all([
    prisma.fuelTransaction.findMany({
      where,
      include: { vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } } },
    }),
    prisma.maintenanceRecord.findMany({
      where: { operatorId, serviceDate: dateRange(filters), ...(filters.fleetId ? { fleetId: filters.fleetId } : {}) },
      select: { vehicleId: true, cost: true },
    }),
  ]);

  const maintenanceCosts: Record<string, number> = {};
  for (const m of maintenanceRecords) {
    maintenanceCosts[m.vehicleId] = (maintenanceCosts[m.vehicleId] ?? 0) + toNum(m.cost);
  }

  const vehicleMap: Record<string, { label: string; totalFuelSpend: number; efficiencies: number[]; count: number }> = {};
  for (const t of txns) {
    const id = t.vehicleId;
    if (!vehicleMap[id]) vehicleMap[id] = { label: t.vehicle.registrationNumber, totalFuelSpend: 0, efficiencies: [], count: 0 };
    vehicleMap[id].totalFuelSpend += toNum(t.totalAmount);
    vehicleMap[id].count++;
    if (t.fuelEfficiency) vehicleMap[id].efficiencies.push(toNum(t.fuelEfficiency));
  }

  return Object.entries(vehicleMap).map(([id, v]) => {
    const avgKpl = v.efficiencies.length > 0 ? v.efficiencies.reduce((a, b) => a + b, 0) / v.efficiencies.length : null;
    return {
      vehicleId: id,
      registrationNumber: v.label,
      totalFuelSpend: +v.totalFuelSpend.toFixed(2),
      totalMaintenanceCost: +(maintenanceCosts[id] ?? 0).toFixed(2),
      totalCost: +(v.totalFuelSpend + (maintenanceCosts[id] ?? 0)).toFixed(2),
      avgKpl: avgKpl ? +avgKpl.toFixed(2) : null,
      avgL100km: avgKpl ? +(100 / avgKpl).toFixed(2) : null,
      transactionCount: v.count,
    };
  }).sort((a, b) => b.totalCost - a.totalCost);
}

// ── 5. Compliance ────────────────────────────────────────────────────────────
export async function compliance(
  operatorId: string,
  _filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const [drivers, vehicles] = await Promise.all([
    prisma.driver.findMany({
      where: { operatorId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, licenceCode: true, licenceExpiry: true, prdpNumber: true, prdpExpiry: true },
    }),
    prisma.vehicle.findMany({
      where: { operatorId, deletedAt: null },
      select: { id: true, registrationNumber: true, make: true, model: true },
    }),
  ]);

  const items: { entityType: string; entityId: string; entityName: string; itemType: string; expiryDate: string | null; status: 'expired' | 'expiring_30' | 'expiring_60' | 'ok' }[] = [];

  for (const d of drivers) {
    const checks = [
      { type: 'Licence', expiry: d.licenceExpiry },
      { type: 'PrDP', expiry: d.prdpExpiry },
    ];
    for (const { type, expiry } of checks) {
      if (!expiry) continue;
      const status = expiry < now ? 'expired' : expiry < in30 ? 'expiring_30' : expiry < in60 ? 'expiring_60' : 'ok';
      if (status !== 'ok') {
        items.push({ entityType: 'driver', entityId: d.id, entityName: `${d.firstName} ${d.lastName}`, itemType: type, expiryDate: expiry.toISOString(), status });
      }
    }
  }

  return {
    items: items.sort((a, b) => {
      const order = { expired: 0, expiring_30: 1, expiring_60: 2, ok: 3 };
      return order[a.status] - order[b.status];
    }),
    summary: {
      expired: items.filter((i) => i.status === 'expired').length,
      expiring30: items.filter((i) => i.status === 'expiring_30').length,
      expiring60: items.filter((i) => i.status === 'expiring_60').length,
    },
    totalDrivers: drivers.length,
    totalVehicles: vehicles.length,
  };
}

// ── 6. Budget Variance ────────────────────────────────────────────────────────
export async function budgetVariance(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const fleets = await prisma.fleet.findMany({
    where: { operatorId, deletedAt: null, ...(filters.fleetId ? { id: filters.fleetId } : {}) },
    select: { id: true, name: true, monthlyBudget: true },
  });

  const spends = await prisma.fuelTransaction.groupBy({
    by: ['fleetId'],
    where: { operatorId, transactionDate: dateRange(filters) },
    _sum: { totalAmount: true },
  });

  const spendMap: Record<string, number> = {};
  for (const s of spends) spendMap[s.fleetId] = toNum(s._sum.totalAmount);

  return fleets.map((f) => {
    const budget = toNum(f.monthlyBudget);
    const actual = spendMap[f.id] ?? 0;
    const variance = actual - budget;
    const pct = budget > 0 ? (variance / budget) * 100 : null;
    return {
      fleetId: f.id,
      fleetName: f.name,
      budget: +budget.toFixed(2),
      actual: +actual.toFixed(2),
      variance: +variance.toFixed(2),
      variancePct: pct != null ? +pct.toFixed(1) : null,
      status: budget === 0 ? 'no_budget' : actual > budget ? 'over_budget' : 'under_budget',
    };
  });
}

// ── 7. Anomaly Report ─────────────────────────────────────────────────────────
export async function anomalyReport(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const txns = await prisma.fuelTransaction.findMany({
    where: { operatorId, transactionDate: dateRange(filters), ...(filters.fleetId ? { fleetId: filters.fleetId } : {}) },
    include: {
      vehicle: { select: { registrationNumber: true } },
      driver: { select: { firstName: true, lastName: true } },
    },
  });

  const codeCounts: Record<string, { count: number; resolved: number }> = {};
  const vehicleCounts: Record<string, { reg: string; count: number }> = {};
  const driverCounts: Record<string, { name: string; count: number }> = {};

  for (const t of txns) {
    const flags = (t.anomalyFlags as unknown as { code: string; resolution?: string }[]) ?? [];
    if (flags.length === 0) continue;
    for (const f of flags) {
      if (!codeCounts[f.code]) codeCounts[f.code] = { count: 0, resolved: 0 };
      codeCounts[f.code].count++;
      if (f.resolution) codeCounts[f.code].resolved++;
    }
    vehicleCounts[t.vehicleId] = {
      reg: t.vehicle.registrationNumber,
      count: (vehicleCounts[t.vehicleId]?.count ?? 0) + flags.length,
    };
    if (t.driver) {
      driverCounts[t.driverId] = {
        name: `${t.driver.firstName} ${t.driver.lastName}`,
        count: (driverCounts[t.driverId]?.count ?? 0) + flags.length,
      };
    }
  }

  return {
    byType: Object.entries(codeCounts).map(([code, v]) => ({
      code, count: v.count, resolved: v.resolved,
      resolutionRate: v.count > 0 ? +((v.resolved / v.count) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.count - a.count),
    topVehicles: Object.entries(vehicleCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
      .map(([id, v]) => ({ vehicleId: id, registrationNumber: v.reg, anomalyCount: v.count })),
    topDrivers: Object.entries(driverCounts).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
      .map(([id, v]) => ({ driverId: id, driverName: v.name, anomalyCount: v.count })),
  };
}

// ── 8. Forecourt Analysis ─────────────────────────────────────────────────────
export async function forecourtAnalysis(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const txns = await prisma.fuelTransaction.findMany({
    where: {
      operatorId, transactionDate: dateRange(filters),
      siteName: { not: null },
      ...(filters.fleetId ? { fleetId: filters.fleetId } : {}),
    },
    select: { siteCode: true, siteName: true, litresFilled: true, pricePerLitre: true, totalAmount: true },
  });

  const forecourts: Record<string, { name: string; code: string | null; totalSpend: number; totalLitres: number; prices: number[]; count: number }> = {};
  for (const t of txns) {
    const key = t.siteName ?? 'Unknown';
    if (!forecourts[key]) forecourts[key] = { name: key, code: t.siteCode, totalSpend: 0, totalLitres: 0, prices: [], count: 0 };
    forecourts[key].totalSpend += toNum(t.totalAmount);
    forecourts[key].totalLitres += toNum(t.litresFilled);
    forecourts[key].prices.push(toNum(t.pricePerLitre));
    forecourts[key].count++;
  }

  return Object.values(forecourts).map((f) => ({
    siteName: f.name,
    siteCode: f.code,
    totalSpend: +f.totalSpend.toFixed(2),
    totalLitres: +f.totalLitres.toFixed(2),
    avgPricePerLitre: f.prices.length > 0 ? +(f.prices.reduce((a, b) => a + b, 0) / f.prices.length).toFixed(4) : 0,
    transactionCount: f.count,
  })).sort((a, b) => b.totalSpend - a.totalSpend);
}

// ── 9. Cost Allocation ────────────────────────────────────────────────────────
export async function costAllocation(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const [fuelByFleet, maintenanceByFleet] = await Promise.all([
    prisma.fuelTransaction.groupBy({
      by: ['fleetId'],
      where: { operatorId, transactionDate: dateRange(filters), ...(filters.fleetId ? { fleetId: filters.fleetId } : {}) },
      _sum: { totalAmount: true },
    }),
    prisma.maintenanceRecord.groupBy({
      by: ['fleetId'],
      where: { operatorId, serviceDate: dateRange(filters), ...(filters.fleetId ? { fleetId: filters.fleetId } : {}) },
      _sum: { cost: true },
    }),
  ]);

  const fleets = await prisma.fleet.findMany({
    where: { operatorId, deletedAt: null },
    select: { id: true, name: true },
  });
  const fleetNames: Record<string, string> = {};
  for (const f of fleets) fleetNames[f.id] = f.name;

  const fuelMap: Record<string, number> = {};
  for (const r of fuelByFleet) fuelMap[r.fleetId] = toNum(r._sum.totalAmount);

  const maintMap: Record<string, number> = {};
  for (const r of maintenanceByFleet) maintMap[r.fleetId] = toNum(r._sum.cost);

  const allFleetIds = Array.from(new Set([...Object.keys(fuelMap), ...Object.keys(maintMap)]));
  return allFleetIds.map((id) => ({
    fleetId: id,
    fleetName: fleetNames[id] ?? id,
    fuelCost: +(fuelMap[id] ?? 0).toFixed(2),
    maintenanceCost: +(maintMap[id] ?? 0).toFixed(2),
    totalCost: +((fuelMap[id] ?? 0) + (maintMap[id] ?? 0)).toFixed(2),
  })).sort((a, b) => b.totalCost - a.totalCost);
}

// ── 10. Environmental ─────────────────────────────────────────────────────────
const CO2_FACTORS: Record<string, number> = {
  petrol: 2.31,
  diesel: 2.68,
  lpg: 1.51,
  electric: 0,
  hybrid: 2.0,
};

export async function environmental(
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  const txns = await prisma.fuelTransaction.findMany({
    where: {
      operatorId, transactionDate: dateRange(filters),
      ...(filters.fleetId ? { fleetId: filters.fleetId } : {}),
      ...(filters.vehicleId ? { vehicleId: filters.vehicleId } : {}),
      ...(filters.driverId ? { driverId: filters.driverId } : {}),
    },
    include: {
      vehicle: { select: { id: true, registrationNumber: true, fleetId: true } },
      fleet: { select: { name: true } },
    },
  });

  const dim = filters.groupBy ?? 'fleet';
  const grouped: Record<string, { label: string; litresByFuelType: Record<string, number>; efficiencies: number[] }> = {};

  for (const t of txns) {
    const key = dim === 'vehicle' ? t.vehicleId : t.fleetId;
    const label = dim === 'vehicle' ? t.vehicle.registrationNumber : t.fleet.name;
    if (!grouped[key]) grouped[key] = { label, litresByFuelType: {}, efficiencies: [] };
    const ft = t.fuelType;
    grouped[key].litresByFuelType[ft] = (grouped[key].litresByFuelType[ft] ?? 0) + toNum(t.litresFilled);
    if (t.fuelEfficiency) grouped[key].efficiencies.push(toNum(t.fuelEfficiency));
  }

  return Object.entries(grouped).map(([id, g]) => {
    const totalLitres = Object.values(g.litresByFuelType).reduce((a, b) => a + b, 0);
    const totalCo2 = Object.entries(g.litresByFuelType)
      .reduce((sum, [ft, litres]) => sum + litres * (CO2_FACTORS[ft] ?? 2.5), 0);
    const avgKpl = g.efficiencies.length > 0 ? g.efficiencies.reduce((a, b) => a + b, 0) / g.efficiencies.length : null;
    const co2PerKm = avgKpl && avgKpl > 0 ? totalCo2 / (totalLitres * avgKpl) : null;
    return {
      id,
      label: g.label,
      totalLitres: +totalLitres.toFixed(2),
      totalCo2kg: +totalCo2.toFixed(2),
      co2PerKm: co2PerKm ? +co2PerKm.toFixed(3) : null,
      litresByFuelType: g.litresByFuelType,
    };
  }).sort((a, b) => b.totalCo2kg - a.totalCo2kg);
}

// ── Report dispatcher ─────────────────────────────────────────────────────────
export const REPORT_TYPES = [
  'fuel-consumption', 'spend-analysis', 'driver-performance', 'vehicle-performance',
  'compliance', 'budget-variance', 'anomaly-report', 'forecourt-analysis',
  'cost-allocation', 'environmental',
] as const;

export type ReportType = typeof REPORT_TYPES[number];

export async function runReport(
  type: ReportType,
  operatorId: string,
  filters: ReportFilters,
  prisma: PrismaClient_,
) {
  switch (type) {
    case 'fuel-consumption': return fuelConsumption(operatorId, filters, prisma);
    case 'spend-analysis': return spendAnalysis(operatorId, filters, prisma);
    case 'driver-performance': return driverPerformance(operatorId, filters, prisma);
    case 'vehicle-performance': return vehiclePerformance(operatorId, filters, prisma);
    case 'compliance': return compliance(operatorId, filters, prisma);
    case 'budget-variance': return budgetVariance(operatorId, filters, prisma);
    case 'anomaly-report': return anomalyReport(operatorId, filters, prisma);
    case 'forecourt-analysis': return forecourtAnalysis(operatorId, filters, prisma);
    case 'cost-allocation': return costAllocation(operatorId, filters, prisma);
    case 'environmental': return environmental(operatorId, filters, prisma);
    default: throw new Error(`Unknown report type: ${type as string}`);
  }
}
