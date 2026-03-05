import type { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { logAction } from './auditService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TAG_STATUSES = [
  'unassigned',
  'active',
  'blocked',
  'lost',
  'expired',
  'decommissioned',
] as const;

export type TagStatus = (typeof TAG_STATUSES)[number];

export const BLOCKED_REASONS = [
  'stolen',
  'damaged',
  'fraud_suspected',
  'operator_request',
  'system_block',
  'other',
] as const;

export type BlockedReason = (typeof BLOCKED_REASONS)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Notify fleet manager + operator admin (stub — replace with real notification service) */
async function sendTagAlert(
  message: string,
  _operatorId: string,
  _prisma: PrismaClient,
): Promise<void> {
  // TODO: implement when notification service is available
  console.warn(`[TagAlert] ${message}`);
}

// ---------------------------------------------------------------------------
// Tag CRUD helpers
// ---------------------------------------------------------------------------

export async function getTagById(tagId: string, operatorId: string, prisma: PrismaClient) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, operatorId, deletedAt: null },
    include: {
      vehicle: {
        select: { id: true, registrationNumber: true, make: true, model: true },
      },
      histories: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!tag) throw new AppError(404, `Tag not found`);
  return tag;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Assign a tag to a vehicle.
 * Validates: tag exists, tag is unassigned, vehicle has no existing active tag.
 */
export async function assignTag(
  tagId: string,
  vehicleId: string,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, operatorId, deletedAt: null },
  });
  if (!tag) throw new AppError(404, 'Tag not found');
  if (tag.status !== 'unassigned') {
    throw new AppError(400, `Tag cannot be assigned — current status is "${tag.status}"`);
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, operatorId, deletedAt: null },
  });
  if (!vehicle) throw new AppError(404, 'Vehicle not found');

  // Check if vehicle already has an active tag
  const existingActiveTag = await prisma.tag.findFirst({
    where: { vehicleId, operatorId, status: 'active', deletedAt: null },
  });
  if (existingActiveTag) {
    throw new AppError(
      409,
      `Vehicle already has an active tag (${existingActiveTag.tagNumber}). Unassign or block it first.`,
    );
  }

  const now = new Date();
  const isFirstAssignment = !tag.issuedDate;

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTag = await tx.tag.update({
      where: { id: tagId },
      data: {
        vehicleId,
        status: 'active',
        activatedAt: now,
        issuedDate: isFirstAssignment ? now : tag.issuedDate,
      },
    });

    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { tagStatus: 'active' },
    });

    await tx.tagHistory.create({
      data: {
        tagId,
        operatorId,
        action: 'assigned',
        toVehicleId: vehicleId,
        previousStatus: tag.status,
        newStatus: 'active',
        performedBy: userId,
      },
    });

    return updatedTag;
  });

  await logAction({
    operatorId, userId, action: 'assignment', entityType: 'tag', entityId: tagId, metadata: { vehicleId, status: 'active' },
  });

  return updated;
}

/**
 * Unassign a tag from its current vehicle.
 */
export async function unassignTag(
  tagId: string,
  userId: string,
  operatorId: string,
  reason: string | undefined,
  prisma: PrismaClient,
) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, operatorId, deletedAt: null },
  });
  if (!tag) throw new AppError(404, 'Tag not found');
  if (!tag.vehicleId) throw new AppError(400, 'Tag is not currently assigned to a vehicle');

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTag = await tx.tag.update({
      where: { id: tagId },
      data: { vehicleId: null, status: 'unassigned', activatedAt: null },
    });

    await tx.vehicle.update({
      where: { id: tag.vehicleId! },
      data: { tagStatus: 'unassigned' },
    });

    await tx.tagHistory.create({
      data: {
        tagId,
        operatorId,
        action: 'unassigned',
        fromVehicleId: tag.vehicleId,
        previousStatus: tag.status,
        newStatus: 'unassigned',
        reason: reason ?? null,
        performedBy: userId,
      },
    });

    return updatedTag;
  });

  await logAction({
    operatorId, userId, action: 'assignment', entityType: 'tag', entityId: tagId, metadata: { vehicleId: tag.vehicleId },
  });

  return updated;
}

/**
 * Block a tag. Reason is required.
 */
export async function blockTag(
  tagId: string,
  reason: BlockedReason,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  if (!BLOCKED_REASONS.includes(reason)) {
    throw new AppError(400, `Invalid block reason. Must be one of: ${BLOCKED_REASONS.join(', ')}`);
  }

  const tag = await prisma.tag.findFirst({
    where: { id: tagId, operatorId, deletedAt: null },
  });
  if (!tag) throw new AppError(404, 'Tag not found');
  if (tag.status === 'blocked') throw new AppError(400, 'Tag is already blocked');
  if (['lost', 'decommissioned'].includes(tag.status)) {
    throw new AppError(400, `Cannot block a tag with status "${tag.status}"`);
  }

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTag = await tx.tag.update({
      where: { id: tagId },
      data: { status: 'blocked', blockedReason: reason, blockedAt: now },
    });

    if (tag.vehicleId) {
      await tx.vehicle.update({
        where: { id: tag.vehicleId },
        data: { tagStatus: 'blocked' },
      });
    }

    await tx.tagHistory.create({
      data: {
        tagId,
        operatorId,
        action: 'blocked',
        fromVehicleId: tag.vehicleId ?? null,
        previousStatus: tag.status,
        newStatus: 'blocked',
        reason,
        performedBy: userId,
      },
    });

    return updatedTag;
  });

  await logAction({
    operatorId, userId, action: 'status_change', entityType: 'tag', entityId: tagId, metadata: { status: 'blocked', reason },
  });

  await sendTagAlert(
    `Tag ${tag.tagNumber} has been BLOCKED. Reason: ${reason}`,
    operatorId,
    prisma,
  );

  return updated;
}

/**
 * Unblock a blocked tag.
 */
export async function unblockTag(
  tagId: string,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, operatorId, deletedAt: null },
  });
  if (!tag) throw new AppError(404, 'Tag not found');
  if (tag.status !== 'blocked') {
    throw new AppError(400, `Only blocked tags can be unblocked. Current status: "${tag.status}"`);
  }

  // Determine new status: active if vehicle is assigned, else unassigned
  const newStatus: TagStatus = tag.vehicleId ? 'active' : 'unassigned';

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTag = await tx.tag.update({
      where: { id: tagId },
      data: {
        status: newStatus,
        blockedReason: null,
        blockedAt: null,
        activatedAt: newStatus === 'active' ? new Date() : null,
      },
    });

    if (tag.vehicleId) {
      await tx.vehicle.update({
        where: { id: tag.vehicleId },
        data: { tagStatus: newStatus },
      });
    }

    await tx.tagHistory.create({
      data: {
        tagId,
        operatorId,
        action: 'unblocked',
        toVehicleId: tag.vehicleId ?? null,
        previousStatus: 'blocked',
        newStatus,
        performedBy: userId,
      },
    });

    return updatedTag;
  });

  await logAction({
    operatorId, userId, action: 'status_change', entityType: 'tag', entityId: tagId, metadata: { status: newStatus },
  });

  return updated;
}

/**
 * Report a tag as lost. Automatically sets status to "lost" (not blocked).
 */
export async function reportLost(
  tagId: string,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, operatorId, deletedAt: null },
  });
  if (!tag) throw new AppError(404, 'Tag not found');
  if (['lost', 'decommissioned', 'expired'].includes(tag.status)) {
    throw new AppError(400, `Cannot report lost — current status is "${tag.status}"`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTag = await tx.tag.update({
      where: { id: tagId },
      data: {
        status: 'lost',
        blockedReason: null,
        blockedAt: null,
      },
    });

    if (tag.vehicleId) {
      await tx.vehicle.update({
        where: { id: tag.vehicleId },
        data: { tagStatus: 'unassigned' },
      });
    }

    await tx.tagHistory.create({
      data: {
        tagId,
        operatorId,
        action: 'lost_reported',
        fromVehicleId: tag.vehicleId ?? null,
        previousStatus: tag.status,
        newStatus: 'lost',
        performedBy: userId,
      },
    });

    return updatedTag;
  });

  await logAction({
    operatorId, userId, action: 'status_change', entityType: 'tag', entityId: tagId, metadata: { status: 'lost' },
  });

  await sendTagAlert(`Tag ${tag.tagNumber} has been reported LOST.`, operatorId, prisma);

  return updated;
}

/**
 * Replace one tag with another on the same vehicle.
 */
export async function replaceTag(
  oldTagId: string,
  newTagId: string,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const oldTag = await prisma.tag.findFirst({
    where: { id: oldTagId, operatorId, deletedAt: null },
  });
  if (!oldTag) throw new AppError(404, 'Existing tag not found');
  if (!['active', 'blocked', 'lost'].includes(oldTag.status)) {
    throw new AppError(400, 'Can only replace an active, blocked, or lost tag');
  }

  const newTag = await prisma.tag.findFirst({
    where: { id: newTagId, operatorId, deletedAt: null },
  });
  if (!newTag) throw new AppError(404, 'Replacement tag not found');
  if (newTag.status !== 'unassigned') {
    throw new AppError(400, `Replacement tag must be unassigned. Current status: "${newTag.status}"`);
  }

  const vehicleId = oldTag.vehicleId;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Block old tag
    await tx.tag.update({
      where: { id: oldTagId },
      data: { status: 'blocked', blockedReason: 'other', blockedAt: now, vehicleId: null },
    });
    await tx.tagHistory.create({
      data: {
        tagId: oldTagId,
        operatorId,
        action: 'replaced',
        fromVehicleId: vehicleId ?? null,
        previousStatus: oldTag.status,
        newStatus: 'blocked',
        reason: 'Replaced by tag ' + newTag.tagNumber,
        performedBy: userId,
      },
    });

    // Assign new tag
    await tx.tag.update({
      where: { id: newTagId },
      data: {
        vehicleId: vehicleId ?? null,
        status: vehicleId ? 'active' : 'unassigned',
        activatedAt: vehicleId ? now : null,
        issuedDate: now,
      },
    });
    await tx.tagHistory.create({
      data: {
        tagId: newTagId,
        operatorId,
        action: 'assigned',
        toVehicleId: vehicleId ?? null,
        previousStatus: 'unassigned',
        newStatus: vehicleId ? 'active' : 'unassigned',
        reason: 'Replacement for tag ' + oldTag.tagNumber,
        performedBy: userId,
      },
    });

    if (vehicleId) {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { tagStatus: 'active' },
      });
    }
  });

  await logAction({
    operatorId, userId, action: 'update', entityType: 'tag', entityId: oldTagId,
    metadata: { from: { tagId: oldTagId }, to: { tagId: newTagId } },
  });

  return { oldTagId, newTagId, vehicleId };
}

/**
 * Transfer a tag from one vehicle to another.
 */
export async function transferTag(
  tagId: string,
  fromVehicleId: string,
  toVehicleId: string,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, operatorId, deletedAt: null },
  });
  if (!tag) throw new AppError(404, 'Tag not found');
  if (tag.status !== 'active') throw new AppError(400, 'Only active tags can be transferred');
  if (tag.vehicleId !== fromVehicleId) throw new AppError(400, 'Tag is not assigned to the specified source vehicle');

  const toVehicle = await prisma.vehicle.findFirst({
    where: { id: toVehicleId, operatorId, deletedAt: null },
  });
  if (!toVehicle) throw new AppError(404, 'Destination vehicle not found');

  // Check destination vehicle doesn't already have an active tag
  const existingTag = await prisma.tag.findFirst({
    where: { vehicleId: toVehicleId, status: 'active', deletedAt: null },
  });
  if (existingTag) {
    throw new AppError(409, `Destination vehicle already has an active tag (${existingTag.tagNumber})`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTag = await tx.tag.update({
      where: { id: tagId },
      data: { vehicleId: toVehicleId },
    });

    await tx.vehicle.update({ where: { id: fromVehicleId }, data: { tagStatus: 'unassigned' } });
    await tx.vehicle.update({ where: { id: toVehicleId }, data: { tagStatus: 'active' } });

    await tx.tagHistory.create({
      data: {
        tagId,
        operatorId,
        action: 'transferred',
        fromVehicleId,
        toVehicleId,
        previousStatus: 'active',
        newStatus: 'active',
        performedBy: userId,
      },
    });

    return updatedTag;
  });

  await logAction({
    operatorId, userId, action: 'assignment', entityType: 'tag', entityId: tagId,
    metadata: { from: fromVehicleId, to: toVehicleId },
  });

  return updated;
}

/**
 * Check all tags for expiry and mark them expired.
 * Called by a scheduled job or manually.
 */
export async function checkTagExpiry(operatorId: string | null, prisma: PrismaClient): Promise<number> {
  const today = new Date();

  const expiredTags = await prisma.tag.findMany({
    where: {
      ...(operatorId ? { operatorId } : {}),
      expiryDate: { lt: today },
      status: 'active',
      deletedAt: null,
    },
  });

  if (expiredTags.length === 0) return 0;

  for (const tag of expiredTags) {
    await prisma.$transaction(async (tx) => {
      await tx.tag.update({
        where: { id: tag.id },
        data: { status: 'expired' },
      });

      if (tag.vehicleId) {
        await tx.vehicle.update({
          where: { id: tag.vehicleId },
          data: { tagStatus: 'unassigned' },
        });
      }

      await tx.tagHistory.create({
        data: {
          tagId: tag.id,
          operatorId: tag.operatorId,
          action: 'expired',
          fromVehicleId: tag.vehicleId ?? null,
          previousStatus: 'active',
          newStatus: 'expired',
          reason: 'Automatic expiry check',
          performedBy: 'system',
        },
      });
    });
  }

  return expiredTags.length;
}

/**
 * Decommission a tag permanently.
 */
export async function decommissionTag(
  tagId: string,
  userId: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, operatorId, deletedAt: null },
  });
  if (!tag) throw new AppError(404, 'Tag not found');
  if (tag.status === 'active') {
    throw new AppError(400, 'Cannot decommission an active tag. Unassign it first.');
  }
  if (tag.vehicleId) {
    throw new AppError(400, 'Tag is still assigned to a vehicle. Unassign it first.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedTag = await tx.tag.update({
      where: { id: tagId },
      data: { status: 'decommissioned' },
    });

    await tx.tagHistory.create({
      data: {
        tagId,
        operatorId,
        action: 'decommissioned',
        previousStatus: tag.status,
        newStatus: 'decommissioned',
        performedBy: userId,
      },
    });

    return updatedTag;
  });

  await logAction({
    operatorId, userId, action: 'status_change', entityType: 'tag', entityId: tagId,
    metadata: { status: 'decommissioned' },
  });

  return updated;
}

/**
 * Authorisation gate for fuel transactions.
 * Returns the tag if active, throws descriptive error otherwise.
 */
export async function getTagForTransaction(
  tagNumber: string,
  operatorId: string,
  prisma: PrismaClient,
) {
  const tag = await prisma.tag.findFirst({
    where: { tagNumber, operatorId, deletedAt: null },
    include: {
      vehicle: { select: { id: true, registrationNumber: true } },
    },
  });

  if (!tag) {
    throw new AppError(404, `Tag ${tagNumber} not found`);
  }

  if (tag.status !== 'active') {
    const reasonSuffix = tag.blockedReason ? `: ${tag.blockedReason}` : '';
    throw new AppError(403, `Tag ${tagNumber} is ${tag.status}${reasonSuffix}`);
  }

  return tag;
}

/**
 * Get summary stats for dashboard.
 */
export async function getTagSummary(operatorId: string, prisma: PrismaClient) {
  const counts = await prisma.tag.groupBy({
    by: ['status'],
    where: { operatorId, deletedAt: null },
    _count: { status: true },
  });

  const summary: Record<string, number> = {
    total: 0,
    unassigned: 0,
    active: 0,
    blocked: 0,
    lost: 0,
    expired: 0,
    decommissioned: 0,
  };

  for (const row of counts) {
    const count = row._count.status;
    summary[row.status] = count;
    summary['total'] = (summary['total'] ?? 0) + count;
  }

  return summary;
}
