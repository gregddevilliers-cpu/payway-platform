import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { runReport, REPORT_TYPES, ReportType, ReportFilters } from '../services/reportService';
import { exportToCsv, exportToExcel, exportToPdfHtml, ExportColumn } from '../services/reportExportService';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── Column definitions for each report type ──────────────────────────────────
const COLUMNS: Record<string, ExportColumn[]> = {
  'fuel-consumption': [
    { key: 'label', header: 'Vehicle / Group' },
    { key: 'totalLitres', header: 'Total Litres', width: 14 },
    { key: 'totalCost', header: 'Total Cost (R)', width: 14 },
    { key: 'avgPricePerLitre', header: 'Avg Price/L (R)', width: 16 },
    { key: 'avgL100km', header: 'Avg L/100km', width: 13 },
    { key: 'transactionCount', header: 'Transactions', width: 13 },
  ],
  'spend-analysis': [
    { key: 'fleetName', header: 'Fleet' },
    { key: 'current', header: 'Current Period (R)', width: 18 },
    { key: 'previous', header: 'Previous Period (R)', width: 19 },
    { key: 'change', header: '% Change', width: 10 },
  ],
  'driver-performance': [
    { key: 'driverName', header: 'Driver', width: 22 },
    { key: 'totalSpend', header: 'Total Spend (R)', width: 15 },
    { key: 'avgL100km', header: 'Avg L/100km', width: 13 },
    { key: 'avgKpl', header: 'Avg km/L', width: 10 },
    { key: 'vsFleetAvg', header: 'vs Fleet Avg (%)', width: 17 },
    { key: 'anomalyCount', header: 'Anomalies', width: 11 },
    { key: 'transactionCount', header: 'Transactions', width: 13 },
  ],
  'vehicle-performance': [
    { key: 'registrationNumber', header: 'Vehicle', width: 14 },
    { key: 'totalFuelSpend', header: 'Fuel Cost (R)', width: 14 },
    { key: 'totalMaintenanceCost', header: 'Maint. Cost (R)', width: 16 },
    { key: 'totalCost', header: 'Total Cost (R)', width: 14 },
    { key: 'avgL100km', header: 'Avg L/100km', width: 13 },
    { key: 'transactionCount', header: 'Fill-ups', width: 10 },
  ],
  'compliance': [
    { key: 'entityType', header: 'Type', width: 10 },
    { key: 'entityName', header: 'Name', width: 24 },
    { key: 'itemType', header: 'Document', width: 14 },
    { key: 'expiryDate', header: 'Expiry Date', width: 14 },
    { key: 'status', header: 'Status', width: 14 },
  ],
  'budget-variance': [
    { key: 'fleetName', header: 'Fleet', width: 20 },
    { key: 'budget', header: 'Budget (R)', width: 12 },
    { key: 'actual', header: 'Actual (R)', width: 12 },
    { key: 'variance', header: 'Variance (R)', width: 14 },
    { key: 'variancePct', header: 'Variance %', width: 12 },
    { key: 'status', header: 'Status', width: 14 },
  ],
  'anomaly-report': [
    { key: 'code', header: 'Anomaly Type', width: 24 },
    { key: 'count', header: 'Total', width: 8 },
    { key: 'resolved', header: 'Resolved', width: 10 },
    { key: 'resolutionRate', header: 'Resolution Rate (%)', width: 20 },
  ],
  'forecourt-analysis': [
    { key: 'siteName', header: 'Forecourt', width: 24 },
    { key: 'siteCode', header: 'Code', width: 10 },
    { key: 'totalSpend', header: 'Total Spend (R)', width: 16 },
    { key: 'totalLitres', header: 'Total Litres', width: 13 },
    { key: 'avgPricePerLitre', header: 'Avg Price/L (R)', width: 16 },
    { key: 'transactionCount', header: 'Transactions', width: 13 },
  ],
  'cost-allocation': [
    { key: 'fleetName', header: 'Fleet', width: 20 },
    { key: 'fuelCost', header: 'Fuel Cost (R)', width: 14 },
    { key: 'maintenanceCost', header: 'Maint. Cost (R)', width: 16 },
    { key: 'totalCost', header: 'Total Cost (R)', width: 14 },
  ],
  'environmental': [
    { key: 'label', header: 'Fleet / Vehicle', width: 20 },
    { key: 'totalLitres', header: 'Total Litres', width: 13 },
    { key: 'totalCo2kg', header: 'CO₂ (kg)', width: 12 },
    { key: 'co2PerKm', header: 'CO₂/km (kg)', width: 14 },
  ],
};

// ─── GET /api/v1/reports/:type ────────────────────────────────────────────────
router.get('/:type', async (req: Request, res: Response): Promise<void> => {
  const type = req.params.type as string;
  if (!REPORT_TYPES.includes(type as ReportType)) {
    res.status(400).json(fail(`Unknown report type. Valid types: ${REPORT_TYPES.join(', ')}`));
    return;
  }

  const operatorId = getOperatorScope(req);
  if (!operatorId) { res.status(403).json(fail('Operator scope required')); return; }

  const { fleetId, vehicleId, driverId, dateFrom, dateTo, groupBy } = req.query as Record<string, string>;
  if (!dateFrom || !dateTo) {
    res.status(400).json(fail('dateFrom and dateTo are required'));
    return;
  }

  const filters: ReportFilters = { fleetId, vehicleId, driverId, dateFrom, dateTo, groupBy };
  const data = await runReport(type as ReportType, operatorId, filters, prisma);
  res.json(ok(data));
});

// ─── POST /api/v1/reports/:type/export ────────────────────────────────────────
router.post('/:type/export', async (req: Request, res: Response): Promise<void> => {
  const type = req.params.type as string;
  if (!REPORT_TYPES.includes(type as ReportType)) {
    res.status(400).json(fail(`Unknown report type`));
    return;
  }

  const operatorId = getOperatorScope(req);
  if (!operatorId) { res.status(403).json(fail('Operator scope required')); return; }

  const { format = 'csv', filters } = req.body as { format: 'csv' | 'excel' | 'pdf'; filters: ReportFilters };
  if (!filters?.dateFrom || !filters?.dateTo) {
    res.status(400).json(fail('filters.dateFrom and filters.dateTo are required'));
    return;
  }

  const data = await runReport(type as ReportType, operatorId, filters, prisma);
  const columns = COLUMNS[type] ?? [{ key: 'id', header: 'ID' }];
  const title = type.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const filename = `${type}-${filters.dateFrom}-${filters.dateTo}`;

  // Flatten nested data for export (spend-analysis has nested byFleet)
  let rows: Record<string, unknown>[];
  if (type === 'spend-analysis') {
    const d = data as { byFleet: Record<string, unknown>[] };
    rows = d.byFleet ?? [];
  } else if (type === 'compliance') {
    const d = data as { items: Record<string, unknown>[] };
    rows = d.items ?? [];
  } else if (type === 'anomaly-report') {
    const d = data as { byType: Record<string, unknown>[] };
    rows = d.byType ?? [];
  } else {
    rows = data as Record<string, unknown>[];
  }

  if (format === 'csv') {
    const csv = exportToCsv(rows, columns);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send(csv);
  } else if (format === 'excel') {
    const buf = exportToExcel(rows, columns, title);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    res.send(buf);
  } else if (format === 'pdf') {
    const html = exportToPdfHtml(rows, columns, title, {
      dateFrom: filters.dateFrom, dateTo: filters.dateTo,
      fleet: filters.fleetId ?? '',
    });
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.html"`);
    res.send(html);
  } else {
    res.status(400).json(fail('format must be csv, excel, or pdf'));
  }
});

// ─── Report schedules (schema not yet added — placeholder) ───────────────────
router.post('/schedule', async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json(fail('Report scheduling requires a ReportSchedule model (not yet migrated). Coming in next step.'));
});

router.get('/schedules', async (_req: Request, res: Response): Promise<void> => {
  res.json(ok([]));
});

export default router;
