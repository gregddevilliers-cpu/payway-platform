import { PrismaClient } from '@prisma/client';
import { getVehicleRollingAverage, calculateEfficiency } from './fuelEfficiencyService';

export interface AnomalyFlag {
  code: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolution?: 'dismissed' | 'confirmed' | 'under_review' | null;
}

interface TransactionForDetection {
  id: string;
  operatorId: string;
  vehicleId: string;
  driverId: string;
  fleetId: string;
  transactionDate: Date;
  litresFilled: number | { toNumber: () => number };
  totalAmount: number | { toNumber: () => number };
  fuelType: string;
  odometer: number | null;
}

function toNum(v: number | { toNumber: () => number }): number {
  return typeof v === 'number' ? v : v.toNumber();
}

// ─── Point-in-polygon (ray casting) ──────────────────────────────────────────
// coordinates in [lng, lat] order matching GeoJSON
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── Standard deviation helper ────────────────────────────────────────────────
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ─── Main detection function ──────────────────────────────────────────────────
export async function detectAnomalies(
  transaction: TransactionForDetection,
  prisma: PrismaClient,
): Promise<AnomalyFlag[]> {
  const flags: AnomalyFlag[] = [];
  const txDate = new Date(transaction.transactionDate);
  const litres = toNum(transaction.litresFilled);
  const totalAmount = toNum(transaction.totalAmount);

  // Fetch vehicle, driver, fleet in parallel
  const [vehicle, driver, fleet] = await Promise.all([
    prisma.vehicle.findFirst({
      where: { id: transaction.vehicleId },
      select: { tankCapacity: true, fuelType: true },
    }),
    prisma.driver.findFirst({
      where: { id: transaction.driverId },
      select: { dailySpendLimit: true, monthlySpendLimit: true },
    }),
    prisma.fleet.findFirst({
      where: { id: transaction.fleetId },
      select: { id: true },
    }),
  ]);

  // ── 1. double_fill: another transaction for the same vehicle within 2 hours ──
  const twoHoursAgo = new Date(txDate.getTime() - 2 * 60 * 60 * 1000);
  const twoHoursAhead = new Date(txDate.getTime() + 2 * 60 * 60 * 1000);
  const nearby = await prisma.fuelTransaction.count({
    where: {
      vehicleId: transaction.vehicleId,
      id: { not: transaction.id },
      transactionDate: { gte: twoHoursAgo, lte: twoHoursAhead },
    },
  });
  if (nearby > 0) {
    flags.push({
      code: 'double_fill',
      severity: 'high',
      description: 'Another fuel transaction for this vehicle was recorded within 2 hours.',
    });
  }

  // ── 2. overfill: litres > vehicle tank capacity ────────────────────────────
  if (vehicle?.tankCapacity) {
    const cap = toNum(vehicle.tankCapacity as unknown as { toNumber: () => number });
    if (litres > cap) {
      flags.push({
        code: 'overfill',
        severity: 'high',
        description: `Litres filled (${litres.toFixed(1)}L) exceeds vehicle tank capacity (${cap.toFixed(1)}L).`,
      });
    }
  }

  // ── 3. fuel_type_mismatch ─────────────────────────────────────────────────
  if (vehicle?.fuelType && vehicle.fuelType !== transaction.fuelType) {
    flags.push({
      code: 'fuel_type_mismatch',
      severity: 'high',
      description: `Fuel type '${transaction.fuelType}' does not match vehicle's expected type '${vehicle.fuelType}'.`,
    });
  }

  // ── 4. off_hours: outside 05:00–22:00 SAST (UTC+2) ───────────────────────
  const hourSAST = (txDate.getUTCHours() + 2) % 24;
  if (hourSAST < 5 || hourSAST >= 22) {
    flags.push({
      code: 'off_hours',
      severity: 'low',
      description: `Transaction recorded at ${hourSAST.toString().padStart(2, '0')}:${txDate.getUTCMinutes().toString().padStart(2, '0')} SAST — outside normal operating hours (05:00–22:00).`,
    });
  }

  // ── 5. high_frequency: more than 3 transactions for vehicle today ─────────
  const dayStart = new Date(txDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dailyCount = await prisma.fuelTransaction.count({
    where: {
      vehicleId: transaction.vehicleId,
      id: { not: transaction.id },
      transactionDate: { gte: dayStart, lt: dayEnd },
    },
  });
  if (dailyCount >= 3) {
    flags.push({
      code: 'high_frequency',
      severity: 'medium',
      description: `This vehicle has had ${dailyCount + 1} fuel transactions today — unusually high frequency.`,
    });
  }

  // ── 6. daily_spend_limit_breach ───────────────────────────────────────────
  if (driver?.dailySpendLimit) {
    const dailySpend = await prisma.fuelTransaction.aggregate({
      where: {
        driverId: transaction.driverId,
        id: { not: transaction.id },
        transactionDate: { gte: dayStart, lt: dayEnd },
      },
      _sum: { totalAmount: true },
    });
    const spent = toNum((dailySpend._sum.totalAmount ?? 0) as unknown as { toNumber: () => number });
    const limit = toNum(driver.dailySpendLimit as unknown as { toNumber: () => number });
    if (spent + totalAmount > limit) {
      flags.push({
        code: 'daily_spend_limit_breach',
        severity: 'high',
        description: `Driver's daily spend limit of R${limit.toFixed(2)} exceeded. Total today: R${(spent + totalAmount).toFixed(2)}.`,
      });
    }
  }

  // ── 7. monthly_spend_limit_breach ─────────────────────────────────────────
  if (driver?.monthlySpendLimit) {
    const monthStart = new Date(txDate.getFullYear(), txDate.getMonth(), 1);
    const monthEnd = new Date(txDate.getFullYear(), txDate.getMonth() + 1, 1);
    const monthlySpend = await prisma.fuelTransaction.aggregate({
      where: {
        driverId: transaction.driverId,
        id: { not: transaction.id },
        transactionDate: { gte: monthStart, lt: monthEnd },
      },
      _sum: { totalAmount: true },
    });
    const spent = toNum((monthlySpend._sum.totalAmount ?? 0) as unknown as { toNumber: () => number });
    const limit = toNum(driver.monthlySpendLimit as unknown as { toNumber: () => number });
    if (spent + totalAmount > limit) {
      flags.push({
        code: 'monthly_spend_limit_breach',
        severity: 'high',
        description: `Driver's monthly spend limit of R${limit.toFixed(2)} exceeded. Total this month: R${(spent + totalAmount).toFixed(2)}.`,
      });
    }
  }

  // ── 8. efficiency_outlier: >2 std deviations from rolling average ─────────
  if (transaction.odometer != null) {
    const recentTxns = await prisma.fuelTransaction.findMany({
      where: {
        vehicleId: transaction.vehicleId,
        id: { not: transaction.id },
        odometer: { not: null },
        fuelEfficiency: { not: null },
      },
      orderBy: { transactionDate: 'desc' },
      take: 20,
      select: { fuelEfficiency: true, odometer: true },
    });

    if (recentTxns.length >= 5) {
      const efficiencies = recentTxns.map((t) =>
        toNum(t.fuelEfficiency as unknown as { toNumber: () => number }),
      );
      const mean = efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length;
      const sd = stdDev(efficiencies);

      // Calculate efficiency for this transaction
      const prevOdometer = recentTxns[0].odometer!;
      const thisEfficiency = calculateEfficiency(transaction.odometer, prevOdometer, litres);
      if (thisEfficiency != null && sd > 0) {
        const zScore = Math.abs((thisEfficiency - mean) / sd);
        if (zScore > 2) {
          flags.push({
            code: 'efficiency_outlier',
            severity: 'medium',
            description: `Fuel efficiency (${thisEfficiency.toFixed(2)} km/L) is ${zScore.toFixed(1)} standard deviations from this vehicle's average (${mean.toFixed(2)} km/L).`,
          });
        }
      }
    }
  }

  // ── 9. geofence_violation (only if fleet has geofence data) ──────────────
  // Fleet model doesn't yet have a geofence column — skip if not present
  // This check is implemented for future use when geofence field is added
  if (fleet && transaction.odometer != null) {
    // Placeholder: fleet geofence check would go here
    // const geofence = (fleet as any).geofence;
    // if (geofence && transaction.latitude != null && transaction.longitude != null) { ... }
  }

  return flags;
}

// ─── Resolve anomaly ──────────────────────────────────────────────────────────
export async function resolveAnomaly(
  transactionId: string,
  flagCode: string,
  resolution: 'dismissed' | 'confirmed' | 'under_review',
  userId: string,
  prisma: PrismaClient,
): Promise<void> {
  const txn = await prisma.fuelTransaction.findFirst({ where: { id: transactionId } });
  if (!txn) throw new Error('Transaction not found');

  const existing = (txn.anomalyFlags as unknown as AnomalyFlag[]) ?? [];
  const flags = existing.map((f) =>
    f.code === flagCode
      ? { ...f, resolution, resolvedAt: new Date().toISOString(), resolvedBy: userId }
      : f,
  );

  await prisma.fuelTransaction.update({
    where: { id: transactionId },
    data: { anomalyFlags: flags as unknown as import('@prisma/client').Prisma.InputJsonValue },
  });
}
