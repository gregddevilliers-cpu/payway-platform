import { PrismaClient } from '@prisma/client';

/** km/L — returns null if invalid/unreasonable */
export function calculateEfficiency(
  currentOdometer: number,
  previousOdometer: number,
  litres: number,
): number | null {
  if (!currentOdometer || !previousOdometer || !litres || litres <= 0) return null;
  const km = currentOdometer - previousOdometer;
  if (km <= 0) return null;
  const kpl = km / litres;
  if (kpl < 1 || kpl > 30) return null; // unreasonable
  return Math.round(kpl * 100) / 100;
}

/** Convert km/L to L/100km */
export function calculateLitresPer100km(kmPerLitre: number): number {
  if (kmPerLitre <= 0) return 0;
  return Math.round((100 / kmPerLitre) * 100) / 100;
}

/** ZAR per km */
export function calculateCostPerKm(totalCost: number, kmDriven: number): number | null {
  if (kmDriven <= 0 || totalCost <= 0) return null;
  return Math.round((totalCost / kmDriven) * 100) / 100;
}

/**
 * Rolling average efficiency (km/L) over the last N transactions for a vehicle.
 */
export async function getVehicleRollingAverage(
  vehicleId: string,
  transactionCount: number = 10,
  prisma: PrismaClient,
): Promise<number | null> {
  const txns = await prisma.fuelTransaction.findMany({
    where: { vehicleId },
    orderBy: { transactionDate: 'desc' },
    take: transactionCount,
    select: { fuelEfficiency: true },
  });

  const values = txns
    .map((t) => (t.fuelEfficiency ? Number(t.fuelEfficiency) : null))
    .filter((v): v is number => v !== null);

  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

/**
 * Average L/100km across all vehicles in a fleet for a date range.
 */
export async function getFleetAverageEfficiency(
  fleetId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
): Promise<number | null> {
  const txns = await prisma.fuelTransaction.findMany({
    where: {
      fleetId,
      transactionDate: { gte: dateFrom, lte: dateTo },
      fuelEfficiency: { not: null },
    },
    select: { fuelEfficiency: true },
  });

  if (txns.length === 0) return null;

  const kplValues = txns
    .map((t) => (t.fuelEfficiency ? Number(t.fuelEfficiency) : null))
    .filter((v): v is number => v !== null);

  if (kplValues.length === 0) return null;
  const avgKpl = kplValues.reduce((a, b) => a + b, 0) / kplValues.length;
  return calculateLitresPer100km(avgKpl);
}

type EfficiencyRating = 'excellent' | 'good' | 'below_average' | 'poor';

interface DriverEfficiencyScore {
  driverAvgKpl: number | null;
  driverAvgL100km: number | null;
  fleetAvgL100km: number | null;
  percentageDifference: number | null;
  rating: EfficiencyRating | null;
}

/**
 * Driver efficiency vs fleet average.
 */
export async function getDriverEfficiencyScore(
  driverId: string,
  dateFrom: Date,
  dateTo: Date,
  prisma: PrismaClient,
): Promise<DriverEfficiencyScore> {
  const driverTxns = await prisma.fuelTransaction.findMany({
    where: {
      driverId,
      transactionDate: { gte: dateFrom, lte: dateTo },
      fuelEfficiency: { not: null },
    },
    select: { fuelEfficiency: true, fleetId: true },
  });

  if (driverTxns.length === 0) {
    return { driverAvgKpl: null, driverAvgL100km: null, fleetAvgL100km: null, percentageDifference: null, rating: null };
  }

  const kplValues = driverTxns
    .map((t) => Number(t.fuelEfficiency))
    .filter((v) => v > 0);

  if (kplValues.length === 0) {
    return { driverAvgKpl: null, driverAvgL100km: null, fleetAvgL100km: null, percentageDifference: null, rating: null };
  }

  const driverAvgKpl = kplValues.reduce((a, b) => a + b, 0) / kplValues.length;
  const driverAvgL100km = calculateLitresPer100km(driverAvgKpl);

  // Use the driver's fleet for comparison
  const fleetId = driverTxns[0]!.fleetId;
  const fleetAvgL100km = await getFleetAverageEfficiency(fleetId, dateFrom, dateTo, prisma);

  let rating: EfficiencyRating | null = null;
  let percentageDifference: number | null = null;

  if (fleetAvgL100km != null && driverAvgL100km != null) {
    // Lower l/100km is better — negative diff means driver is more efficient
    percentageDifference = Math.round(((driverAvgL100km - fleetAvgL100km) / fleetAvgL100km) * 100 * 100) / 100;
    if (percentageDifference < -10) rating = 'excellent';
    else if (percentageDifference <= 10) rating = 'good';
    else if (percentageDifference <= 20) rating = 'below_average';
    else rating = 'poor';
  }

  return {
    driverAvgKpl: Math.round(driverAvgKpl * 100) / 100,
    driverAvgL100km,
    fleetAvgL100km,
    percentageDifference,
    rating,
  };
}
