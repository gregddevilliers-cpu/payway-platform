import { PrismaClient, RepairJob } from '@prisma/client';

/**
 * Generate next repair number in format REP-YYYYMM-NNNN.
 */
export async function generateRepairNumber(prisma: PrismaClient): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `REP-${year}${month}-`;

  const last = await prisma.repairJob.findFirst({
    where: { repairNumber: { startsWith: prefix } },
    orderBy: { repairNumber: 'desc' },
    select: { repairNumber: true },
  });

  let seq = 1;
  if (last) {
    const parts = last.repairNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1] ?? '0', 10);
    seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Valid status transitions for repair jobs.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  reported: ['assessed', 'cancelled'],
  assessed: ['quoted', 'cancelled'],
  quoted: ['in_progress', 'cancelled'],
  in_progress: ['quality_check', 'cancelled'],
  quality_check: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function validateStatusTransition(current: string, next: string): boolean {
  return VALID_TRANSITIONS[current]?.includes(next) ?? false;
}

/**
 * Handle vehicle status side effects when a repair job changes status.
 * Called AFTER the repair job has been updated.
 */
export async function handleStatusChange(
  repairJob: RepairJob,
  newStatus: string,
  prisma: PrismaClient,
): Promise<void> {
  if (newStatus === 'in_progress') {
    await prisma.vehicle.update({
      where: { id: repairJob.vehicleId },
      data: { status: 'maintenance' },
    });
  } else if (newStatus === 'completed') {
    await prisma.vehicle.update({
      where: { id: repairJob.vehicleId },
      data: { status: 'active' },
    });
  } else if (newStatus === 'cancelled') {
    // Only revert vehicle to active if no other in_progress repairs
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: repairJob.vehicleId },
      select: { status: true },
    });
    if (vehicle?.status === 'maintenance') {
      const otherInProgress = await prisma.repairJob.count({
        where: {
          vehicleId: repairJob.vehicleId,
          id: { not: repairJob.id },
          status: 'in_progress',
          deletedAt: null,
        },
      });
      if (otherInProgress === 0) {
        await prisma.vehicle.update({
          where: { id: repairJob.vehicleId },
          data: { status: 'active' },
        });
      }
    }
  }
}

/**
 * Check if a completed repair for this vehicle+type is still under warranty.
 * Returns the repair job if a warranty claim applies, else null.
 */
export async function checkWarrantyRecurrence(
  vehicleId: string,
  repairType: string,
  prisma: PrismaClient,
): Promise<RepairJob | null> {
  const now = new Date();
  return prisma.repairJob.findFirst({
    where: {
      vehicleId,
      repairType,
      status: 'completed',
      warrantyExpiry: { gt: now },
      deletedAt: null,
    },
    orderBy: { actualCompletion: 'desc' },
  });
}
