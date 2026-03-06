import { Router, Request, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireRole, ROLES, getOperatorScope } from '../middleware/rbac';
import { ok, fail } from '../types/index';
import { auditLog } from '../middleware/auditMiddleware';
import { uploadFile, getFileStream } from '../services/fileStorageService';

const router = Router();

// multer — memory storage so we can validate before writing to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const ALLOWED_ENTITY_TYPES = new Set([
  'vehicle', 'driver', 'fleet', 'repair_job', 'incident', 'maintenance_record',
]);

const ALLOWED_DOCUMENT_TYPES = new Set([
  'registration', 'licence', 'insurance', 'prdp', 'photo', 'inspection',
  'invoice', 'quote', 'police_report', 'receipt', 'certificate', 'other',
]);

// All document routes require at least fleet_manager
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.OPERATOR_ADMIN, ROLES.FLEET_MANAGER));

// ─── POST /api/v1/documents ───────────────────────────────────────────────────
router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json(fail('No file uploaded'));
    return;
  }

  const entityType = req.body.entityType as string | undefined;
  const entityId = req.body.entityId as string | undefined;
  const documentType = req.body.documentType as string | undefined;
  const description = req.body.description as string | undefined;

  if (!entityType || !entityId || !documentType) {
    res.status(400).json(fail('entityType, entityId, and documentType are required'));
    return;
  }

  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    res.status(400).json(fail(`Invalid entityType. Allowed: ${[...ALLOWED_ENTITY_TYPES].join(', ')}`));
    return;
  }

  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    res.status(400).json(fail(`Invalid documentType. Allowed: ${[...ALLOWED_DOCUMENT_TYPES].join(', ')}`));
    return;
  }

  const operatorId = getOperatorScope(req) ?? req.user!.operatorId!;

  let fileInfo: { filePath: string; fileUrl: string };
  try {
    fileInfo = await uploadFile(req.file, entityType, entityId, operatorId);
  } catch (err: unknown) {
    res.status(400).json(fail((err as Error).message ?? 'File upload failed'));
    return;
  }

  const doc = await prisma.document.create({
    data: {
      operatorId,
      entityType,
      entityId,
      documentType,
      fileName: req.file.originalname,
      fileUrl: fileInfo.fileUrl,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user!.id,
      description: description ?? null,
    },
  });

  await auditLog(req, 'create', 'document', doc.id, undefined,
    `Uploaded document "${doc.fileName}" for ${entityType} ${entityId}`);

  res.status(201).json(ok(doc));
});

// ─── GET /api/v1/documents?entityType=X&entityId=Y ───────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId as string | undefined;

  if (!entityType || !entityId) {
    res.status(400).json(fail('entityType and entityId are required'));
    return;
  }

  const operatorId = getOperatorScope(req);
  const where: Prisma.DocumentWhereInput = {
    entityType,
    entityId,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const docs = await prisma.document.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  // Enrich with uploader name
  const userIds = [...new Set(docs.map((d) => d.uploadedBy))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const enriched = docs.map((d) => ({
    ...d,
    uploadedByName: userMap.get(d.uploadedBy) ?? 'Unknown',
  }));

  res.json(ok(enriched));
});

// ─── GET /api/v1/documents/:id/download ──────────────────────────────────────
router.get('/:id/download', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.DocumentWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const doc = await prisma.document.findFirst({ where });

  if (!doc) {
    res.status(404).json(fail('Document not found'));
    return;
  }

  let stream: ReturnType<typeof getFileStream>;
  try {
    stream = getFileStream(doc.fileUrl);
  } catch {
    res.status(404).json(fail('File not found on disk'));
    return;
  }

  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
  res.setHeader('Content-Length', doc.fileSize.toString());
  stream.pipe(res);
});

// ─── DELETE /api/v1/documents/:id ────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const operatorId = getOperatorScope(req);
  const where: Prisma.DocumentWhereInput = {
    id: req.params.id as string,
    deletedAt: null,
    ...(operatorId ? { operatorId } : {}),
  };

  const doc = await prisma.document.findFirst({ where });

  if (!doc) {
    res.status(404).json(fail('Document not found'));
    return;
  }

  await prisma.document.update({
    where: { id: doc.id },
    data: { deletedAt: new Date() },
  });

  await auditLog(req, 'delete', 'document', doc.id, undefined,
    `Deleted document "${doc.fileName}" from ${doc.entityType} ${doc.entityId}`);

  res.json(ok({ deleted: true }));
});

export default router;
