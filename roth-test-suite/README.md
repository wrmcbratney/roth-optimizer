# TRS Roth Conversion Optimizer — Engine + Test Suite

Retrofit of a reference scenario test suite onto the two-spouse Roth conversion
optimizer, moving it from hobby build toward client-approved rigor.

## What changed

The engine was extracted out of the single HTML file into DOM-free ES modules
under `engine/`, so it can be tested in Node without a browser. Behavior was
preserved during extraction (verified against the original self-test values).
Two deliberate engine additions were made *after* the harness was green, so each
change could be proven to move only its intended behavior:

- **`taxExemptInterest`** — municipal-bond interest now flows into MAGI (IRMAA/NIIT
  basis) and Social Security provisional income, but not AGI/taxable income.
  Defaults to 0, so existing runs are unchanged. Fixes the previous
  `magi === agi` simplification.
- **`assumeYearOfDeathRMDSatisfied`** — explicit assumption (default `true`) for
  whether a decedent satisfied their year-of-death RMD. When `false`, an
  additional beneficiary RMD is forced in the transfer year.

Labels renamed Medicare → IRMAA throughout the UI (the surcharge is IRMAA; the
program is Medicare — the CMS source citation and the client disclaimer keep the
correct "Medicare" references).

## Module layout (`engine/`)

| module | contents |
|---|---|
| `taxTables.js` | `TT` constants + structured source metadata (`{name,url,effectiveYear}`, `review`) |
| `taxEngine.js` | `inflF`, `bracketTax`, `ltcgTax`, `computeYear`, `ordRateAt` |
| `irmaa.js` | `irmaaThreshAt`, `irmaaTier`, `irmaaAnnualPerPerson` |
| `rmd.js` | `rmdAge`, `ultAt` |
| `strategies.js` | targets, policies, `levelEmptyBy`, `preserveBracket`, `condensePlan`, `dominantId` |
| `simulation.js` | `simulate` (household year-by-year) |
| `optimizer.js` | `OBJECTIVES`, `optimize`, `nextCliff` |
| `validation.js` | `validate` |
| `index.js` | barrel re-export |

## Test categories

Folders mirror the three categories, because the folder tells you what a
failure *means*:

- **`tests/reference/`** — externally derived from published 2026 IRS/CMS law.
  A red test means the engine is wrong OR a published figure changed. Urgent.
  (Tier A `computeYear`, direct helper tests, Tier B IRMAA boundaries/lookback.)
- **`tests/invariants/`** — model wiring/design rules (no NaN, liquidity
  failures disqualified, `magi = agi + taxExemptInterest`, IRMAA caused == paid
  two years later, death-year RMD flag). A red test means the wiring broke.
  (Includes Tier C simulation + optimizer property tests.)
- **`tests/golden/`** — full-household snapshots. A red test means output
  *changed* and a human must review whether it was intended. Not proof of
  anything; a drift detector. Update deliberately with `-u` and note why.

## Running

```
npm install
npm test            # single run
npm run test:watch  # watch mode
npx vitest run -u   # update golden snapshots (only after reviewing the diff)
```

## Release gates

Two tiers, because internal engineering use and client-facing output carry
different risk. The internal-pilot gate is an engineering bar; the client-output
gate adds compliance sign-off that only the CCO and a CPA can satisfy. The tool
is designed to *look* not-client-ready (DRAFT watermark, "Review pending" status
line) until the client-output gate is met.

### Internal pilot gate

- `npm test` green.
- HTML imports the tested engine (`./engine/index.js`), not an inline copy.
- Known limitations visible in the tool.
- Tax-table source metadata present.
- PDF/client report remains watermarked while `TT.review.reviewedDate` is blank.
- Tool served over an approved internal path, not opened locally (`file://`).
- No client PII persisted by default.

### Client-output gate (all of the above, plus)

- `TT.review.reviewedDate` populated.
- Tax constants reviewed against current IRS/CMS sources.
- Pooled senior-deduction phase-out interpretation signed off by the CCO.
- Death-year RMD assumption language reviewed.
- Tax-exempt interest input wired and disclosed.
- Planner workflow requires CPA review before implementation.
- Saved scenarios/PDFs include engine version, tax-table version, and
  reviewed/pending status.

## Next architecture decision (deferred)

The engine is framework-agnostic ES modules with zero DOM dependency, so it
ports to React/Next unchanged. The open question is only the *view* layer:
whether the UI stays a static, module-backed HTML tool for internal use, or
moves into React/Next for state, validation, routing, PDFs, and eventual
tax-return module integration. No new calculation features (SS optimization,
Tax Clarity replacement logic, additional tax-form inputs) until that decision
is made — they would touch state/validation/PDF paths that move with the choice.

## Notes / open items

- **The HTML UI now imports the tested engine** from `engine/index.js` as its
  single calculation source. The inline engine copy was removed, so the UI and
  the test suite can no longer drift. Metadata reads the structured
  `TT.review.reviewedDate` shape.
- **Serving requirement:** because the HTML uses `<script type="module">`,
  browsers block module imports over `file://`. Serve the folder over http
  (e.g. `npx serve` or `python3 -m http.server`) rather than double-clicking the
  file. This is a browser security rule, not a code issue.
- `runSelfTests()` remains available in the browser console as a quick smoke
  check (exposed on `window`), but the authoritative suite is Vitest under
  `tests/`.
- `A6` and the senior-bonus phase-out encode the **pooled-phaseout** reading
  (phase-out applied once against household MAGI). This is a design choice
  pending CCO sign-off, not settled law — flagged in the test comment.
- `assumeYearOfDeathRMDSatisfied` (default `true`) is a **stress assumption,
  not a precise remaining-RMD calculation**. When `false`, it forces an
  additional beneficiary RMD in the transfer year (surfaced in the row's `rmd`
  and `beneRMD` fields) — it does not detect whether an obligation exists or
  compute an exact remainder. Engine-only, not exposed in the UI; a tax-accurate
  module would refine it. Client-facing output uses the default and discloses
  the assumption in the limitations box.
- **Tax-exempt interest** is an annual per-projected-year input (grown by COLA),
  wired through the UI, `readModel`, save/load (schema v2), input echo, and the
  client-report assumptions line (suppressed when 0). Older (v1) saved scenarios
  missing the field default it to 0.
