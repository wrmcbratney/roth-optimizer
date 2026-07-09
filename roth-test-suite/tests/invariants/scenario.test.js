import { describe, it, expect } from 'vitest';
import {
  fieldsToModel, serializeScenario, deserializeScenario, simulate, constPolicy,
} from '../../engine/index.js';

/**
 * INVARIANT — scenario serialization integrity.
 *
 * The canary for DROPPED persistence fields. A zero-default fixture can't catch
 * this: zero survives a dropped field. We use a NONZERO value, round-trip it
 * through serialize -> deserialize -> model, and assert the simulation output is
 * identical. If taxExemptInterest (or any field) were missing from the save/load
 * enumeration, the reloaded run would differ and this test would fail.
 */

// A representative field/check map as it would come from the form.
const fields = {
  hhType: 'mfj', roth: '100000', taxable: '400000',
  s1name: 'A', s1by: '1958', s1trad: '800000', s1ss: '40000',
  s2name: 'B', s2by: '1960', s2trad: '300000', s2ss: '25000',
  s1ssage: '67', s1pen: '0', s1oth: '0', s1othend: '65',
  s2ssage: '67', s2pen: '0', s2oth: '0', s2othend: '65',
  magiPrev2: '', magiPrev1: '',
  taxExemptInterest: '18000',   // <-- the nonzero value under test
  penSurv: '50',
  s1death: '', s2death: '',
  gTrad: '0', gRoth: '0', gTax: '0', yTax: '0',
  infl: '0', cola: '0', state: '0', heir: '22', disc: '0', endAge: '90',
  objective: 'minTotalPV', convStart: '2026', convEnd: '2030', fixedAmt: '0',
};
const checks = { survToggle: false, allowForced: false };

describe('Invariant — scenario serialization preserves nonzero tax-exempt interest', () => {
  it('the field survives a serialize -> deserialize round-trip', () => {
    const saved = serializeScenario(fields, checks);
    const restored = deserializeScenario(saved);
    expect(restored.fields.taxExemptInterest).toBe('18000');
  });

  it('model built from restored fields carries the same taxExemptInterest', () => {
    const modelBefore = fieldsToModel(fields, checks);
    const restored = deserializeScenario(serializeScenario(fields, checks));
    const modelAfter = fieldsToModel(restored.fields, restored.checks);
    expect(modelBefore.taxExemptInterest).toBe(18000);
    expect(modelAfter.taxExemptInterest).toBe(18000);
  });

  it('simulation output is identical before and after the round-trip', () => {
    const modelBefore = fieldsToModel(fields, checks);
    const restored = deserializeScenario(serializeScenario(fields, checks));
    const modelAfter = fieldsToModel(restored.fields, restored.checks);

    const simBefore = simulate(modelBefore, constPolicy('none', 'none', 2026, 2026));
    const simAfter = simulate(modelAfter, constPolicy('none', 'none', 2026, 2026));

    // Compare the MAGI/IRMAA-bearing fields across every row — these are exactly
    // what a dropped taxExemptInterest would change.
    const project = sim => sim.rows.map(r => ({ y: r.y, magi: r.magi, irm: r.irm, taxSS: r.taxSS, tax: r.tax }));
    expect(project(simAfter)).toEqual(project(simBefore));
  });

  it('an older (v1) saved scenario missing taxExemptInterest defaults to 0, not undefined', () => {
    // Simulate a pre-v2 save: no schemaVersion, no taxExemptInterest key.
    const legacy = { fields: { ...fields }, checks: { ...checks } };
    delete legacy.fields.taxExemptInterest;
    const restored = deserializeScenario(legacy);
    const model = fieldsToModel(restored.fields, restored.checks);
    expect(model.taxExemptInterest).toBe(0);           // safe default, not NaN/undefined
    expect(Number.isNaN(model.taxExemptInterest)).toBe(false);
    expect(restored.schemaVersion).toBe(1);            // detected as legacy
  });
});
