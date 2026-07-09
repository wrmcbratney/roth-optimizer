import { describe, it, expect } from 'vitest';
import { computeYear } from '../../engine/index.js';

/**
 * INVARIANT — model wiring/design checks (NOT published law).
 *
 * A red test here means the model's internal wiring changed, not that a tax
 * figure is wrong.
 *
 * HISTORY: this invariant originally locked the known simplification magi===agi
 * (tax-exempt interest not modeled). taxExemptInterest was then added
 * deliberately, so the invariant was intentionally updated to
 * magi === agi + taxExemptInterest. With the field defaulting to 0, the
 * zero-input case still satisfies magi === agi, proving the change was additive
 * and did not disturb existing behavior.
 *
 * Current law: IRMAA/NIIT MAGI = AGI + tax-exempt (muni) interest.
 */

const base = { year: 2026, infl: 0, stateRate: 0, qdi: 0, ss: 0, n65: 0 };

describe('Invariant — MAGI equals AGI plus tax-exempt interest', () => {
  it('B4a: with no tax-exempt interest, magi === agi (unchanged behavior)', () => {
    const cases = [
      { ...base, status: 'mfj', ordinary: 50000 },
      { ...base, status: 'mfj', ordinary: 250000, qdi: 30000 },
      { ...base, status: 'mfj', ordinary: 200000, ss: 50000 },
      { ...base, status: 'single', ordinary: 120000, qdi: 10000, n65: 1 },
    ];
    for (const c of cases) {
      const r = computeYear(c);
      expect(r.magi).toBe(r.agi);
    }
  });

  it('B4b: tax-exempt interest is added back to MAGI but not AGI', () => {
    const r = computeYear({ ...base, status: 'mfj', ordinary: 200000, taxExemptInterest: 15000 });
    expect(r.magi).toBe(r.agi + 15000);
    // AGI/taxable income are unaffected by muni interest
    const r0 = computeYear({ ...base, status: 'mfj', ordinary: 200000 });
    expect(r.agi).toBe(r0.agi);
    expect(r.ti).toBe(r0.ti);
    expect(r.fed).toBe(r0.fed);
  });

  it('B4c: tax-exempt interest lifts Social Security provisional income', () => {
    // ord 20,000, ss 30,000 alone -> taxSS 1,500 (A4). Adding 10,000 muni pushes
    // provisional income from 35,000 to 45,000 (over the 44,000 upper threshold),
    // increasing taxable SS. Assert it strictly increased.
    const noMuni = computeYear({ ...base, status: 'mfj', ordinary: 20000, ss: 30000 });
    const withMuni = computeYear({ ...base, status: 'mfj', ordinary: 20000, ss: 30000, taxExemptInterest: 10000 });
    expect(withMuni.taxSS).toBeGreaterThan(noMuni.taxSS);
  });
});

/**
 * Senior-bonus-absent invariant (moved here from Tier A — it checks a model
 * invariant under indexed deductions, not a single closed-form published figure,
 * so it belongs in invariants to keep the folder taxonomy strict).
 */
describe('Invariant — no senior bonus after 2028 under indexed deductions', () => {
  it('A7b: 2029 deduction equals indexed std + indexed 65-addon, with NO bonus term', () => {
    const infl = 0.025;
    const yr = 2029;
    const r = computeYear({ ...base, year: yr, infl, status: 'mfj', ordinary: 200000, n65: 2 });
    const f = Math.pow(1 + infl, yr - 2026);
    const expectedDed = 32200 * f + 2 * 1650 * f; // std + two 65-addons, NO bonus
    const expectedTI = 200000 - expectedDed;       // agi = 200,000 (no SS/QDI)
    expect(r.ti).toBeCloseTo(expectedTI, 2);
  });
});
