import { PrismaClient, MaintenanceRecord, MaintenanceSchedule } from '@prisma/client';

/**
 * When a maintenance record is completed, update the linked schedule:
 * set lastServiceDate/Odometer, calculate nextDueDate and nextDueOdometer.
 */
export async function calculateNextService(
  schedule: MaintenanceSchedule,
  completedRecord: MaintenanceRecord,
  prisma: PrismaClient,
): Promise<void> {
  const lastDate = completedRecord.serviceDate;
  const lastOdometer = completedRecord.odometer ?? null;

  let nextDueDate: Date | null = null;
  if (schedule.intervalMonths && lastDate) {
    nextDueDate = new Date(lastDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + schedule.intervalMonths);
  }

  let nextDueOdometer: number | null = null;
  if (schedule.intervalKm && lastOdometer != null) {
    nextDueOdometer = lastOdometer + schedule.intervalKm;
  }

  await prisma.maintenanceSchedule.update({
    where: { id: schedule.id },
    data: {
      lastServiceDate: lastDate,
      lastServiceOdometer: lastOdometer,
      nextDueDate,
      nextDueOdometer,
    },
  });
}

/**
 * Return all active schedules where nextDueDate < today OR
 * vehicle.currentOdometer > nextDueOdometer.
 */
export async function getOverdueServices(
  operatorId: string,
  prisma: PrismaClient,
): Promise<
  (MaintenanceSchedule & { vehicle: { id: string; registrationNumber: string; make: string; model: string; currentOdometer: number | null } })[]
> {
  const today = new Date();

  const schedules = await prisma.maintenanceSchedule.findMany({
    where: {
      operatorId,
      isActive: true,
      OR: [
        { nextDueDate: { lt: today } },
        // nextDueOdometer check handled in-process below
      ],
    },
    include: {
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          make: true,
          model: true,
          currentOdometer: true,
        },
      },
    },
  });

  // Also add schedules where odometer is past due
  const odometerOverdue = await prisma.maintenanceSchedule.findMany({
    where: {
      operatorId,
      isActive: true,
      nextDueOdometer: { not: null },
      nextDueDate: { gte: today }, // not already included above
    },
    include: {
      vehicle: {
        select: {
          id: true,
          registrationNumber: true,
          make: true,
          model: true,
          currentOdometer: true,
        },
      },
    },
  });

  const odometerFiltered = odometerOverdue.filter(
    (s) =>
      s.nextDueOdometer != null &&
      s.vehicle.currentOdometer != null &&
      s.vehicle.currentOdometer > s.nextDueOdometer,
  );

  // Merge, deduplicate by id
  const seen = new Set(schedules.map((s) => s.id));
  for (const s of odometerFiltered) {
    if (!seen.has(s.id)) {
      schedules.push(s);
      seen.add(s.id);
    }
  }

  return schedules as (MaintenanceSchedule & { vehicle: { id: string; registrationNumber: string; make: string; model: string; currentOdometer: number | null } })[];
}

/**
 * Return active schedules where nextDueDate is within `daysAhead` days from now.
 */
export async function getUpcomingServices(
  operatorId: string,
  daysAhead: number,
  prisma: PrismaClient,
): Promise<
  (MaintenanceSchedule & { vehicle: { id: string; registrationNumber: string; make: string; model: string } })[]
> {
  const today = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  return prisma.maintenanceSchedule.findMany({
    where: {
      operatorId,
      isActive: true,
      nextDueDate: { gte: today, lte: future },
    },
    include: {
      vehicle: {
        select: { id: true, registrationNumber: true, make: true, model: true },
      },
    },
    orderBy: { nextDueDate: 'asc' },
  }) as Promise<(MaintenanceSchedule & { vehicle: { id: string; registrationNumber: string; make: string; model: string } })[]>;
}

/**
 * Sum of cost for a vehicle within an optional date range.
 */
export async function getTotalMaintenanceCost(
  vehicleId: string,
  dateFrom: Date | null,
  dateTo: Date | null,
  prisma: PrismaClient,
): Promise<number> {
  const records = await prisma.maintenanceRecord.findMany({
    where: {
      vehicleId,
      deletedAt: null,
      ...(dateFrom || dateTo
        ? {
            serviceDate: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    },
    select: { cost: true },
  });

  return records.reduce((sum, r) => sum + (r.cost ? Number(r.cost) : 0), 0);
}
