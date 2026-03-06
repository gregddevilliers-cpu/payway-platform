import { PrismaClient } from '@prisma/client';

/**
 * Generate next incident number in format INC-YYYYMM-NNNN.
 */
export async function generateIncidentNumber(prisma: PrismaClient): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `INC-${year}${month}-`;

  // Find the highest sequence this month
  const last = await prisma.incident.findFirst({
    where: { incidentNumber: { startsWith: prefix } },
    orderBy: { incidentNumber: 'desc' },
    select: { incidentNumber: true },
  });

  let seq = 1;
  if (last) {
    const parts = last.incidentNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1] ?? '0', 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Number of whole days between two dates (returns 0 if same day).
 */
export function calculateDowntimeDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Total costEstimate and payoutAmount for all incidents on a vehicle.
 */
export async function getIncidentCostSummary(
  vehicleId: string,
  prisma: PrismaClient,
): Promise<{ totalCostEstimate: number; totalPayoutAmount: number; incidentCount: number }> {
  const incidents = await prisma.incident.findMany({
    where: { vehicleId, deletedAt: null },
    select: { costEstimate: true, payoutAmount: true },
  });

  return {
    incidentCount: incidents.length,
    totalCostEstimate: incidents.reduce((s, i) => s + (i.costEstimate ? Number(i.costEstimate) : 0), 0),
    totalPayoutAmount: incidents.reduce((s, i) => s + (i.payoutAmount ? Number(i.payoutAmount) : 0), 0),
  };
}

/**
 * Count incidents for a driver in the last N months.
 */
export async function getDriverIncidentCount(
  driverId: string,
  monthsBack: number,
  prisma: PrismaClient,
): Promise<number> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  return prisma.incident.count({
    where: {
      driverId,
      deletedAt: null,
      incidentDate: { gte: since },
    },
  });
}
