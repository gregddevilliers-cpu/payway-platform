import { PrismaClient } from '@prisma/client';
import { EntityType } from '../config/importAliases';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── SA ID Validation ─────────────────────────────────────────────────────────

/**
 * Full South African ID number validation:
 *   - Must be exactly 13 digits
 *   - First 6 digits encode date of birth (YYMMDD)
 *   - Digit 7 encodes gender (0000–4999 = female, 5000–9999 = male)
 *   - Digit 11 = citizenship (0 = SA citizen, 1 = permanent resident)
 *   - Digit 13 = Luhn check digit
 */
export function validateSaId(idNumber: string): boolean {
  if (!/^\d{13}$/.test(idNumber)) return false;

  // Validate date of birth component
  const yy = parseInt(idNumber.slice(0, 2), 10);
  const mm = parseInt(idNumber.slice(2, 4), 10);
  const dd = parseInt(idNumber.slice(4, 6), 10);

  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;

  // Citizenship digit must be 0 or 1
  const citizenship = parseInt(idNumber[10], 10);
  if (citizenship !== 0 && citizenship !== 1) return false;

  // Luhn check digit
  let total = 0;
  for (let i = 0; i < 12; i++) {
    let digit = parseInt(idNumber[i], 10);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    total += digit;
  }
  const checkDigit = (10 - (total % 10)) % 10;
  if (checkDigit !== parseInt(idNumber[12], 10)) return false;

  return true;
}

// ─── Date Parsing ─────────────────────────────────────────────────────────────

/**
 * Attempt to parse a date string in multiple formats:
 *   - DD/MM/YYYY
 *   - YYYY-MM-DD
 *   - ISO 8601 (YYYY-MM-DDTHH:mm:ssZ)
 *   - MM/DD/YYYY (US, lower priority)
 *
 * Returns a Date or null if unparseable.
 */
export function parseDateFlexible(value: unknown): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;

  // DD/MM/YYYY
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (ymd) {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return d;
  }

  // ISO 8601 — let JS handle it
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

/**
 * Check if a record with the same key field(s) already exists.
 * Returns the existing record ID or null.
 */
export async function detectDuplicate(
  data: Record<string, unknown>,
  entityType: EntityType,
  operatorId: string,
  prisma: PrismaClient,
): Promise<string | null> {
  if (entityType === 'vehicle') {
    const reg = data.registrationNumber as string | undefined;
    if (!reg) return null;
    const existing = await prisma.vehicle.findFirst({
      where: { operatorId, registrationNumber: reg.toUpperCase().trim(), deletedAt: null },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  if (entityType === 'driver') {
    const idNum = data.saIdNumber as string | undefined;
    const mobile = data.mobileNumber as string | undefined;

    if (idNum) {
      const existing = await prisma.driver.findFirst({
        where: { operatorId, saIdNumber: idNum.trim(), deletedAt: null },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    if (mobile) {
      const normalised = normaliseMobile(mobile);
      const existing = await prisma.driver.findFirst({
        where: { operatorId, mobileNumber: normalised, deletedAt: null },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    return null;
  }

  if (entityType === 'fleet') {
    const name = data.name as string | undefined;
    if (!name) return null;
    const existing = await prisma.fleet.findFirst({
      where: { operatorId, name: name.trim(), deletedAt: null },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SA_PHONE_RE = /^(\+27|0)[6-8]\d{8}$/;

function normaliseMobile(value: string): string {
  const s = String(value).trim().replace(/[\s\-()]/g, '');
  if (s.startsWith('0')) return '+27' + s.slice(1);
  return s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LICENCE_CODES = ['A', 'A1', 'B', 'C', 'C1', 'EB', 'EC', 'EC1'];
const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'hybrid', 'lpg', 'cng'];

const currentYear = new Date().getFullYear();

// ─── Row Validation ───────────────────────────────────────────────────────────

export async function validateRow(
  data: Record<string, unknown>,
  entityType: EntityType,
  operatorId: string,
  prisma: PrismaClient,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (entityType === 'vehicle') {
    // Required fields
    const reg = String(data.registrationNumber ?? '').trim();
    if (!reg) {
      errors.push('registrationNumber is required');
    }

    const make = String(data.make ?? '').trim();
    if (!make) errors.push('make is required');

    const model = String(data.model ?? '').trim();
    if (!model) errors.push('model is required');

    // VIN validation
    if (data.vinNumber) {
      const vin = String(data.vinNumber).trim();
      if (vin.length !== 17) {
        errors.push(`vinNumber must be 17 characters (got ${vin.length})`);
      }
    }

    // Year
    if (data.year !== undefined && data.year !== '') {
      const yr = Number(data.year);
      if (isNaN(yr) || yr < 1900 || yr > currentYear + 1) {
        errors.push(`year must be between 1900 and ${currentYear + 1}`);
      }
    }

    // Fuel type
    if (data.fuelType) {
      const ft = String(data.fuelType).toLowerCase().trim();
      if (!FUEL_TYPES.includes(ft)) {
        errors.push(`fuelType must be one of: ${FUEL_TYPES.join(', ')}`);
      }
    }

    // Tank capacity
    if (data.tankCapacity !== undefined && data.tankCapacity !== '') {
      const cap = Number(data.tankCapacity);
      if (isNaN(cap) || cap < 1 || cap > 999) {
        errors.push('tankCapacity must be between 1 and 999 litres');
      }
    }

  }

  if (entityType === 'driver') {
    // Required fields
    const firstName = String(data.firstName ?? '').trim();
    if (!firstName) errors.push('firstName is required');

    const lastName = String(data.lastName ?? '').trim();
    if (!lastName) errors.push('lastName is required');

    // SA ID
    if (data.saIdNumber) {
      const id = String(data.saIdNumber).trim().replace(/\s/g, '');
      if (!validateSaId(id)) {
        errors.push('saIdNumber is not a valid South African ID number (13-digit Luhn)');
      }
    }

    // Mobile
    if (data.mobileNumber) {
      const mob = normaliseMobile(String(data.mobileNumber));
      if (!SA_PHONE_RE.test(mob)) {
        errors.push('mobileNumber must be a valid SA phone number (e.g. +27821234567 or 0821234567)');
      }
    }

    // Email
    if (data.email) {
      if (!EMAIL_RE.test(String(data.email).trim())) {
        errors.push('email format is invalid');
      }
    }

    // Licence code
    if (data.licenceCode) {
      const code = String(data.licenceCode).trim().toUpperCase();
      if (!LICENCE_CODES.includes(code)) {
        errors.push(`licenceCode must be one of: ${LICENCE_CODES.join(', ')}`);
      }
    }

    // Spend limits
    if (data.dailySpendLimit !== undefined && data.dailySpendLimit !== '') {
      const limit = Number(data.dailySpendLimit);
      if (isNaN(limit) || limit < 0) {
        errors.push('dailySpendLimit must be a positive number');
      }
    }
    if (data.monthlySpendLimit !== undefined && data.monthlySpendLimit !== '') {
      const limit = Number(data.monthlySpendLimit);
      if (isNaN(limit) || limit < 0) {
        errors.push('monthlySpendLimit must be a positive number');
      }
    }

    // Date fields
    const dateFields: [string, string][] = [
      ['dateOfBirth', 'Date of birth'],
      ['licenceExpiry', 'Licence expiry'],
      ['prdpExpiry', 'PrDP expiry'],
    ];
    for (const [field, label] of dateFields) {
      if (data[field]) {
        const d = parseDateFlexible(data[field]);
        if (!d) {
          errors.push(`${label} is not parseable (use DD/MM/YYYY or YYYY-MM-DD)`);
        } else if ((field === 'licenceExpiry' || field === 'prdpExpiry') && d < new Date()) {
          warnings.push(`${label} is in the past (${d.toLocaleDateString('en-ZA')})`);
        }
      }
    }
  }

  if (entityType === 'fleet') {
    const name = String(data.name ?? '').trim();
    if (!name) errors.push('name is required');
  }

  // Foreign key: fleetId given as a name string — try to resolve it
  if (data.fleetId && typeof data.fleetId === 'string') {
    const rawFleet = data.fleetId.trim();
    // If it doesn't look like a UUID, try resolving by name
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(rawFleet)) {
      const fleet = await prisma.fleet.findFirst({
        where: { operatorId, name: rawFleet, deletedAt: null },
        select: { id: true },
      });
      if (fleet) {
        data.fleetId = fleet.id; // resolve in-place
      } else {
        warnings.push(`Fleet "${rawFleet}" not found — this row will be imported without a fleet assignment`);
        data.fleetId = undefined;
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
