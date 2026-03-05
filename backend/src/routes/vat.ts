import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getVatSummary,
  getVatByFleet,
  getVatByCostCentre,
  getMonthlyVatTrend,
} from '../services/vatService';

const router = Router();

router.use(authenticate);
const vatAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');

function parseDateRange(req: Request): { from: Date; to: Date } {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const from = dateFrom
    ? new Date(dateFrom)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = dateTo ? new Date(dateTo) : new Date();
  return { from, to };
}

// ---------------------------------------------------------------------------
// GET /api/v1/vat/summary
// ---------------------------------------------------------------------------
router.get('/summary', vatAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { from, to } = parseDateRange(req);
    const summary = await getVatSummary(operatorId, from, to, prisma);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/vat/by-fleet
// ---------------------------------------------------------------------------
router.get('/by-fleet', vatAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { from, to } = parseDateRange(req);
    const data = await getVatByFleet(operatorId, from, to, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/vat/by-cost-centre
// ---------------------------------------------------------------------------
router.get('/by-cost-centre', vatAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { from, to } = parseDateRange(req);
    const data = await getVatByCostCentre(operatorId, from, to, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/vat/trend
// ---------------------------------------------------------------------------
router.get('/trend', vatAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const months = Math.min(24, Math.max(1, parseInt((req.query.months as string) ?? '12', 10)));
    const data = await getMonthlyVatTrend(operatorId, months, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/vat/export — CSV export
// ---------------------------------------------------------------------------
router.post('/export', vatAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { dateFrom, dateTo, groupBy = 'fleet' } = req.body as {
      dateFrom?: string;
      dateTo?: string;
      groupBy?: 'fleet' | 'cost_centre' | 'month';
    };

    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = dateTo ? new Date(dateTo) : new Date();

    let rows: string[] = [];
    let header = '';

    if (groupBy === 'fleet') {
      const data = await getVatByFleet(operatorId, from, to, prisma);
      header = 'Fleet,Excl. VAT (ZAR),VAT (ZAR),Incl. VAT (ZAR)\n';
      rows = data.map(
        (r: any) => `"${r.fleetName}","${r.total.exclVat}","${r.total.vatAmount}","${r.total.inclVat}"`,
      );
    } else if (groupBy === 'cost_centre') {
      const data = await getVatByCostCentre(operatorId, from, to, prisma);
      header = 'Cost Centre,Code,Excl. VAT (ZAR),VAT (ZAR),Incl. VAT (ZAR)\n';
      rows = data.map(
        (r: any) =>
          `"${r.costCentreName}","${r.code}","${r.total.exclVat}","${r.total.vatAmount}","${r.total.inclVat}"`,
      );
    } else {
      const data = await getMonthlyVatTrend(operatorId, 12, prisma);
      header = 'Month,Year,Fuel VAT (ZAR),Maintenance VAT (ZAR),Repair VAT (ZAR),Total VAT (ZAR)\n';
      rows = data.map(
        (r: any) => `"${r.month}","${r.year}","${r.fuelVat}","${r.maintenanceVat}","${r.repairVat}","${r.totalVat}"`,
      );
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="vat-export.csv"');
    res.send(header + rows.join('\n'));
  } catch (err) {
    next(err);
  }
});

export default router;
