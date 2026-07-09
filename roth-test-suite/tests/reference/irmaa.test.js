import { describe, it, expect } from 'vitest';
import { irmaaTier, irmaaThreshAt, simulate, constPolicy } from '../../engine/index.js';

/**
 * TIER B — IRMAA (reference category, except B4 which is invariant).
 *
 * B1/B2/B3 assert published CMS 2026 law and the two-year lookback mechanic.
 * B4 lives in tests/invariants (magi === agi is a model design choice, not law).
 */

describe('Tier B — IRMAA boundaries and lookback (reference)', () => {
  it('B1: cliff boundaries, MFJ 2026, infl 0', () => {
    // Lower cliff: no surcharge -> first surcharge at 218,000
    expect(irmaaTier(218000, 'mfj', 2026, 0)).toBe(-1); // at threshold, not above
    expect(irmaaTier(218001, 'mfj', 2026, 0)).toBe(0);  // first surcharge tier
    // Tier 0 -> tier 1 at 274,000
    expect(irmaaTier(274000, 'mfj', 2026, 0)).toBe(0);
    expect(irmaaTier(274001, 'mfj', 2026, 0)).toBe(1);
  });

  it('B2: two-year lookback drives year-1 surcharge by MAGI from year-1 minus 2', () => {
    // Design: seed magiPrev2 = 300,000 (tier 1, i.e. second surcharge bracket).
    // Keep year-1 OWN magi deliberately LOW (tier -1) so that a broken lookback
    // reading the wrong year would produce a DIFFERENT surcharge. The tiers must
    // disagree for this test to have teeth.
    //
    // Both spouses already 65+ in year 1 (born 1958 -> age 68 in 2026) => enrolled = 2.
    // Expected year-1 irm = 2 * irmaaAnnualPerPerson(tier1) = 2 * 2,884.80 = 5,769.60
    const M = {
      status: 'mfj', startYear: 2026, endAge: 90,
      magiPrev1: 0, magiPrev2: 300000,       // <-- the seed under test
      spouses: [
        { name: 'A', by: 1958, deathAge: null, ss: 0, ssAge: 62, pen: 0, oth: 0, othEnd: 0, trad: 0 },
        { name: 'B', by: 1958, deathAge: null, ss: 0, ssAge: 62, pen: 0, oth: 0, othEnd: 0, trad: 0 },
      ],
      roth: 0, taxable: 1000000,             // ample liquidity, no forced draws
      gTrad: 0, gRoth: 0, gTax: 0, yTax: 0,  // no drag: keeps year-1 own MAGI at 0 (tier -1)
      infl: 0, cola: 0, stateRate: 0, heir: 0, disc: 0, penSurv: 0.5,
      convStart: 2026, convEnd: 2026, fixedAmt: 0, _noSens: true,
    };
    const sim = simulate(M, constPolicy('none', 'none', 2026, 2026));
    const y1 = sim.rows.find(r => r.y === 2026);
    // year-1 own MAGI must be in tier -1 (no surcharge) so the tiers genuinely disagree
    expect(irmaaTier(y1.magi, 'mfj', 2026, 0)).toBe(-1);
    // but the surcharge PAID must reflect the 2-years-prior seed (tier 1), 2 people
    expect(y1.irm).toBeCloseTo(5769.60, 2);
  });

  it('B2b: same lookback with a single enrolled person halves the surcharge', () => {
    const M = {
      status: 'mfj', startYear: 2026, endAge: 90,
      magiPrev1: 0, magiPrev2: 300000,
      spouses: [
        { name: 'A', by: 1958, deathAge: null, ss: 0, ssAge: 62, pen: 0, oth: 0, othEnd: 0, trad: 0 }, // 65+
        { name: 'B', by: 1970, deathAge: null, ss: 0, ssAge: 62, pen: 0, oth: 0, othEnd: 0, trad: 0 }, // under 65
      ],
      roth: 0, taxable: 1000000,
      gTrad: 0, gRoth: 0, gTax: 0, yTax: 0,
      infl: 0, cola: 0, stateRate: 0, heir: 0, disc: 0, penSurv: 0.5,
      convStart: 2026, convEnd: 2026, fixedAmt: 0, _noSens: true,
    };
    const sim = simulate(M, constPolicy('none', 'none', 2026, 2026));
    const y1 = sim.rows.find(r => r.y === 2026);
    // only one enrolled -> single surcharge = 2,884.80
    expect(y1.irm).toBeCloseTo(2884.80, 2);
  });

  it('B3: top tier frozen through 2027, indexes from 2028', () => {
    expect(irmaaThreshAt(4, 'mfj', 2027, 0.025)).toBeCloseTo(750000, 2);
    expect(irmaaThreshAt(4, 'mfj', 2029, 0.025)).toBeCloseTo(750000 * 1.025, 2);
  });
});
