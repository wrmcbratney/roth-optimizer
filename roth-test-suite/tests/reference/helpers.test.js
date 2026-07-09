import { describe, it, expect } from 'vitest';
import {
  bracketTax, ltcgTax, ordRateAt,
  irmaaThreshAt, irmaaTier, irmaaAnnualPerPerson,
  rmdAge, ultAt, TT,
} from '../../engine/index.js';

/**
 * STEP 4 — DIRECT HELPER TESTS (reference category).
 *
 * These test the primitives directly, not through computeYear/simulate.
 * A bug in a helper (e.g. an off-by-one in the ULT lookup) can be absorbed
 * into a plausible-looking household total; tested in isolation, the error
 * is unambiguous. All values hand-derived. Inputs pinned; infl/f explicit.
 */

describe('bracketTax — MFJ ordinary table, f=1 (2026)', () => {
  const mfj = TT.ordinary.mfj;

  it('below first breakpoint is all 10%', () => {
    // 20,000 all in 10% band -> 2,000
    expect(bracketTax(20000, mfj, 1)).toBeCloseTo(2000, 2);
  });

  it('exactly at 12%-band top (100,800) blends 10% + 12%', () => {
    // 24,800*.10 + (100,800-24,800)*.12 = 2,480 + 9,120 = 11,600
    expect(bracketTax(100800, mfj, 1)).toBeCloseTo(11600, 2);
  });

  it('into the 22% band', () => {
    // 155,500: 2,480 + 9,120 + (155,500-100,800)*.22 = 2,480+9,120+12,034 = 23,634
    expect(bracketTax(155500, mfj, 1)).toBeCloseTo(23634, 2);
  });

  it('zero income is zero tax', () => {
    expect(bracketTax(0, mfj, 1)).toBe(0);
  });

  it('inflation factor scales the breakpoints', () => {
    // With f=1.1, the 10% band top is 24,800*1.1 = 27,280.
    // 27,280 of income is all 10% -> 2,728
    expect(bracketTax(27280, mfj, 1.1)).toBeCloseTo(2728, 2);
  });
});

describe('ltcgTax — QDI stacked above ordinary TI', () => {
  const f = 1;

  it('QDI entirely within the 0% band pays nothing', () => {
    // MFJ 0% band tops at 98,900. ordTI=50,000, qdi=40,000 -> top of stack 90,000 < 98,900
    expect(ltcgTax(50000, 40000, 'mfj', f)).toBeCloseTo(0, 2);
  });

  it('QDI straddling 0% -> 15% taxes only the portion above the band', () => {
    // ordTI=90,000, qdi=20,000 -> stack 90,000..110,000; 0% band top 98,900
    // taxed at 15%: (110,000-98,900) = 11,100 * .15 = 1,665
    expect(ltcgTax(90000, 20000, 'mfj', f)).toBeCloseTo(1665, 2);
  });

  it('QDI entirely above the 0% band is all 15% (below 20% threshold)', () => {
    // ordTI=200,000 (above 98,900), qdi=50,000, stack ends 250,000 < 613,700
    // all 50,000 at 15% = 7,500
    expect(ltcgTax(200000, 50000, 'mfj', f)).toBeCloseTo(7500, 2);
  });

  it('zero QDI is zero tax', () => {
    expect(ltcgTax(120000, 0, 'mfj', f)).toBe(0);
  });
});

describe('ordRateAt — statutory marginal rate on ordinary TI', () => {
  it('MFJ 12%/22% boundary at 100,800 (2026, infl 0)', () => {
    expect(ordRateAt(100800, 'mfj', 2026, 0)).toBe(0.12);
    expect(ordRateAt(100801, 'mfj', 2026, 0)).toBe(0.22);
  });

  it('single 12%/22% boundary at 50,400', () => {
    expect(ordRateAt(50400, 'single', 2026, 0)).toBe(0.12);
    expect(ordRateAt(50401, 'single', 2026, 0)).toBe(0.22);
  });

  it('first dollar is 10%', () => {
    expect(ordRateAt(0, 'mfj', 2026, 0)).toBe(0.10);
  });

  it('top bracket is 37%', () => {
    expect(ordRateAt(800000, 'mfj', 2026, 0)).toBe(0.37);
  });
});

describe('irmaaThreshAt / irmaaTier — 2026 MFJ, infl 0', () => {
  it('threshold values match CMS 2026 MFJ table', () => {
    const want = [218000, 274000, 342000, 410000, 750000];
    want.forEach((v, i) => expect(irmaaThreshAt(i, 'mfj', 2026, 0)).toBeCloseTo(v, 2));
  });

  it('tier is zero-based: -1 no surcharge, 0 first tier, 1 second tier', () => {
    expect(irmaaTier(200000, 'mfj', 2026, 0)).toBe(-1); // below 218k
    expect(irmaaTier(250000, 'mfj', 2026, 0)).toBe(0);  // in 218k..274k
    expect(irmaaTier(300000, 'mfj', 2026, 0)).toBe(1);  // in 274k..342k
    expect(irmaaTier(800000, 'mfj', 2026, 0)).toBe(4);  // above top threshold
  });

  it('top tier is frozen until 2028, then indexes from 2028', () => {
    expect(irmaaThreshAt(4, 'mfj', 2027, 0.025)).toBeCloseTo(750000, 2); // frozen
    // 2029 = 2 years... no: indexes FROM 2028, so 2029 is one year of growth
    expect(irmaaThreshAt(4, 'mfj', 2029, 0.025)).toBeCloseTo(750000 * 1.025, 2);
  });

  it('lower tiers (0..3) index every year from BASE_YEAR', () => {
    // tier-1 threshold 274,000 grown one year at 2.5%
    expect(irmaaThreshAt(1, 'mfj', 2027, 0.025)).toBeCloseTo(274000 * 1.025, 2);
  });
});

describe('irmaaAnnualPerPerson — surcharge dollars (2026, infl 0)', () => {
  it('no surcharge below tier 0', () => {
    expect(irmaaAnnualPerPerson(-1, 2026, 0)).toBe(0);
  });

  it('tier-1 (second bracket) annual per person = 12*(202.90+37.50) = 2,884.80', () => {
    // surchB[1]=202.90, surchD[1]=37.50
    expect(irmaaAnnualPerPerson(1, 2026, 0)).toBeCloseTo(2884.80, 2);
  });

  it('tier-0 (first bracket) annual per person = 12*(81.20+14.50) = 1,148.40', () => {
    expect(irmaaAnnualPerPerson(0, 2026, 0)).toBeCloseTo(1148.40, 2);
  });
});

describe('rmdAge / ultAt — RMD primitives', () => {
  it('SECURE 2.0 start age: 73 for born <=1959, 75 for born >=1960', () => {
    expect(rmdAge(1959)).toBe(73);
    expect(rmdAge(1960)).toBe(75);
    expect(rmdAge(1950)).toBe(73);
  });

  it('Uniform Lifetime Table factors match IRS values', () => {
    expect(ultAt(73)).toBe(26.5);
    expect(ultAt(75)).toBe(24.6);
    expect(ultAt(80)).toBe(20.2);
    expect(ultAt(90)).toBe(12.2);
  });

  it('ultAt clamps below 72 and above 120', () => {
    expect(ultAt(70)).toBe(TT.ult[72]); // clamped up to 72
    expect(ultAt(130)).toBe(TT.ult[120]); // clamped down to 120
  });
});
