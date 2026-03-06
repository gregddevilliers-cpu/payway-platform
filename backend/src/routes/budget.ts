import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { AppError } from '../middleware/errorHandler';
import {
  getFleetBudgetVariance,
  getCostCentreBudgetVariance,
  getVarianceTrend,
  getBudgetForecast,
  getBudgetAlerts,
  type BudgetEntityType,
} from '../services/budgetService';
import prisma from '../lib/prisma';

const router = Router();

router.use(authenticate);
const budgetAccess = requireRole('super_admin', 'operator_admin', 'fleet_manager');

function parseDateRange(req: Request): { from: Date; to: Date } {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const from = dateFrom
    ? new Date(dateFrom)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = dateTo ? new Date(dateTo) : new Date();
  return { from, to };
}

// ---------------------------------------------------------------------------
// GET /api/v1/budget/fleet-variance
// ---------------------------------------------------------------------------
router.get('/fleet-variance', budgetAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { from, to } = parseDateRange(req);
    const data = await getFleetBudgetVariance(operatorId, from, to, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/budget/cost-centre-variance
// ---------------------------------------------------------------------------
router.get('/cost-centre-variance', budgetAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { from, to } = parseDateRange(req);
    const data = await getCostCentreBudgetVariance(operatorId, from, to, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/budget/trend/:entityType/:entityId
// ---------------------------------------------------------------------------
router.get('/trend/:entityType/:entityId', budgetAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };
    const months = Math.min(24, Math.max(1, parseInt((req.query.months as string) ?? '6', 10)));

    if (!['fleet', 'cost_centre'].includes(entityType)) {
      throw new AppError(400, 'entityType must be "fleet" or "cost_centre"');
    }

    const data = await getVarianceTrend(entityType as BudgetEntityType, entityId, months, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/budget/forecast/:entityType/:entityId
// ---------------------------------------------------------------------------
router.get('/forecast/:entityType/:entityId', budgetAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };

    if (!['fleet', 'cost_centre'].includes(entityType)) {
      throw new AppError(400, 'entityType must be "fleet" or "cost_centre"');
    }

    const data = await getBudgetForecast(entityType as BudgetEntityType, entityId, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/budget/alerts
// ---------------------------------------------------------------------------
router.get('/alerts', budgetAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const data = await getBudgetAlerts(operatorId, prisma);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/budget/export — CSV export
// ---------------------------------------------------------------------------
router.post('/export', budgetAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const operatorId = req.user!.operatorId!;
    const { dateFrom, dateTo, scope = 'fleets' } = req.body as {
      dateFrom?: string;
      dateTo?: string;
      scope?: 'fleets' | 'cost_centres';
    };

    const from = dateFrom ? new Date(dateFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = dateTo ? new Date(dateTo) : new Date();

    let rows: string[] = [];
    let header = '';

    if (scope === 'fleets') {
      const data = await getFleetBudgetVariance(operatorId, from, to, prisma);
      header = 'Fleet,Budget (ZAR),Actual Spend (ZAR),Variance (ZAR),Variance %,Status\n';
      rows = data.map(
        (r) =>
          `"${r.entityName}","${r.budget}","${r.actualSpend}","${r.variance}","${r.variancePercent}%","${r.status}"`,
      );
    } else {
      const data = await getCostCentreBudgetVariance(operatorId, from, to, prisma);
      header = 'Cost Centre,Budget (ZAR),Actual Spend (ZAR),Variance (ZAR),Variance %,Status\n';
      rows = data.map(
        (r) =>
          `"${r.entityName}","${r.budget}","${r.actualSpend}","${r.variance}","${r.variancePercent}%","${r.status}"`,
      );
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="budget-variance.csv"');
    res.send(header + rows.join('\n'));
  } catch (err) {
    next(err);
  }
});

export default router;
