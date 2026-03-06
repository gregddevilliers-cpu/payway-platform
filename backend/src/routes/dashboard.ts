import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok } from '../types/index';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function')
    return (v as { toNumber: () => number }).toNumber();
  return Number(v);
}

function periodDates(period: string): { current: { gte: Date; lte: Date }; previous: { gte: Date; lte: Date } } {
  const now = new Date();
  let daysBack = 30;
  if (period === '3M') daysBack = 90;
  else if (period === '6M') daysBack = 180;
  else if (period === '12M') daysBack = 365;
  else if (period === '1M') daysBack = 30;
  else if (period === 'LM') {
    // Last month
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
    return { current: { gte: start, lte: end }, previous: { gte: prevStart, lte: prevEnd } };
  }

  const currentStart = new Date(now.getTime() - daysBack * 86400000);
  const prevStart = new Date(currentStart.getTime() - daysBack * 86400000);
  return {
    current: { gte: currentStart, lte: now },
    previous: { gte: prevStart, lte: currentStart },
  };
}

// ─── GET /api/v1/dashboard/summary ───────────────────────────────────────────
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const period = (req.query.period as string) ?? '1M';
  const fleetId = req.query.fleetId as string | undefined;
  const { current, previous } = periodDates(period);

  const baseWhere = operatorId ? { operatorId } : {};
  const vehicleWhere = { ...baseWhere, deletedAt: null, ...(fleetId ? { fleetId } : {}) };
  const driverWhere = { ...baseWhere, deletedAt: null, ...(fleetId ? { fleetId } : {}) };
  const fuelWhere = { ...baseWhere, ...(fleetId ? { fleetId } : {}) };

  const [
    totalVehicles, activeVehicles, vehiclesInMaintenance,
    totalDrivers, activeDrivers,
    currFuelData, prevFuelData,
    totalFleets,
    openIncidents,
    overdueDrivers,
  ] = await Promise.all([
    prisma.vehicle.count({ where: vehicleWhere }),
    prisma.vehicle.count({ where: { ...vehicleWhere, status: 'active' } }),
    prisma.vehicle.count({ where: { ...vehicleWhere, status: 'maintenance' } }),
    prisma.driver.count({ where: driverWhere }),
    prisma.driver.count({ where: { ...driverWhere, status: 'active' } }),
    prisma.fuelTransaction.aggregate({
      where: { ...fuelWhere, transactionDate: current },
      _sum: { totalAmount: true, litresFilled: true },
      _count: true,
    }),
    prisma.fuelTransaction.aggregate({
      where: { ...fuelWhere, transactionDate: previous },
      _sum: { totalAmount: true },
    }),
    prisma.fleet.count({ where: { ...baseWhere, deletedAt: null } }),
    prisma.incident.count({ where: { ...baseWhere, deletedAt: null, status: { in: ['reported', 'under_investigation'] }, ...(fleetId ? { fleetId } : {}) } }),
    prisma.driver.count({
      where: {
        ...driverWhere,
        OR: [{ licenceExpiry: { lt: new Date() } }, { licenceExpiry: null }],
      },
    }),
  ]);

  const currSpend = toNum(currFuelData._sum.totalAmount);
  const prevSpend = toNum(prevFuelData._sum.totalAmount);
  const spendChange = prevSpend > 0 ? ((currSpend - prevSpend) / prevSpend) * 100 : null;

  // Compliance score: % of drivers with valid licence + PrDP
  const validDrivers = await prisma.driver.count({
    where: {
      ...driverWhere,
      licenceExpiry: { gte: new Date() },
      prdpExpiry: { gte: new Date() },
    },
  });
  const complianceScore = totalDrivers > 0 ? Math.round((validDrivers / totalDrivers) * 100) : 100;

  // Average efficiency
  const efficiencyData = await prisma.fuelTransaction.findMany({
    where: { ...fuelWhere, transactionDate: current, fuelEfficiency: { not: null } },
    select: { fuelEfficiency: true },
    take: 200,
  });
  const efficiencies = efficiencyData.map((t) => toNum(t.fuelEfficiency));
  const avgKpl = efficiencies.length > 0 ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length : null;
  const avgL100km = avgKpl ? +(100 / avgKpl).toFixed(2) : null;

  res.json(ok({
    period,
    kpis: {
      totalVehicles, activeVehicles, vehiclesInMaintenance,
      totalDrivers, activeDrivers,
      totalFleets,
      openIncidents,
      fuelSpend: { current: +currSpend.toFixed(2), previous: +prevSpend.toFixed(2), changePercent: spendChange != null ? +spendChange.toFixed(1) : null },
      totalLitres: +toNum(currFuelData._sum.litresFilled).toFixed(2),
      fuelTransactionCount: currFuelData._count,
      complianceScore,
      avgFuelEfficiency: avgL100km ? `${avgL100km} L/100km` : null,
      overdueCompliance: overdueDrivers,
    },
  }));
});

// ─── GET /api/v1/dashboard/charts ────────────────────────────────────────────
router.get('/charts', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const period = (req.query.period as string) ?? '1M';
  const fleetId = req.query.fleetId as string | undefined;
  const { current } = periodDates(period);
  const baseWhere = operatorId ? { operatorId } : {};
  const fuelWhere = { ...baseWhere, ...(fleetId ? { fleetId } : {}) };

  // Fuel spend trend — group by day or week depending on period
  const txns = await prisma.fuelTransaction.findMany({
    where: { ...fuelWhere, transactionDate: current },
    select: { transactionDate: true, totalAmount: true, fuelType: true, fleetId: true, fleet: { select: { name: true } } },
    orderBy: { transactionDate: 'asc' },
  });

  // Spend by day
  const daySpend: Record<string, number> = {};
  const txnVolume: Record<string, number> = {};
  for (const t of txns) {
    const day = t.transactionDate.toISOString().split('T')[0];
    daySpend[day] = (daySpend[day] ?? 0) + toNum(t.totalAmount);
    txnVolume[day] = (txnVolume[day] ?? 0) + 1;
  }

  const spendTrend = Object.entries(daySpend).map(([date, spend]) => ({ date, spend: +spend.toFixed(2) }));
  const volumeTrend = Object.entries(txnVolume).map(([date, count]) => ({ date, count }));

  // Spend by fleet
  const fleetSpend: Record<string, { name: string; spend: number }> = {};
  for (const t of txns) {
    if (!fleetSpend[t.fleetId]) fleetSpend[t.fleetId] = { name: t.fleet.name, spend: 0 };
    fleetSpend[t.fleetId].spend += toNum(t.totalAmount);
  }
  const byFleet = Object.entries(fleetSpend)
    .map(([id, v]) => ({ fleetId: id, name: v.name, spend: +v.spend.toFixed(2) }))
    .sort((a, b) => b.spend - a.spend);

  // Top 10 vehicles by spend
  const vehicleSpend = await prisma.fuelTransaction.groupBy({
    by: ['vehicleId'],
    where: { ...fuelWhere, transactionDate: current },
    _sum: { totalAmount: true },
    orderBy: { _sum: { totalAmount: 'desc' } },
    take: 10,
  });
  const vehicleIds = vehicleSpend.map((v) => v.vehicleId);
  const vehicles = await prisma.vehicle.findMany({ where: { id: { in: vehicleIds } }, select: { id: true, registrationNumber: true } });
  const vehicleNames: Record<string, string> = {};
  for (const v of vehicles) vehicleNames[v.id] = v.registrationNumber;
  const topVehicles = vehicleSpend.map((v) => ({
    vehicleId: v.vehicleId,
    registrationNumber: vehicleNames[v.vehicleId] ?? v.vehicleId,
    spend: +toNum(v._sum.totalAmount).toFixed(2),
  }));

  // Fuel type distribution
  const fuelTypeSpend: Record<string, number> = {};
  for (const t of txns) {
    fuelTypeSpend[t.fuelType] = (fuelTypeSpend[t.fuelType] ?? 0) + toNum(t.totalAmount);
  }
  const fuelTypeDistribution = Object.entries(fuelTypeSpend).map(([type, spend]) => ({ type, spend: +spend.toFixed(2) }));

  res.json(ok({ spendTrend, volumeTrend, byFleet, topVehicles, fuelTypeDistribution }));
});

// ─── GET /api/v1/dashboard/alerts ────────────────────────────────────────────
router.get('/alerts', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const fleetId = req.query.fleetId as string | undefined;
  const baseWhere = operatorId ? { operatorId } : {};
  const fleetFilter = fleetId ? { fleetId } : {};
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 86400000);

  const alerts: { severity: 'critical' | 'warning' | 'info'; title: string; description: string; link: string; entityType: string; entityId: string }[] = [];

  const [
    expiredLicences,
    expiring30Licences,
    openIncidents,
    overdueMaintenanceCount,
    highAnomalies,
  ] = await Promise.all([
    prisma.driver.findMany({
      where: { ...baseWhere, ...fleetFilter, deletedAt: null, licenceExpiry: { lt: now } },
      select: { id: true, firstName: true, lastName: true, licenceExpiry: true },
      take: 5,
    }),
    prisma.driver.findMany({
      where: { ...baseWhere, ...fleetFilter, deletedAt: null, licenceExpiry: { gte: now, lte: in30 } },
      select: { id: true, firstName: true, lastName: true, licenceExpiry: true },
      take: 5,
    }),
    prisma.incident.findMany({
      where: { ...baseWhere, ...fleetFilter, deletedAt: null, severity: 'critical', status: 'reported' },
      select: { id: true, incidentNumber: true, vehicle: { select: { registrationNumber: true } } },
      take: 3,
    }),
    prisma.maintenanceSchedule.count({
      where: { ...baseWhere, isActive: true, nextDueDate: { lt: now }, ...(fleetId ? { vehicle: { fleetId } } : {}) },
    }),
    prisma.fuelTransaction.count({
      where: {
        ...baseWhere, ...fleetFilter,
        transactionDate: { gte: new Date(now.getTime() - 7 * 86400000) },
      },
    }),
  ]);

  for (const d of expiredLicences) {
    alerts.push({
      severity: 'critical', entityType: 'driver', entityId: d.id,
      title: `Expired Licence — ${d.firstName} ${d.lastName}`,
      description: `Licence expired on ${d.licenceExpiry?.toLocaleDateString('en-ZA')}.`,
      link: `/drivers/${d.id}`,
    });
  }

  for (const d of expiring30Licences) {
    alerts.push({
      severity: 'warning', entityType: 'driver', entityId: d.id,
      title: `Licence Expiring — ${d.firstName} ${d.lastName}`,
      description: `Licence expires on ${d.licenceExpiry?.toLocaleDateString('en-ZA')}.`,
      link: `/drivers/${d.id}`,
    });
  }

  for (const i of openIncidents) {
    alerts.push({
      severity: 'critical', entityType: 'incident', entityId: i.id,
      title: `Critical Incident — ${i.incidentNumber}`,
      description: `${i.vehicle.registrationNumber} — critical incident reported.`,
      link: `/incidents/${i.id}`,
    });
  }

  if (overdueMaintenanceCount > 0) {
    alerts.push({
      severity: 'warning', entityType: 'maintenance', entityId: '',
      title: `${overdueMaintenanceCount} Overdue Service${overdueMaintenanceCount > 1 ? 's' : ''}`,
      description: `Vehicles with overdue scheduled maintenance.`,
      link: '/maintenance/schedules',
    });
  }

  if (highAnomalies > 5) {
    alerts.push({
      severity: 'info', entityType: 'anomaly', entityId: '',
      title: `${highAnomalies} Transactions with Anomalies (Last 7 Days)`,
      description: 'Review flagged fuel transactions.',
      link: '/anomalies',
    });
  }

  res.json(ok(alerts.slice(0, 10)));
});

export default router;
