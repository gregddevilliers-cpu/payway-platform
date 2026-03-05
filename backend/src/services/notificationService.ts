import { PrismaClient, Prisma } from '@prisma/client';

export interface NotifyPayload {
  operatorId: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** Notify a specific user only. If omitted, notifies all admins/managers for the operator. */
  userId?: string;
}

/**
 * Create in-app notification records for the relevant users of an operator.
 *
 * Strategy:
 *   - If userId is provided, notify that user only.
 *   - Otherwise notify all super_admin + operator_admin + fleet_manager users
 *     belonging to the operator (or all super_admins if operatorId is unknown).
 *
 * Fire-and-forget: errors are logged but never thrown so callers don't fail.
 */
export async function notify(payload: NotifyPayload, prisma: PrismaClient): Promise<void> {
  try {
    let userIds: string[];

    if (payload.userId) {
      userIds = [payload.userId];
    } else {
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          OR: [
            { operatorId: payload.operatorId, role: { in: ['operator_admin', 'fleet_manager'] } },
            { role: 'super_admin' },
          ],
        },
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    }

    if (userIds.length === 0) return;

    await prisma.notification.createMany({
      data: userIds.map((uid) => ({
        userId: uid,
        operatorId: payload.operatorId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        metadata: (payload.metadata ?? {}) as unknown as Prisma.InputJsonValue,
      })),
    });
  } catch (err) {
    console.error('[notificationService] Failed to create notifications:', err);
  }
}
