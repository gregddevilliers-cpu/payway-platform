import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';

const router = Router();

router.use(authenticate);

// ─── GET /api/v1/search?q=&limit= ────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const q = ((req.query.q as string) ?? '').trim();
  const limit = Math.min(parseInt((req.query.limit as string) ?? '5', 10), 10);

  if (!q || q.length < 2) {
    res.status(400).json(fail('Search query must be at least 2 characters'));
    return;
  }

  const operatorId = getOperatorScope(req);
  const opWhere = operatorId ? { operatorId } : {};
  const pattern = `%${q}%`;

  const [vehicles, drivers, fleets, incidents] = await Promise.all([
    // Vehicles — search registration, make, model, VIN
    prisma.vehicle.findMany({
      where: {
        ...opWhere,
        deletedAt: null,
        OR: [
          { registrationNumber: { contains: q, mode: 'insensitive' } },
          { make: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
          { vinNumber: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, registrationNumber: true, make: true, model: true, status: true },
      take: limit,
    }),

    // Drivers — search name, mobile
    prisma.driver.findMany({
      where: {
        ...opWhere,
        deletedAt: null,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { mobileNumber: { contains: q, mode: 'insensitive' } },
          { licenceNumber: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, mobileNumber: true, status: true },
      take: limit,
    }),

    // Fleets — search name, code
    prisma.fleet.findMany({
      where: {
        ...opWhere,
        deletedAt: null,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, name: true, code: true, status: true,
        _count: { select: { vehicles: true } },
      },
      take: limit,
    }),

    // Incidents — search incident number, description
    prisma.incident.findMany({
      where: {
        ...opWhere,
        deletedAt: null,
        OR: [
          { incidentNumber: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, incidentNumber: true, description: true, incidentDate: true, severity: true },
      take: limit,
    }),
  ]);

  // Suppress unused variable warning
  void pattern;

  res.json(ok({
    vehicles,
    drivers,
    fleets: fleets.map((f) => ({ id: f.id, name: f.name, code: f.code, status: f.status, vehicleCount: f._count.vehicles })),
    incidents,
  }));
});

export default router;
