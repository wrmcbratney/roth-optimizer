import { TT } from './taxTables.js';

/**
 * DOM-free model construction and scenario serialization.
 *
 * These functions take plain field/check maps (string values, as they'd come
 * from form inputs or a saved-scenario JSON) and produce the model object the
 * engine consumes. Keeping this DOM-free means save/load round-tripping is
 * testable in Node without a browser stub — the readModel() DOM wrapper in the
 * HTML simply collects field values and delegates here.
 *
 * SCHEMA_VERSION lets saved scenarios evolve. Loaders should tolerate missing
 * fields (default them) so older saved files never produce undefined behavior.
 */

export const SCENARIO_SCHEMA_VERSION = 2; // v2 adds taxExemptInterest

// The full set of form fields persisted in a saved scenario.
export const FIELD_IDS = [
  'hhType', 'roth', 'taxable', 's1name', 's1by', 's1trad', 's1ss', 's2name', 's2by', 's2trad', 's2ss',
  's1ssage', 's1pen', 's1oth', 's1othend', 's2ssage', 's2pen', 's2oth', 's2othend',
  'magiPrev2', 'magiPrev1', 'taxExemptInterest', 'penSurv',
  's1death', 's2death', 'gTrad', 'gRoth', 'gTax', 'yTax', 'infl', 'cola', 'state', 'heir', 'disc', 'endAge',
  'objective', 'convStart', 'convEnd', 'fixedAmt',
];
export const CHECK_IDS = ['survToggle', 'allowForced'];

const numOf = (v, d = 0) => { const n = parseFloat(v); return Number.isNaN(n) ? d : n; };
const optOf = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : n; };

/**
 * Build the engine model from plain field values (strings ok) and checkbox bools.
 * @param {Object} f  field id -> value (string or number)
 * @param {Object} c  check id -> boolean
 */
export function fieldsToModel(f, c) {
  const surv = !!c.survToggle;
  const hh = f.hhType || 'mfj';
  const sp = [{
    name: f.s1name || 'Client A', by: numOf(f.s1by, 1962), deathAge: surv ? optOf(f.s1death) : null,
    ss: numOf(f.s1ss), ssAge: numOf(f.s1ssage, 67), pen: numOf(f.s1pen), oth: numOf(f.s1oth),
    othEnd: numOf(f.s1othend, 65), trad: numOf(f.s1trad),
  }];
  if (hh === 'mfj') sp.push({
    name: f.s2name || 'Client B', by: numOf(f.s2by, 1964), deathAge: surv ? optOf(f.s2death) : null,
    ss: numOf(f.s2ss), ssAge: numOf(f.s2ssage, 67), pen: numOf(f.s2pen), oth: numOf(f.s2oth),
    othEnd: numOf(f.s2othend, 65), trad: numOf(f.s2trad),
  });
  return {
    status: hh, spouses: sp, startYear: TT.BASE_YEAR,
    endAge: numOf(f.endAge, 95), magiPrev1: optOf(f.magiPrev1), magiPrev2: optOf(f.magiPrev2),
    // Annual tax-exempt interest: per projected-year MAGI/provisional-income add-back.
    // Missing in older (v1) saved scenarios -> defaults to 0.
    taxExemptInterest: numOf(f.taxExemptInterest, 0),
    roth: numOf(f.roth), taxable: numOf(f.taxable),
    gTrad: numOf(f.gTrad, 5.5) / 100, gRoth: numOf(f.gRoth, 5.5) / 100, gTax: numOf(f.gTax, 5.5) / 100,
    yTax: numOf(f.yTax, 2) / 100,
    infl: numOf(f.infl, 2.5) / 100, cola: numOf(f.cola, 2.3) / 100, stateRate: numOf(f.state, 0) / 100,
    heir: numOf(f.heir, 22) / 100, disc: numOf(f.disc, 3) / 100, penSurv: numOf(f.penSurv, 50) / 100,
    convStart: numOf(f.convStart, TT.BASE_YEAR), convEnd: numOf(f.convEnd, TT.BASE_YEAR + 7),
    fixedAmt: optOf(f.fixedAmt) || 0, objective: f.objective || 'termWealth',
    allowForcedDraws: !!c.allowForced,
  };
}

/**
 * Serialize a field/check map into a saved-scenario object (with schema version).
 */
export function serializeScenario(fields, checks) {
  return { schemaVersion: SCENARIO_SCHEMA_VERSION, fields: { ...fields }, checks: { ...checks } };
}

/**
 * Parse a saved-scenario object back into {fields, checks}, tolerating older
 * schema versions by defaulting any missing fields to empty (which numOf/optOf
 * then resolve to safe defaults — e.g. taxExemptInterest -> 0).
 */
export function deserializeScenario(saved) {
  const fields = {};
  const checks = {};
  for (const id of FIELD_IDS) fields[id] = saved?.fields?.[id] ?? '';
  for (const id of CHECK_IDS) checks[id] = !!saved?.checks?.[id];
  return { fields, checks, schemaVersion: saved?.schemaVersion ?? 1 };
}
