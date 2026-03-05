// ---------------------------------------------------------------------------
// VAT Configuration — South African VAT
// Current rate: 15% (effective 2018-04-01)
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const VAT_CONFIG = {
  rate: 0.15,
  rateDisplay: '15%',
  effectiveFrom: '2018-04-01',

  /**
   * Extract VAT from a VAT-inclusive amount (standard for SA fuel pumps).
   * totalInclVat = exclVat * 1.15
   * vatAmount = totalInclVat - (totalInclVat / 1.15)
   */
  calculateVatInclusive(totalInclVat: number): { exclVat: number; vatAmount: number; inclVat: number } {
    const exclVat = totalInclVat / (1 + this.rate);
    const vatAmount = totalInclVat - exclVat;
    return { exclVat: round2(exclVat), vatAmount: round2(vatAmount), inclVat: round2(totalInclVat) };
  },

  /**
   * Add VAT to a VAT-exclusive amount.
   */
  calculateVatExclusive(totalExclVat: number): { exclVat: number; vatAmount: number; inclVat: number } {
    const vatAmount = totalExclVat * this.rate;
    const inclVat = totalExclVat + vatAmount;
    return { exclVat: round2(totalExclVat), vatAmount: round2(vatAmount), inclVat: round2(inclVat) };
  },
} as const;
