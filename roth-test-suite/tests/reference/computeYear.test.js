import { describe, it, expect } from 'vitest';
import { computeYear, ordRateAt } from '../../engine/index.js';

/**
 * TIER A — REFERENCE TESTS (externally derived from IRS 2026 law).
 *
 * A red test here means: either the engine is wrong, OR a published tax
 * figure changed and the constants need updating. It does NOT mean "the
 * output moved" — these values come from IRS worksheets, not from the code.
 *
 * Hygiene rule: every input field is pinned explicitly (stateRate, qdi, infl,
 * n65). A future default change must never turn a tax-arithmetic test red.
 * All 2026 cases; infl is irrelevant at year=BASE_YEAR (inflF=1) but pinned anyway.
 */

const base = { year: 2026, infl: 0, stateRate: 0, qdi: 0, ss: 0, n65: 0, taxExemptInterest: 0 };

describe('Tier A — computeYear reference cases (2026 IRS law)', () => {
  it('A1: MFJ std-ded only — TI and blended fed tax', () => {
    // ord 120,000; TI = 120,000 - 32,200 = 87,800
    // fed = 24,800*.10 + (87,800-24,800)*.12 = 2,480 + 7,560 = 10,040
    const r = computeYear({ ...base, status: 'mfj', ordinary: 120000 });
    expect(r.ti).toBeCloseTo(87800, 2);
    expect(r.fed).toBeCloseTo(10040, 2);
  });

  it('A2: single 22% bracket boundary — fed at boundary, then +$1 taxed at 22%', () => {
    // ord 66,500; TI = 66,500 - 16,100 = 50,400 (exact top of 12% bracket)
    // fed = 12,400*.10 + (50,400-12,400)*.12 = 1,240 + 4,560 = 5,800
    const r = computeYear({ ...base, status: 'single', ordinary: 66500 });
    expect(r.ti).toBeCloseTo(50400, 2);
    expect(r.fed).toBeCloseTo(5800, 2);
    // marginal rate on the next dollar of taxable income must be 22%
    expect(ordRateAt(50401, 'single', 2026, 0)).toBe(0.22);
    expect(ordRateAt(50400, 'single', 2026, 0)).toBe(0.12);
  });

  it('A3: MFJ Social Security 85% cap', () => {
    // ord 200,000, ss 50,000; PI = 200,000 + 25,000 = 225,000 >> 44,000 upper
    // taxable SS = 0.85 * 50,000 = 42,500 (statutory cap)
    const r = computeYear({ ...base, status: 'mfj', ordinary: 200000, ss: 50000 });
    expect(r.taxSS).toBeCloseTo(42500, 2);
  });

  it('A4: MFJ Social Security lower (50%) band', () => {
    // ord 20,000, ss 30,000, qdi 0; PI = 20,000 + 15,000 = 35,000
    // 32,000 < PI < 44,000 -> taxSS = min(0.5*(35,000-32,000), 0.5*30,000) = 1,500
    const r = computeYear({ ...base, status: 'mfj', ordinary: 20000, ss: 30000 });
    expect(r.taxSS).toBeCloseTo(1500, 2);
  });

  it('A5: MFJ NIIT lesser-of', () => {
    // ord 245,000, qdi 10,000, n65 0, no SS; MAGI = 255,000
    // NIIT = 0.038 * min(10,000, 255,000-250,000) = 0.038 * 5,000 = 190
    const r = computeYear({ ...base, status: 'mfj', ordinary: 245000, qdi: 10000 });
    expect(r.magi).toBe(255000); // MAGI = AGI here because taxExemptInterest is pinned to 0
    expect(r.niit).toBeCloseTo(190, 2);
  });

  it('A6: MFJ senior-bonus phase-out (pooled-phaseout interpretation)', () => {
    // NOTE: this expected value ENCODES the model design choice that the OBBBA
    // senior-bonus phase-out is applied ONCE against household MAGI, not per-person.
    // This is the natural reading for a joint return but is a design choice pending
    // CCO sign-off, not settled law. If the per-person reading is later adopted,
    // this expected value changes.
    //
    // n65 2, ord 200,000, no SS/QDI; MAGI = 200,000
    // bonus = 12,000 - 0.06*(200,000-150,000) = 12,000 - 3,000 = 9,000
    // deduction = std 32,200 + 65-addon 3,300 + bonus 9,000 = 44,500
    // TI = 200,000 - 44,500 = 155,500
    // fed = 2,480 + 9,120 + (155,500-100,800)*.22 = 2,480 + 9,120 + 12,034 = 23,634
    const r = computeYear({ ...base, status: 'mfj', ordinary: 200000, n65: 2 });
    expect(r.ti).toBeCloseTo(155500, 2);
    expect(r.fed).toBeCloseTo(23634, 2);
  });

  it('A7a: senior bonus expired by 2029 (infl=0, closed-form)', () => {
    // Same as A6 but year 2029, infl 0. Bonus = 0 (lastYear 2028).
    // deduction = 32,200 + 3,300 = 35,500; TI = 200,000 - 35,500 = 164,500
    // fed = 2,480 + 9,120 + (164,500-100,800)*.22 = 2,480 + 9,120 + 14,014 = 25,614
    const r = computeYear({ ...base, year: 2029, status: 'mfj', ordinary: 200000, n65: 2 });
    expect(r.ti).toBeCloseTo(164500, 2);
    expect(r.fed).toBeCloseTo(25614, 2);
  });

  it('A8: tax-exempt interest lifts MAGI above AGI; NIIT still lesser-of on MAGI', () => {
    // ord 245,000, qdi 10,000, tax-exempt 20,000.
    // AGI = 255,000 (muni not in AGI); MAGI = 255,000 + 20,000 = 275,000
    // NIIT = 0.038 * min(qdi 10,000, MAGI-250,000 = 25,000) = 0.038 * 10,000 = 380
    const r = computeYear({ ...base, status: 'mfj', ordinary: 245000, qdi: 10000, taxExemptInterest: 20000 });
    expect(r.agi).toBe(255000);
    expect(r.magi).toBe(275000);
    expect(r.niit).toBeCloseTo(380, 2);
  });
});
