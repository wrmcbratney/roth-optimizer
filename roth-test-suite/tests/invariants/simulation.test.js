import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  simulate, optimize, constPolicy, amtPolicy, computeYear, preserveBracket, irmaaTier,
} from '../../engine/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = name => JSON.parse(readFileSync(join(__dirname, '../fixtures', name), 'utf8'));

/**
 * TIER C — SIMULATION + OPTIMIZER.
 *
 * C1..C4 are reference-style (hand-derivable) simulation checks.
 * C5..C7 are property/invariant checks: they assert what the model is actually
 * GUARANTEED to satisfy, not exact values a heuristic optimizer might change.
 */

describe('C1 — single conversion cashflow (fully zeroed, conversion flow only)', () => {
  it('trad down by conversion, roth up by conversion, taxable down by incremental tax', () => {
    const M = fixture('basic-single-no-rmd.json'); // single, 65, no RMD, no growth/infl/qdi
    const conv = 100000;
    const sim = simulate(M, amtPolicy('conv', conv, 2026, 2026));
    const r = sim.rows.find(x => x.y === 2026);

    // pre-tax down by exactly the conversion (no growth)
    expect(r.trad).toBeCloseTo(500000 - conv, 2);
    // roth up by exactly the conversion (taxable pays the tax, so full amount lands)
    expect(r.roth).toBeCloseTo(conv, 2);

    // incremental tax = computeYear(conv) - computeYear(0), single 2026.
    // Fixture spouse born 1961 -> age 65 in 2026, so n65=1 (age-65 deduction + senior bonus apply).
    const t0 = computeYear({ year: 2026, status: 'single', n65: 1, ss: 0, ordinary: 0, qdi: 0, taxExemptInterest: 0, infl: 0, stateRate: 0 }).tax;
    const t1 = computeYear({ year: 2026, status: 'single', n65: 1, ss: 0, ordinary: conv, qdi: 0, taxExemptInterest: 0, infl: 0, stateRate: 0 }).tax;
    expect(r.taxable).toBeCloseTo(500000 - (t1 - t0), 2);
    // year tax equals computeYear on the converted income
    expect(r.tax).toBeCloseTo(t1, 2);
    // no IRMAA in 2026: the two-year lookback (2024) is seeded to 0, and
    // current-year MAGI never creates current-year IRMAA (it lands two years out).
    expect(r.irm).toBe(0);
  });
});

describe('C2 — fill-12%-bracket lands TI at the bracket top (conditional)', () => {
  it('when baseline income is below target and pre-tax balance is available, TI hits 100,800*inflF', () => {
    // MFJ, both 64 (no RMD, no SS yet), large pre-tax, no other income -> baseline TI ~0.
    const M = {
      status: 'mfj', startYear: 2026, endAge: 66,
      magiPrev1: 0, magiPrev2: 0,
      spouses: [
        { name: 'A', by: 1962, deathAge: null, ss: 0, ssAge: 70, pen: 0, oth: 0, othEnd: 0, trad: 1000000 },
        { name: 'B', by: 1962, deathAge: null, ss: 0, ssAge: 70, pen: 0, oth: 0, othEnd: 0, trad: 1000000 },
      ],
      roth: 0, taxable: 1000000,
      gTrad: 0, gRoth: 0, gTax: 0, yTax: 0,
      infl: 0, cola: 0, stateRate: 0, heir: 0, disc: 0, penSurv: 0.5,
      convStart: 2026, convEnd: 2026, fixedAmt: 0, _noSens: true,
    };
    const sim = simulate(M, constPolicy('b12', 'b12', 2026, 2026));
    const r = sim.rows.find(x => x.y === 2026);
    // precondition holds (baseline below target, balance available), so TI == 100,800 (infl 0)
    expect(r.ti).toBeCloseTo(100800, 0);
  });

  it('when baseline income already exceeds the target, conversion is zero (no forced downshift)', () => {
    // Give large pensions so baseline TI already exceeds the 12% top; fill-12% must not convert.
    const M = {
      status: 'mfj', startYear: 2026, endAge: 66,
      magiPrev1: 0, magiPrev2: 0,
      spouses: [
        { name: 'A', by: 1962, deathAge: null, ss: 0, ssAge: 70, pen: 150000, oth: 0, othEnd: 0, trad: 1000000 },
        { name: 'B', by: 1962, deathAge: null, ss: 0, ssAge: 70, pen: 0, oth: 0, othEnd: 0, trad: 0 },
      ],
      roth: 0, taxable: 1000000,
      gTrad: 0, gRoth: 0, gTax: 0, yTax: 0,
      infl: 0, cola: 0, stateRate: 0, heir: 0, disc: 0, penSurv: 0.5,
      convStart: 2026, convEnd: 2026, fixedAmt: 0, _noSens: true,
    };
    const sim = simulate(M, constPolicy('b12', 'b12', 2026, 2026));
    const r = sim.rows.find(x => x.y === 2026);
    expect(r.conv).toBe(0);
  });
});

describe('C3 — IRMAA caused this year is paid two years later', () => {
  it('a conversion over the tier-0 threshold creates no current IRMAA, but surcharge appears in yr+2', () => {
    // Both spouses 66 in 2026 (born 1960) -> enrolled now. No lookback seed, so year-1 paid = 0.
    // Convert enough to push MAGI over tier 0; assert irm in 2026 is 0 (its own lookback empty)
    // and the surcharge shows up in 2028.
    const M = {
      status: 'mfj', startYear: 2026, endAge: 90,
      magiPrev1: 0, magiPrev2: 0,
      spouses: [
        { name: 'A', by: 1960, deathAge: null, ss: 0, ssAge: 70, pen: 0, oth: 0, othEnd: 0, trad: 1000000 },
        { name: 'B', by: 1960, deathAge: null, ss: 0, ssAge: 70, pen: 0, oth: 0, othEnd: 0, trad: 1000000 },
      ],
      roth: 0, taxable: 2000000,
      gTrad: 0, gRoth: 0, gTax: 0, yTax: 0,
      infl: 0, cola: 0, stateRate: 0, heir: 0, disc: 0, penSurv: 0.5,
      convStart: 2026, convEnd: 2026, fixedAmt: 0, _noSens: true,
    };
    const sim = simulate(M, amtPolicy('big', 300000, 2026, 2026)); // MAGI 2026 ~300k -> tier 1
    const y2026 = sim.rows.find(r => r.y === 2026);
    const y2028 = sim.rows.find(r => r.y === 2028);
    // the conversion pushed 2026 MAGI into a surcharge tier
    expect(irmaaTier(y2026.magi, 'mfj', 2026, 0)).toBeGreaterThanOrEqual(1);
    // but 2026 pays nothing (its own lookback = 2024, seeded 0)
    expect(y2026.irm).toBe(0);
    // and the surcharge lands in 2028 (two years later)
    expect(y2028.irm).toBeGreaterThan(0);
    // internal consistency: caused-in-2026 equals paid-in-2028
    expect(y2026.irmCaused).toBeCloseTo(y2028.irm, 2);
    // reference-adjacent dollar check: 2026 MAGI (~300k) is tier 1; both spouses
    // enrolled by 2028; surcharge = 2 * 12 * (202.90 + 37.50) = 5,769.60 (infl 0)
    expect(irmaaTier(y2026.magi, 'mfj', 2028, 0)).toBe(1);
    expect(y2028.irm).toBeCloseTo(5769.60, 2);
  });
});

describe('C4 — widow transition (split into independent assertions)', () => {
  const M = fixture('widow-transition.json'); // A dies at 80 (born 1951 -> death year 2031)
  const sim = simulate(M, constPolicy('none', 'none', 2026, 2026));
  const deathYear = 1951 + 80;        // 2031
  const afterDeath = sim.rows.find(r => r.y === deathYear + 1); // 2032, first survivor year
  const beforeDeath = sim.rows.find(r => r.y === deathYear - 1);

  it('C4a: filing status flips to single the year after death', () => {
    expect(beforeDeath.status).toBe('mfj');
    expect(afterDeath.status).toBe('single');
  });

  it('C4b: survivor Social Security becomes the larger of the two benefits', () => {
    // A ss 40,000 > B ss 25,000; survivor keeps 40,000 (COLA 0 here)
    expect(afterDeath.ss).toBeCloseTo(40000, 2);
  });

  it('C4c: widow penalty — same income taxes higher as single, and single IRMAA thresholds are lower', () => {
    // Direct bracket-compression test: hold income constant, flip filing status.
    const inc = { year: 2032, n65: 1, ss: 40000, ordinary: 60000, qdi: 0, taxExemptInterest: 0, infl: 0, stateRate: 0 };
    const asSingle = computeYear({ ...inc, status: 'single' });
    const asMFJ = computeYear({ ...inc, status: 'mfj' });
    // same income is taxed MORE as a single filer (compressed brackets + smaller deduction)
    expect(asSingle.tax).toBeGreaterThan(asMFJ.tax);
    // and the same MAGI sits at an equal-or-higher IRMAA tier as single (lower thresholds)
    const magi = asSingle.magi;
    expect(irmaaTier(magi, 'single', 2032, 0)).toBeGreaterThanOrEqual(irmaaTier(magi, 'mfj', 2032, 0));
  });

  it('C4d: year-of-death RMD assumption — default (true) takes full RMD in death year, no extra beneficiary RMD', () => {
    // Default flag: decedent (age 80, RMD-age) takes a normal full-year RMD in the
    // death year via the living loop; NO additional beneficiary RMD in the transfer year.
    const simDefault = simulate(M, constPolicy('none', 'none', 2026, 2026));
    const dYear = simDefault.rows.find(r => r.y === deathYear);
    expect(dYear.rmd).toBeGreaterThan(0); // decedent took a death-year RMD while living

    // Flag false: model the decedent NOT having satisfied it -> an additional beneficiary
    // RMD is forced in the transfer year, raising that year's taxable income vs default.
    const Mfalse = { ...M, assumeYearOfDeathRMDSatisfied: false };
    const simFalse = simulate(Mfalse, constPolicy('none', 'none', 2026, 2026));
    const transferYearDefault = simDefault.rows.find(r => r.y === deathYear + 1);
    const transferYearFalse = simFalse.rows.find(r => r.y === deathYear + 1);
    // the false branch forces additional ordinary income in the transfer year
    expect(transferYearFalse.ti).toBeGreaterThan(transferYearDefault.ti);
    // and specifically it's an RMD that rose — proving the flag does its exact job,
    // not just that some income changed
    expect(transferYearFalse.rmd).toBeGreaterThan(transferYearDefault.rmd);
  });
});

describe('C5 — baseline monotonicity + optimizer liveness (property, not point)', () => {
  const mk = trad => ({
    status: 'single', startYear: 2026, endAge: 90,
    magiPrev1: 0, magiPrev2: 0,
    spouses: [{ name: 'A', by: 1953, deathAge: null, ss: 0, ssAge: 67, pen: 0, oth: 0, othEnd: 0, trad }],
    roth: 0, taxable: 1000000,
    gTrad: 0, gRoth: 0, gTax: 0, yTax: 0,
    infl: 0, cola: 0, stateRate: 0, heir: 0, disc: 0, penSurv: 0.5,
    objective: 'minTotalPV', allowForcedDraws: false,
    convStart: 2026, convEnd: 2035, fixedAmt: 0, _noSens: true,
  });

  it('baseline RMDs and lifetime tax are higher for the larger pre-tax balance', () => {
    const lo = simulate(mk(400000), { name: 'baseline', perYear: {} });
    const hi = simulate(mk(2000000), { name: 'baseline', perYear: {} });
    const loRMD = lo.rows.reduce((a, r) => a + r.rmd, 0);
    const hiRMD = hi.rows.reduce((a, r) => a + r.rmd, 0);
    expect(hiRMD).toBeGreaterThan(loRMD);
    expect(hi.tax.nom).toBeGreaterThan(lo.tax.nom);
  });

  it('optimizer returns finite, executable strategies for both balances', () => {
    for (const trad of [400000, 2000000]) {
      const M = mk(trad);
      const res = optimize(M);
      expect(res.refined).toBeTruthy();
      expect(Number.isFinite(res.refined.total.pv)).toBe(true);
      // winner must not be a liquidity-failed strategy when forced draws are off
      expect(res.refined.failed).toBe(false);
      // core optimizer guarantee: the chosen strategy scores at least as well as
      // baseline under the selected objective (minTotalPV -> higher score = lower total)
      const objF = s => -(s.total.pv); // matches OBJECTIVES.minTotalPV.f
      expect(objF(res.refined)).toBeGreaterThanOrEqual(objF(res.baseline) - 1);
    }
    // NOTE: deliberately NOT asserting conversion-amount monotonicity between the
    // two balances — the optimizer is a heuristic over discontinuous thresholds and
    // may legitimately convert more in the smaller-balance case.
  });
});

describe('C6 — liquidity disqualification gate', () => {
  const M = fixture('liquidity-fail.json'); // huge pre-tax, tiny taxable -> aggressive conv fails

  it('a strategy that runs the taxable account negative is tagged failed', () => {
    // Force a big conversion the tiny taxable account cannot fund.
    const sim = simulate(M, amtPolicy('too big', 500000, 2026, 2030));
    expect(sim.failed).toBe(true);
    expect(sim.rows.some(r => r.unpaid > 0)).toBe(true);
  });

  it('failed strategies are not selected when allowForcedDraws is false', () => {
    const res = optimize({ ...M, objective: 'minTotalPV', allowForcedDraws: false });
    expect(res.refined.failed).toBe(false); // winner is a non-failed strategy
    // failed strategies remain VISIBLE in the strategy list (disqualified, not deleted)
    expect(res.strategies.some(s => s.failed)).toBe(true);
  });

  it('with forced draws allowed, optimizer still returns finite output even when failed strategies are eligible', () => {
    const res = optimize({ ...M, objective: 'minTotalPV', allowForcedDraws: true });
    // with the override on, failed strategies are no longer score-disqualified;
    // the optimizer must still return a finite, executable result
    expect(Number.isFinite(res.refined.total.pv)).toBe(true);
  });
});

describe('C7 — preserve-RMD strategy: produces and suppresses', () => {
  it('produces a policy ending before first RMD year when baseline RMDs exceed the bracket', () => {
    // Large pre-tax so first-RMD-year income would exceed the 12% top without conversions.
    const M = {
      status: 'single', startYear: 2026, endAge: 90,
      magiPrev1: 0, magiPrev2: 0,
      spouses: [{ name: 'A', by: 1958, deathAge: null, ss: 0, ssAge: 70, pen: 0, oth: 0, othEnd: 0, trad: 2000000 }],
      roth: 0, taxable: 1000000,
      gTrad: 0, gRoth: 0, gTax: 0, yTax: 0,
      infl: 0, cola: 0, stateRate: 0, heir: 0, disc: 0, penSurv: 0.5,
      convStart: 2026, convEnd: 2040, fixedAmt: 0, _noSens: true,
    };
    const strat = preserveBracket(M, 2, 'Preserve 12%'); // topIdx 2 = top of 12% band
    expect(strat).toBeTruthy();
    // first RMD year for born 1958 is 1958+73 = 2031; policy must end before it
    const firstRMD = 1958 + 73;
    const convYears = Object.keys(strat.policy.perYear).map(Number);
    expect(Math.max(...convYears)).toBeLessThan(firstRMD);
    // AND the strategy must actually preserve bracket capacity: first-RMD-year
    // taxable income should land at or just below the 12% bracket top. This is a
    // SINGLE filer, so the 12% top is 50,400 (not the MFJ 100,800). preserveBracket
    // sizes conversions so the first RMD year lands AT the target.
    const firstRmdRow = strat.rows.find(r => r.y === firstRMD);
    expect(firstRmdRow).toBeTruthy();
    expect(firstRmdRow.status).toBe('single');           // confirm the filing-status assumption
    expect(firstRmdRow.ti).toBeLessThanOrEqual(50400 * 1.02); // at or near the single 12% top
    expect(firstRmdRow.ti).toBeGreaterThan(50400 * 0.5);       // and meaningfully filled, not trivially low
  });

  it('null case: when baseline RMD income already fits under the bracket, no strategy is generated', () => {
    // Small pre-tax so first-RMD-year RMD is tiny and already fits the 12% band.
    const M = {
      status: 'single', startYear: 2026, endAge: 90,
      magiPrev1: 0, magiPrev2: 0,
      spouses: [{ name: 'A', by: 1958, deathAge: null, ss: 0, ssAge: 70, pen: 0, oth: 0, othEnd: 0, trad: 50000 }],
      roth: 0, taxable: 1000000,
      gTrad: 0, gRoth: 0, gTax: 0, yTax: 0,
      infl: 0, cola: 0, stateRate: 0, heir: 0, disc: 0, penSurv: 0.5,
      convStart: 2026, convEnd: 2040, fixedAmt: 0, _noSens: true,
    };
    const strat = preserveBracket(M, 2, 'Preserve 12%');
    expect(strat).toBeNull(); // baseline already fits -> suppressed
  });
});

describe('C8 — yTax=0 drag-flip regression (invariant)', () => {
  it('yTax = 0 runs without NaN or non-finite output', () => {
    const M = fixture('basic-single-no-rmd.json'); // yTax already 0
    const sim = simulate(M, amtPolicy('conv', 50000, 2026, 2026));
    expect(sim.rows.every(r => [r.tax, r.irm, r.wealth, r.trad, r.roth, r.taxable, r.qdi].every(Number.isFinite))).toBe(true);
    // qdi must be exactly 0 when yTax is 0 (no dividend drag)
    expect(sim.rows.every(r => r.qdi === 0)).toBe(true);
  });
});
