import { PrismaClient } from '@prisma/client';

// ─── JSON Fields ─────────────────────────────────────────────────────────────
// SQL Server doesn't support native JSON columns. These fields are stored as
// NVARCHAR(MAX) strings. We deserialize JSON strings back to objects on read
// using $extends result extensions, so the rest of the application code can
// work with objects/arrays directly. Writes use explicit JSON.stringify() calls.
// ─────────────────────────────────────────────────────────────────────────────

const JSON_FIELDS: Record<string, string[]> = {
  VehicleHandover: ['equipmentChecklist', 'photos'],
  AuditLog: ['changes', 'metadata'],
  FuelTransaction: ['anomalyFlags'],
  ImportJob: ['columnMapping'],
  ImportRow: ['rawData', 'mappedData', 'validationErrors', 'validationWarnings'],
  Notification: ['metadata'],
  RepairProvider: ['specialisations'],
  RepairQuote: ['lineItems'],
  RepairWorkLog: ['photosJson', 'partsReplaced'],
};

function tryParseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Build $extends result config to auto-parse JSON fields on read
function buildResultExtensions() {
  const result: Record<string, Record<string, { needs: Record<string, boolean>; compute: (data: Record<string, unknown>) => unknown }>> = {};
  for (const [model, fields] of Object.entries(JSON_FIELDS)) {
    const modelKey = model.charAt(0).toLowerCase() + model.slice(1);
    const compute: Record<string, { needs: Record<string, boolean>; compute: (data: Record<string, unknown>) => unknown }> = {};
    for (const field of fields) {
      compute[field] = {
        needs: { [field]: true },
        compute: (data: Record<string, unknown>) => tryParseJson(data[field]),
      };
    }
    result[modelKey] = compute;
  }
  return result;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // $extends returns a compatible superset of PrismaClient
  return base.$extends({
    result: buildResultExtensions() as any,
  }) as unknown as PrismaClient;
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
