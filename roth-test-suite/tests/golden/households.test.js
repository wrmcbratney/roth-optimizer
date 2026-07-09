import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { simulate, optimize, constPolicy } from '../../engine/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = name => JSON.parse(readFileSync(join(__dirname, '../fixtures', name), 'utf8'));

/**
 * GOLDEN SNAPSHOTS — full household outputs, frozen after manual review.
 *
 * A red test here does NOT mean anything is wrong. It means the output CHANGED
 * and a human must review whether the change was intended. If intended, update
 * the snapshot deliberately (vitest -u) and note why in the commit.
 *
 * These are NOT proof of law (that's tests/reference) and NOT wiring checks
 * (that's tests/invariants). They are drift detectors.
 *
 * We snapshot a compact projection of each run (rounded, key fields only) so the
 * snapshot is readable and stable against floating-point noise.
 */

const round = v => (typeof v === 'number' ? Math.round(v) : v);
const projectRow = r => ({
  y: r.y, status: r.status, conv: round(r.conv), tax: round(r.tax),
  irm: round(r.irm), magi: round(r.magi), ti: round(r.ti),
  trad: round(r.trad), roth: round(r.roth), taxable: round(r.taxable),
});
const projectRun = sim => ({
  failed: sim.failed,
  totalNom: round(sim.total.nom),
  terminalNom: round(sim.terminal.nom),
  rows: sim.rows.map(projectRow),
});

describe('Golden — basic single, no RMD, $100k conversion', () => {
  it('matches reviewed snapshot', () => {
    const M = fixture('basic-single-no-rmd.json');
    const sim = simulate(M, { name: 'conv', perYear: { 2026: { kind: 'amt', amt: 100000 } } });
    expect(projectRun(sim)).toMatchSnapshot();
  });
});

describe('Golden — widow transition household (baseline, no conversions)', () => {
  it('matches reviewed snapshot', () => {
    const M = fixture('widow-transition.json');
    const sim = simulate(M, constPolicy('none', 'none', 2026, 2026));
    expect(projectRun(sim)).toMatchSnapshot();
  });
});

describe('Golden — optimizer winner on widow household', () => {
  it('winner strategy summary matches reviewed snapshot', () => {
    const M = { ...fixture('widow-transition.json'), objective: 'minTotalPV', allowForcedDraws: false };
    const res = optimize(M);
    expect({
      failed: res.refined.failed,
      convTot: round(res.refined.convTot),
      totalNom: round(res.refined.total.nom),
      terminalNom: round(res.refined.terminal.nom),
    }).toMatchSnapshot();
  });
});
