import { EntityType, getAliasMap } from '../config/importAliases';

export interface ColumnMatch {
  sourceColumn: string;
  targetField: string | null;
  confidence: number; // 0–100
  autoMatched: boolean;
}

// ─── Levenshtein Distance ─────────────────────────────────────────────────────

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Create a (m+1) × (n+1) matrix
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1], // substitution
        );
      }
    }
  }

  return dp[m][n];
}

// ─── Similarity Score ─────────────────────────────────────────────────────────

export function similarityScore(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - distance / maxLen) * 100);
}

// ─── Normalise Header ─────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ');
}

// ─── Auto-Match Columns ───────────────────────────────────────────────────────

/**
 * For each source column header, attempt to match it to a target field for the
 * given entity type. Returns an array of ColumnMatch objects.
 *
 * Matching strategy:
 *   1. Exact match against field name (normalised) → confidence 100
 *   2. Exact match against any alias              → confidence 95
 *   3. Fuzzy match (Levenshtein) against field + aliases → confidence 50–90
 *   4. Pattern inference fallback (inferFieldFromData)   → confidence 40
 */
export function autoMatchColumns(
  headers: string[],
  entityType: EntityType,
): ColumnMatch[] {
  const aliasMap = getAliasMap(entityType);
  const usedFields = new Set<string>();

  return headers.map((header) => {
    const norm = normalise(header);

    let bestField: string | null = null;
    let bestScore = 0;

    for (const [field, aliases] of Object.entries(aliasMap)) {
      // Exact match against the field name itself
      const fieldNorm = normalise(field);
      if (norm === fieldNorm) {
        if (!usedFields.has(field)) {
          usedFields.add(field);
          return { sourceColumn: header, targetField: field, confidence: 100, autoMatched: true };
        }
      }

      // Exact match against any alias
      for (const alias of aliases) {
        if (norm === alias) {
          const score = 95;
          if (score > bestScore) { bestScore = score; bestField = field; }
        }
      }

      // Fuzzy match: take the best similarity across field name + all aliases
      const candidates = [fieldNorm, ...aliases];
      for (const candidate of candidates) {
        const score = similarityScore(norm, candidate);
        if (score > bestScore) { bestScore = score; bestField = field; }
      }
    }

    // Only auto-match if score is above threshold (≥60)
    if (bestScore >= 60 && bestField && !usedFields.has(bestField)) {
      usedFields.add(bestField);
      return {
        sourceColumn: header,
        targetField: bestField,
        confidence: bestScore,
        autoMatched: bestScore >= 80,
      };
    }

    // Low confidence — return a match but mark as not auto-matched
    if (bestField && !usedFields.has(bestField)) {
      return {
        sourceColumn: header,
        targetField: bestField,
        confidence: bestScore,
        autoMatched: false,
      };
    }

    return { sourceColumn: header, targetField: null, confidence: 0, autoMatched: false };
  });
}

// ─── Infer Field From Data ────────────────────────────────────────────────────

const SA_ID_RE = /^\d{13}$/;
const SA_PHONE_RE = /^(\+27|0)[6-8]\d{8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}|^\d{2}\/\d{2}\/\d{4}/;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;
// SA registration plate: up to 3 letters + up to 3 digits + 2-letter province code, e.g. CA123456
const SA_REG_RE = /^[A-Z]{1,3}\d{2,6}[A-Z]{2}$|^[A-Z]{2}\d{2,4}[A-Z]{2}$/i;

/**
 * Inspect a sample of column values to infer the likely field based on data patterns.
 * Returns the inferred field name or null.
 */
export function inferFieldFromData(
  columnData: string[],
  entityType: EntityType,
): string | null {
  // Take a sample of up to 20 non-empty values
  const sample = columnData.filter((v) => v != null && String(v).trim() !== '').slice(0, 20);
  if (sample.length === 0) return null;

  const hitRate = (re: RegExp) => sample.filter((v) => re.test(String(v).trim())).length / sample.length;

  if (hitRate(SA_ID_RE) > 0.6) return entityType === 'driver' ? 'saIdNumber' : null;
  if (hitRate(SA_PHONE_RE) > 0.5) return entityType === 'driver' ? 'mobileNumber' : null;
  if (hitRate(EMAIL_RE) > 0.5) return 'email';
  if (hitRate(VIN_RE) > 0.5) return entityType === 'vehicle' ? 'vinNumber' : null;
  if (hitRate(SA_REG_RE) > 0.5) return entityType === 'vehicle' ? 'registrationNumber' : null;
  // Date patterns are ambiguous (could be licenceExpiry, prdpExpiry, etc.) — skip inference

  return null;
}
