import fs from 'fs';
import path from 'path';
import { createReadStream, ReadStream } from 'fs';
import { v4 as uuidv4 } from 'uuid';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // xlsx
  'application/msword', // doc
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.docx', '.xlsx', '.doc']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UploadedFileInfo {
  filePath: string;   // relative path stored in DB
  fileUrl: string;    // same — absolute URL served via static route
}

function sanitisePath(name: string): string {
  // Strip directory traversal sequences and keep only safe chars
  return name.replace(/[/\\..]/g, '_').replace(/[^a-zA-Z0-9_.\-]/g, '_');
}

function hasSafeFileName(originalName: string): boolean {
  const danger = ['..', '/', '\\', '%2e', '%2f', '%5c'];
  const lower = originalName.toLowerCase();
  return !danger.some((d) => lower.includes(d));
}

/**
 * Save an uploaded file (from multer's memory buffer) to disk.
 * Returns a relative path suitable for storing in the DB.
 */
export async function uploadFile(
  file: Express.Multer.File,
  entityType: string,
  entityId: string,
  operatorId: string,
): Promise<UploadedFileInfo> {
  // Validate size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds maximum size of 10 MB');
  }

  // Validate mime type
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new Error(
      `File type "${file.mimetype}" is not allowed. Permitted types: jpg, jpeg, png, pdf, docx, xlsx`,
    );
  }

  // Validate original filename
  if (!hasSafeFileName(file.originalname)) {
    throw new Error('Invalid file name');
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Extension "${ext}" is not allowed`);
  }

  // Build target dir
  const safeName = sanitisePath(file.originalname);
  const dir = path.join(UPLOADS_DIR, operatorId, entityType, entityId);
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${uuidv4()}-${safeName}`;
  const absolutePath = path.join(dir, filename);

  // Write file buffer to disk
  fs.writeFileSync(absolutePath, file.buffer);

  // Relative path stored in DB (used as the URL path after /uploads)
  const relativePath = `/${operatorId}/${entityType}/${entityId}/${filename}`;

  return { filePath: relativePath, fileUrl: relativePath };
}

/**
 * Delete a file from disk. Silently ignores missing files.
 */
export function deleteFile(fileUrl: string): void {
  try {
    const absolutePath = path.join(UPLOADS_DIR, fileUrl.replace(/^\//, ''));
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  } catch (err) {
    console.error('[FileStorage] Failed to delete file:', err);
  }
}

/**
 * Return a readable stream for file download.
 */
export function getFileStream(fileUrl: string): ReadStream {
  const absolutePath = path.join(UPLOADS_DIR, fileUrl.replace(/^\//, ''));
  if (!fs.existsSync(absolutePath)) {
    throw new Error('File not found');
  }
  return createReadStream(absolutePath);
}
