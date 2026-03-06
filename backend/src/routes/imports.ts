import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';
import { EntityType, getAliasMap } from '../config/importAliases';
import { autoMatchColumns, inferFieldFromData } from '../services/importMatchingService';
import { validateRow, detectDuplicate, parseDateFlexible } from '../services/importValidationService';
import { notify } from '../services/notificationService';

const router = Router();

router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// multer — memory storage, max 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only .csv and .xlsx files are accepted'));
    }
  },
});

// ─── Helper: parse buffer to row objects ──────────────────────────────────────

function parseFileToRows(buffer: Buffer, originalName: string): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) throw new Error('No sheet found in file');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  return rows;
}

// ─── Helper: apply column mapping to raw row ──────────────────────────────────

function applyMapping(
  rawRow: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [sourceCol, targetField] of Object.entries(mapping)) {
    if (targetField && rawRow[sourceCol] !== undefined) {
      mapped[targetField] = rawRow[sourceCol];
    }
  }
  return mapped;
}

// ─── Helper: CSV escape ───────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

// ─── POST /api/v1/import/upload ───────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json(fail('No file uploaded'));
    return;
  }

  const entityType = req.body.entityType as EntityType | undefined;
  if (!entityType || !['vehicle', 'driver', 'fleet', 'tag'].includes(entityType)) {
    res.status(400).json(fail('entityType must be vehicle, driver, fleet, or tag'));
    return;
  }

  // Fleet Managers cannot import fleet or tag entities (only Op Admin + Super Admin can)
  if ((entityType === 'fleet' || entityType === 'tag') && req.user?.role === ROLES.FLEET_MANAGER) {
    res.status(403).json(fail('Fleet Managers are not permitted to import fleet or tag records'));
    return;
  }

  const operatorId = getOperatorScope(req);
  if (!operatorId) {
    res.status(403).json(fail('operatorId required'));
    return;
  }

  let rows: Record<string, unknown>[];
  try {
    rows = parseFileToRows(req.file.buffer, req.file.originalname);
  } catch (err) {
    res.status(400).json(fail(`Could not parse file: ${(err as Error).message}`));
    return;
  }

  if (rows.length === 0) {
    res.status(400).json(fail('File contains no data rows'));
    return;
  }
  if (rows.length > 5000) {
    res.status(400).json(fail('File exceeds maximum of 5,000 rows'));
    return;
  }

  const headers = Object.keys(rows[0]!);

  // Auto-match columns
  const columnMatches = autoMatchColumns(headers, entityType);

  // Fallback inference for unmatched columns using sample data
  const columnSamples: Record<string, string[]> = {};
  for (const header of headers) {
    columnSamples[header] = rows.slice(0, 20).map((r) => String(r[header] ?? ''));
  }

  for (const match of columnMatches) {
    if (!match.targetField) {
      const inferred = inferFieldFromData(columnSamples[match.sourceColumn] ?? [], entityType);
      if (inferred) {
        match.targetField = inferred;
        match.confidence = 40;
        match.autoMatched = false;
      }
    }
  }

  // Build initial mapping object { sourceColumn → targetField }
  const columnMapping: Record<string, string> = {};
  for (const m of columnMatches) {
    if (m.targetField) columnMapping[m.sourceColumn] = m.targetField;
  }

  // Create ImportJob
  const importJob = await prisma.importJob.create({
    data: {
      operatorId,
      uploadedBy: req.user!.id,
      entityType,
      fileName: req.file.originalname,
      columnMapping: JSON.stringify(columnMapping),
      totalRows: rows.length,
      status: 'pending',
    },
  });

  // Create ImportRow records
  const importRowData = rows.map((rawRow, i) => ({
    importJobId: importJob.id,
    rowNumber: i + 1,
    rawData: JSON.stringify(rawRow),
    mappedData: JSON.stringify(applyMapping(rawRow, columnMapping)),
    status: 'pending',
  }));

  await prisma.importRow.createMany({ data: importRowData });

  await auditLog(req, 'import', entityType, importJob.id, undefined,
    `Uploaded ${req.file.originalname} (${rows.length} rows, entity: ${entityType})`);

  // Return available target fields for the UI
  const aliasMap = getAliasMap(entityType);
  const availableFields = Object.keys(aliasMap);

  res.status(201).json(ok({
    jobId: importJob.id,
    totalRows: rows.length,
    columnMatches,
    columnMapping,
    availableFields,
  }));
});

// ─── GET /api/v1/import/history ───────────────────────────────────────────────

router.get('/history', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const cursor = req.query.cursor as string | undefined;
  const take = Math.min(parseInt((req.query.limit as string) ?? '25', 10), 100);

  const where: Prisma.ImportJobWhereInput = {
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const [total, jobs] = await Promise.all([
    prisma.importJob.count({ where }),
    prisma.importJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const nextCursor = jobs.length === take ? jobs[jobs.length - 1]?.id ?? null : null;
  res.json(ok(jobs, { total, nextCursor }));
});

// ─── GET /api/v1/import/templates/:entityType ─────────────────────────────────

router.get('/templates/:entityType', async (req: Request, res: Response): Promise<void> => {
  const entityType = req.params.entityType as EntityType;
  if (!['vehicle', 'driver', 'fleet', 'tag'].includes(entityType)) {
    res.status(400).json(fail('entityType must be vehicle, driver, fleet, or tag'));
    return;
  }

  const aliasMap = getAliasMap(entityType);
  const headers = Object.keys(aliasMap);

  // 2 example rows
  const examples: Record<string, string>[] = [];
  if (entityType === 'vehicle') {
    examples.push({
      registrationNumber: 'CA123456', vinNumber: '1HGBH41JXMN109186',
      make: 'Toyota', model: 'Hiace', year: '2020', colour: 'White',
      fuelType: 'diesel', tankCapacity: '70', currentOdometer: '45000',
      status: 'active', fleetId: 'Fleet A',
    });
    examples.push({
      registrationNumber: 'GP987654', vinNumber: '', make: 'Ford',
      model: 'Transit', year: '2019', colour: 'Silver', fuelType: 'diesel',
      tankCapacity: '80', currentOdometer: '62000', status: 'active', fleetId: 'Fleet B',
    });
  } else if (entityType === 'driver') {
    examples.push({
      firstName: 'Sipho', lastName: 'Dlamini', saIdNumber: '8001015009087',
      mobileNumber: '0821234567', email: 'sipho@example.com',
      licenceNumber: 'GP1234567', licenceCode: 'C', licenceExpiry: '31/12/2026',
      prdpExpiry: '31/12/2025', status: 'active', fleetId: 'Fleet A',
    });
    examples.push({
      firstName: 'Thandiwe', lastName: 'Nkosi', saIdNumber: '9203120029083',
      mobileNumber: '0731234567', email: 'thandiwe@example.com',
      licenceNumber: 'WC9876543', licenceCode: 'EB', licenceExpiry: '30/06/2027',
      prdpExpiry: '30/06/2026', status: 'active', fleetId: 'Fleet B',
    });
  } else if (entityType === 'fleet') {
    examples.push({ name: 'Fleet Alpha', code: 'FLT-A', region: 'Western Cape', status: 'active' });
    examples.push({ name: 'Fleet Beta', code: 'FLT-B', region: 'Gauteng', status: 'active' });
  } else if (entityType === 'tag') {
    examples.push({
      tagNumber: 'TAG-000001', vehicleRegistration: 'GP 123-456',
      status: 'active', issuedDate: '2024-01-15', expiryDate: '2026-12-31',
    });
    examples.push({
      tagNumber: 'TAG-000002', vehicleRegistration: 'CA 789-012',
      status: 'active', issuedDate: '2024-03-01', expiryDate: '2027-02-28',
    });
  }

  const csvRows = examples.map((row) =>
    headers.map((h) => csvEscape(row[h] ?? '')).join(','),
  );
  const csv = [headers.join(','), ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="template-${entityType}.csv"`);
  res.send(csv);
});

// ─── GET /api/v1/import/:id/mapping ──────────────────────────────────────────

router.get('/:id/mapping', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id as string, deletedAt: null, ...(operatorId ? { operatorId } : {}) },
  });
  if (!job) { res.status(404).json(fail('Import job not found')); return; }

  const aliasMap = getAliasMap(job.entityType as EntityType);
  const availableFields = Object.keys(aliasMap);

  res.json(ok({ columnMapping: job.columnMapping, availableFields }));
});

// ─── PATCH /api/v1/import/:id/mapping ────────────────────────────────────────

router.patch('/:id/mapping', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id as string, deletedAt: null, ...(operatorId ? { operatorId } : {}) },
  });
  if (!job) { res.status(404).json(fail('Import job not found')); return; }

  const newMapping = req.body.columnMapping as Record<string, string> | undefined;
  if (!newMapping || typeof newMapping !== 'object') {
    res.status(400).json(fail('columnMapping (object) is required'));
    return;
  }

  // Re-apply mapping to all rows
  const rows = await prisma.importRow.findMany({ where: { importJobId: job.id }, select: { id: true, rawData: true } });

  const updates = rows.map((r) => {
    const raw = typeof r.rawData === 'string' ? JSON.parse(r.rawData) : r.rawData;
    return prisma.importRow.update({
      where: { id: r.id },
      data: {
        mappedData: JSON.stringify(applyMapping(raw as Record<string, unknown>, newMapping)),
        status: 'pending',
        validationErrors: null,
        validationWarnings: null,
      },
    });
  });

  await Promise.all([
    ...updates,
    prisma.importJob.update({
      where: { id: job.id },
      data: {
        columnMapping: JSON.stringify(newMapping),
        status: 'pending',
      },
    }),
  ]);

  res.json(ok({ columnMapping: newMapping }));
});

// ─── POST /api/v1/import/:id/validate ────────────────────────────────────────

router.post('/:id/validate', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id as string, deletedAt: null, ...(operatorId ? { operatorId } : {}) },
  });
  if (!job) { res.status(404).json(fail('Import job not found')); return; }

  await prisma.importJob.update({ where: { id: job.id }, data: { status: 'validating' } });

  const rows = await prisma.importRow.findMany({
    where: { importJobId: job.id },
    orderBy: { rowNumber: 'asc' },
  });

  let validCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  let duplicateCount = 0;

  for (const row of rows) {
    const mappedData = typeof row.mappedData === 'string' ? JSON.parse(row.mappedData) : row.mappedData;

    const result = await validateRow(mappedData, job.entityType as EntityType, job.operatorId, prisma);
    const duplicateOf = await detectDuplicate(mappedData, job.entityType as EntityType, job.operatorId, prisma);

    let status: string;
    if (result.errors.length > 0) {
      status = 'error';
      errorCount++;
    } else if (duplicateOf) {
      status = 'warning';
      warningCount++;
      duplicateCount++;
    } else if (result.warnings.length > 0) {
      status = 'warning';
      warningCount++;
    } else {
      status = 'valid';
      validCount++;
    }

    await prisma.importRow.update({
      where: { id: row.id },
      data: {
        validationErrors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        validationWarnings: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
        duplicateOf: duplicateOf ?? null,
        status,
        mappedData: JSON.stringify(mappedData),
      },
    });
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: { status: 'previewing' },
  });

  res.json(ok({
    totalRows: rows.length,
    validCount,
    errorCount,
    warningCount,
    duplicateCount,
  }));
});

// ─── GET /api/v1/import/:id/preview ──────────────────────────────────────────

router.get('/:id/preview', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id as string, deletedAt: null, ...(operatorId ? { operatorId } : {}) },
  });
  if (!job) { res.status(404).json(fail('Import job not found')); return; }

  const statusFilter = req.query.status as string | undefined;
  const cursor = req.query.cursor as string | undefined;
  const take = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);

  const where: Prisma.ImportRowWhereInput = {
    importJobId: job.id,
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.importRow.count({ where }),
    prisma.importRow.findMany({
      where,
      orderBy: { rowNumber: 'asc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    }),
  ]);

  const nextCursor = rows.length === take ? rows[rows.length - 1]?.id ?? null : null;
  res.json(ok(rows, { total, nextCursor, job }));
});

// ─── PATCH /api/v1/import/:id/rows/:rowNumber ─────────────────────────────────

router.patch('/:id/rows/:rowNumber', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id as string, deletedAt: null, ...(operatorId ? { operatorId } : {}) },
  });
  if (!job) { res.status(404).json(fail('Import job not found')); return; }

  const rowNum = parseInt(req.params.rowNumber as string, 10);
  const row = await prisma.importRow.findFirst({
    where: { importJobId: job.id, rowNumber: rowNum },
  });
  if (!row) { res.status(404).json(fail('Row not found')); return; }

  const { mappedData, resolution } = req.body as {
    mappedData?: Record<string, unknown>;
    resolution?: string;
  };

  const existingMapped = typeof row.mappedData === 'string' ? JSON.parse(row.mappedData) : row.mappedData;
  const updatedData = mappedData ?? existingMapped;

  // Re-validate
  const result = await validateRow(updatedData, job.entityType as EntityType, job.operatorId, prisma);
  const duplicateOf = await detectDuplicate(updatedData, job.entityType as EntityType, job.operatorId, prisma);

  let status: string;
  if (result.errors.length > 0) {
    status = 'error';
  } else if (duplicateOf && resolution !== 'overwrite' && resolution !== 'merge') {
    status = 'warning';
  } else if (result.warnings.length > 0) {
    status = 'warning';
  } else {
    status = 'valid';
  }

  const updated = await prisma.importRow.update({
    where: { id: row.id },
    data: {
      mappedData: JSON.stringify(updatedData),
      validationErrors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
      validationWarnings: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
      duplicateOf: duplicateOf ?? null,
      resolution: resolution ?? row.resolution,
      status,
    },
  });

  res.json(ok(updated));
});

// ─── POST /api/v1/import/:id/execute ──────────────────────────────────────────

router.post('/:id/execute', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id as string, deletedAt: null, ...(operatorId ? { operatorId } : {}) },
  });
  if (!job) { res.status(404).json(fail('Import job not found')); return; }

  if (!['previewing', 'pending'].includes(job.status)) {
    res.status(400).json(fail(`Cannot execute import in status "${job.status}"`));
    return;
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: { status: 'importing', startedAt: new Date() },
  });

  const rows = await prisma.importRow.findMany({
    where: { importJobId: job.id, status: { not: 'imported' } },
    orderBy: { rowNumber: 'asc' },
  });

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors: { rowNumber: number; reason: string }[] = [];

  for (const row of rows) {
    const data = (typeof row.mappedData === 'string' ? JSON.parse(row.mappedData) : row.mappedData) as Record<string, unknown>;

    // Skip rows with resolution=skip
    if (row.resolution === 'skip' || row.status === 'error') {
      await prisma.importRow.update({
        where: { id: row.id },
        data: { status: 'skipped' },
      });
      skippedCount++;
      continue;
    }

    try {
      if (job.entityType === 'vehicle') {
        const reg = String(data.registrationNumber ?? '').toUpperCase().trim();

        if (row.duplicateOf && row.resolution === 'overwrite') {
          await prisma.vehicle.update({
            where: { id: row.duplicateOf },
            data: {
              registrationNumber: reg,
              vinNumber: data.vinNumber ? String(data.vinNumber).trim() : undefined,
              make: data.make ? String(data.make).trim() : undefined,
              model: data.model ? String(data.model).trim() : undefined,
              year: data.year ? parseInt(String(data.year), 10) : undefined,
              colour: data.colour ? String(data.colour).trim() : undefined,
              fuelType: data.fuelType ? String(data.fuelType).toLowerCase().trim() : undefined,
              tankCapacity: data.tankCapacity ? parseFloat(String(data.tankCapacity)) : undefined,
              currentOdometer: data.currentOdometer ? parseInt(String(data.currentOdometer), 10) : undefined,
              status: data.status ? String(data.status).trim() : undefined,
              fleetId: data.fleetId ? String(data.fleetId).trim() : undefined,
            },
          });
        } else if (!row.duplicateOf) {
          const fleetId = data.fleetId ? String(data.fleetId).trim() : undefined;
          if (!fleetId) throw new Error('fleetId is required to create a vehicle');

          await prisma.vehicle.create({
            data: {
              operatorId: job.operatorId,
              fleetId,
              registrationNumber: reg,
              vinNumber: data.vinNumber ? String(data.vinNumber).trim() : undefined,
              make: String(data.make ?? '').trim(),
              model: String(data.model ?? '').trim(),
              year: parseInt(String(data.year ?? '0'), 10),
              colour: data.colour ? String(data.colour).trim() : undefined,
              fuelType: String(data.fuelType ?? 'diesel').toLowerCase().trim(),
              tankCapacity: parseFloat(String(data.tankCapacity ?? '70')),
              currentOdometer: data.currentOdometer ? parseInt(String(data.currentOdometer), 10) : undefined,
              status: data.status ? String(data.status).trim() : 'active',
            },
          });
        } else {
          // Duplicate, resolution=skip (default)
          await prisma.importRow.update({ where: { id: row.id }, data: { status: 'skipped' } });
          skippedCount++;
          continue;
        }

      } else if (job.entityType === 'driver') {
        const firstName = String(data.firstName ?? '').trim();
        const lastName = String(data.lastName ?? '').trim();
        const fleetId = data.fleetId ? String(data.fleetId).trim() : undefined;
        if (!fleetId) throw new Error('fleetId is required to create a driver');

        if (row.duplicateOf && row.resolution === 'overwrite') {
          await prisma.driver.update({
            where: { id: row.duplicateOf },
            data: {
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              saIdNumber: data.saIdNumber ? String(data.saIdNumber).trim() : undefined,
              mobileNumber: data.mobileNumber ? String(data.mobileNumber).trim() : undefined,
              email: data.email ? String(data.email).trim() : undefined,
              licenceNumber: data.licenceNumber ? String(data.licenceNumber).trim() : undefined,
              licenceCode: data.licenceCode ? String(data.licenceCode).trim().toUpperCase() : undefined,
              licenceExpiry: data.licenceExpiry ? parseDateFlexible(data.licenceExpiry) ?? undefined : undefined,
              prdpExpiry: data.prdpExpiry ? parseDateFlexible(data.prdpExpiry) ?? undefined : undefined,
              dailySpendLimit: data.dailySpendLimit ? parseFloat(String(data.dailySpendLimit)) : undefined,
              monthlySpendLimit: data.monthlySpendLimit ? parseFloat(String(data.monthlySpendLimit)) : undefined,
              status: data.status ? String(data.status).trim() : undefined,
              fleetId,
            },
          });
        } else if (!row.duplicateOf) {
          await prisma.driver.create({
            data: {
              operatorId: job.operatorId,
              fleetId,
              firstName,
              lastName,
              driverPin: Math.floor(1000 + Math.random() * 9000).toString(),
              saIdNumber: data.saIdNumber ? String(data.saIdNumber).trim() : undefined,
              mobileNumber: data.mobileNumber ? String(data.mobileNumber).trim() : '0000000000',
              email: data.email ? String(data.email).trim() : undefined,
              licenceNumber: data.licenceNumber ? String(data.licenceNumber).trim() : undefined,
              licenceCode: data.licenceCode ? String(data.licenceCode).trim().toUpperCase() : undefined,
              licenceExpiry: data.licenceExpiry ? parseDateFlexible(data.licenceExpiry) ?? undefined : undefined,
              prdpExpiry: data.prdpExpiry ? parseDateFlexible(data.prdpExpiry) ?? undefined : undefined,
              dailySpendLimit: data.dailySpendLimit ? parseFloat(String(data.dailySpendLimit)) : undefined,
              monthlySpendLimit: data.monthlySpendLimit ? parseFloat(String(data.monthlySpendLimit)) : undefined,
              status: data.status ? String(data.status).trim() : 'active',
            },
          });
        } else {
          await prisma.importRow.update({ where: { id: row.id }, data: { status: 'skipped' } });
          skippedCount++;
          continue;
        }

      } else if (job.entityType === 'fleet') {
        const name = String(data.name ?? '').trim();

        if (row.duplicateOf && row.resolution === 'overwrite') {
          await prisma.fleet.update({
            where: { id: row.duplicateOf },
            data: {
              name: name || undefined,
              code: data.code ? String(data.code).trim() : undefined,
              region: data.region ? String(data.region).trim() : undefined,
              status: data.status ? String(data.status).trim() : undefined,
            },
          });
        } else if (!row.duplicateOf) {
          await prisma.fleet.create({
            data: {
              operatorId: job.operatorId,
              name,
              code: data.code ? String(data.code).trim() : undefined,
              region: data.region ? String(data.region).trim() : undefined,
              status: data.status ? String(data.status).trim() : 'active',
            },
          });
        } else {
          await prisma.importRow.update({ where: { id: row.id }, data: { status: 'skipped' } });
          skippedCount++;
          continue;
        }

      } else if (job.entityType === 'tag') {
        const tagNumber = String(data.tagNumber ?? '').trim();
        let vehicleId: string | null = null;

        if (data.vehicleRegistration) {
          const vehicle = await prisma.vehicle.findFirst({
            where: { operatorId: job.operatorId, registrationNumber: String(data.vehicleRegistration).toUpperCase().trim(), deletedAt: null },
          });
          vehicleId = vehicle?.id ?? null;
        }

        if (row.duplicateOf && row.resolution === 'overwrite') {
          await prisma.tag.update({
            where: { id: row.duplicateOf },
            data: {
              vehicleId,
              status: data.status ? String(data.status) : 'unassigned',
              issuedDate: data.issuedDate ? parseDateFlexible(String(data.issuedDate)) : undefined,
              expiryDate: data.expiryDate ? parseDateFlexible(String(data.expiryDate)) : undefined,
            },
          });
        } else if (!row.duplicateOf) {
          await prisma.tag.create({
            data: {
              operatorId: job.operatorId,
              tagNumber,
              vehicleId,
              status: vehicleId ? 'active' : (data.status ? String(data.status) : 'unassigned'),
              issuedDate: data.issuedDate ? parseDateFlexible(String(data.issuedDate)) : new Date(),
              expiryDate: data.expiryDate ? parseDateFlexible(String(data.expiryDate)) : null,
              activatedAt: vehicleId ? new Date() : null,
            },
          });
        } else {
          await prisma.importRow.update({ where: { id: row.id }, data: { status: 'skipped' } });
          skippedCount++;
          continue;
        }
      }

      await prisma.importRow.update({ where: { id: row.id }, data: { status: 'imported' } });
      importedCount++;

    } catch (err) {
      const reason = (err as Error).message ?? 'Unknown error';
      errors.push({ rowNumber: row.rowNumber, reason });
      await prisma.importRow.update({
        where: { id: row.id },
        data: {
          status: 'error',
          validationErrors: JSON.stringify([reason]),
        },
      });
      failedCount++;
    }
  }

  // Build error report CSV if any failures
  let errorReportUrl: string | null = null;
  if (errors.length > 0) {
    const csvLines = [
      'Row Number,Reason',
      ...errors.map((e) => `${e.rowNumber},${csvEscape(e.reason)}`),
    ].join('\n');
    // Store inline in the job record (small report)
    errorReportUrl = `data:text/csv;base64,${Buffer.from(csvLines).toString('base64')}`;
  }

  await prisma.importJob.update({
    where: { id: job.id },
    data: {
      status: errors.length === rows.length && rows.length > 0 ? 'failed' : 'completed',
      completedAt: new Date(),
      importedCount,
      skippedCount,
      failedCount,
      errorReportUrl,
    },
  });

  await auditLog(req, 'import', job.entityType as 'vehicle' | 'driver' | 'fleet' | 'tag', job.id, undefined,
    `Import executed: ${importedCount} imported, ${skippedCount} skipped, ${failedCount} failed`);

  await notify({
    operatorId: job.operatorId,
    type: 'import_completed',
    title: `Import Completed — ${job.fileName}`,
    message: `${job.entityType} import of "${job.fileName}" finished: ${importedCount} imported, ${skippedCount} skipped, ${failedCount} failed.`,
    metadata: { importJobId: job.id, entityType: job.entityType, importedCount, skippedCount, failedCount },
    userId: job.uploadedBy,
  }, prisma);

  res.json(ok({ importedCount, skippedCount, failedCount, errorReportUrl }));
});

// ─── GET /api/v1/import/:id/report ────────────────────────────────────────────

router.get('/:id/report', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id as string, deletedAt: null, ...(operatorId ? { operatorId } : {}) },
  });
  if (!job) { res.status(404).json(fail('Import job not found')); return; }

  const errorRows = await prisma.importRow.findMany({
    where: { importJobId: job.id, status: 'error' },
    orderBy: { rowNumber: 'asc' },
  });

  const csvLines = [
    'Row Number,Status,Errors,Warnings,Data',
    ...errorRows.map((r) => {
      const errs = Array.isArray(r.validationErrors) ? (r.validationErrors as string[]).join('; ') : '';
      const warns = Array.isArray(r.validationWarnings) ? (r.validationWarnings as string[]).join('; ') : '';
      return [r.rowNumber, r.status, errs, warns, JSON.stringify(r.mappedData)].map(csvEscape).join(',');
    }),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="import-errors-${job.id.slice(0, 8)}.csv"`);
  res.send(csvLines);
});

// ─── GET /api/v1/import/:id ───────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id as string, deletedAt: null, ...(operatorId ? { operatorId } : {}) },
  });
  if (!job) { res.status(404).json(fail('Import job not found')); return; }
  res.json(ok(job));
});

export default router;
