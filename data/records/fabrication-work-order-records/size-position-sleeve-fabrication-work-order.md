# size-position
## Requirements
- `sleeve-position-size`: The operation returns the fraction of RISK capital, the exact-decimal stake, the play-style regime, and the applied Kelly multiple for a stated edge and a bounded risk sleeve.
- `stage-declaration`: The operation must accept an optional `sleeve.stage` (an integer from one to {{collapse-stage-count}}, the stages of collapse) naming the collapse stage at which the sleeve's own venue, counterparty, or rail stops, and carry it through unchanged on every sizing result, admitted or refused.
- `barrier-joules-declaration`: The operation must accept an optional `sleeve.barrierJoules` (`{amount, unit: "joules"|"kwh", usdPerKwh, asOf}`) stating the sleeve's survival barrier in energy, and derive its USD value at the declared price (converting joules to kWh at {{joules-per-kilowatt-hour}} first).
- `barrier-usd-authoritative`: When `sleeve.barrierJoules` is declared, the operation must report the joule-derived USD figure as authoritative (`barrierUsd.fromJoules`) alongside the sleeve's own declared `survivalCapital` (`barrierUsd.declared`), on every sizing result, admitted or refused.
## Prohibitions
- `liability-beyond-stake-refusal`: The operation must refuse to size, returning a refusal datum, when the instrument can create liability beyond the staked amount. [claims: sizing-needs-bounded-loss]
- `non-positive-edge-refusal`: The operation must refuse to size, returning a refusal datum, when the measured edge is non-positive. [claims: no-edge-no-stake]
- `stake-exceeds-sleeve-refusal`: The operation must refuse to size, returning a refusal datum, rather than clamp, when the sized stake would exceed the sleeve's own risk capital. [claims: a-stake-above-the-sleeve-is-not-the-sleeve]
- `barrier-mismatch-never-silent`: The operation must never resolve a disagreement between `barrierUsd.fromJoules` and `barrierUsd.declared` in either direction; a disagreement above {{mismatch-fraction}} (`mismatchFraction`) is reported as `mismatchAboveOnePercent: true`, and the sizing math itself never reads either figure. [claims: two-barriers-stay-two]
## Laws
- `admitted-example-face-equivalence` | JSNode operation face-equivalence law | v1 | lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/javascript-engineering-services-section/services/javascript-code-fabrication-services-section/services/javascript-node-code-fabrication-services-section/services/jsnode-package-services-section/README.md | Applies to the shared examples projected to the JSNode import and command faces. | Every admitted example has equivalent import and command outputs under the downstream JSNode face assay.
- `books-valued-twice` | Fintech under energy descent, sections 2 and 3.5 (561 Group finance note) | 2026-09-05 | content/text/documents/articles/notes/2026/09/05/2026-09-05-note-on-fintech-under-energy-descent.md (561-group-finance-operations-services-section) | Applies to sleeve.stage and sleeve.barrierJoules. | Every sleeve carries the collapse stage at which its venue, counterparty, or rail stops, and a barrier stated in joules is invariant under the currency regime change a dollar-denominated barrier is not.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file that is eligible for downstream staged package-birth assays.
- `si-kilowatt-hour` | International System of Units (SI) | 9th edition | https://www.bipm.org/en/publications/si-brochure | Applies to the joules-to-kWh conversion. | 1 kWh = 3,600,000 J exactly (1 Wh = 3600 J).
## Open questions
none
## Claims
- `dep-energy-bank` | measured | dependency | @red-cup-engineering/energy-bank@0.3.0 is published on the Group registry | none | data/records/2026-10-19-work-order-evidence/npm-view-red-cup-engineering-energy-bank-0-3-0.json | sha256:6c107fadc6bcddff45b002dd8b2ba85fb4c64d8b5a753377c30b676e54d6f188 | npm view of @red-cup-engineering/energy-bank@0.3.0 returned its name, version and integrity (2026-10-19)
- `collapse-stage-count` | derived | parameter | The finance note names five stages of collapse at which a sleeve's venue, counterparty or rail stops | 5 stages | constraint:books-valued-twice | The law carries the collapse stage on every sleeve, and the note it cites enumerates the stages
- `mismatch-fraction` | conjectured | parameter | A disagreement between the joule-derived and the declared barrier above this fraction is worth reporting | 0.01 ratio | Declared barriers and joule-derived barriers agree within a small fraction when both are kept honestly | The relative difference between barrierUsd.fromJoules and barrierUsd.declared across the sleeves in use | The sizing operation run over the recorded sleeves with both figures declared | Set the fraction to the smallest value above the spread of honest agreements, so a larger disagreement is a real one | The order's present value of one percent, taken as the best estimate
- `sizing-needs-bounded-loss` | derived | world | Kelly sizing of a stake presupposes a loss bounded by the stake, so an instrument that can lose more is outside it | none | requirement:sleeve-position-size; citation:Kelly 1956, the growth-optimal fraction for a bet whose loss is its stake | The requirement sizes a stake inside a bounded risk sleeve, which only a loss bounded by the stake respects
- `no-edge-no-stake` | derived | world | A non-positive edge has a non-positive Kelly fraction, so there is no stake to size | none | citation:Kelly 1956, the growth-optimal fraction is positive only for a positive edge; requirement:sleeve-position-size | The fraction of capital to stake is the edge over the payoff odds and is zero or negative for zero or negative edge
- `a-stake-above-the-sleeve-is-not-the-sleeve` | derived | world | A stake above the sleeve's own risk capital is not a stake of this sleeve, and clamping it would size a different one | none | requirement:sleeve-position-size | The requirement sizes a stake for a bounded risk sleeve, so a stake beyond its capital is refused, not reduced
- `two-barriers-stay-two` | derived | world | The joule-derived and the declared barrier are two valuations, and reporting their disagreement is not resolving it | none | requirement:barrier-usd-authoritative; constraint:books-valued-twice | The requirement reports both figures on every result and the law values the books twice, so neither replaces the other in the sizing math
## Package
```json
{"packageName":"@red-cup-engineering/scratch-size-position-sleeve-20260905-service","packageVersion":"0.1.0","license":"UNLICENSED","dependencies":{"@red-cup-engineering/energy-bank":"0.3.0"},"devDependencies":{}}
```
## Operation
```mjs path=scripts/scratch-size-position-sleeve-20260905.mjs
#!/usr/bin/env node
import { parse, cmp, format } from "@red-cup-engineering/energy-bank/decimal";

// Scratch-fabrication note: this circuit's birthed package shape has no src/ directory to
// import a sibling module from, so the Kelly primitives are duplicated here for this
// standalone fabrication run only. The shipped copy of this operation (position-sizing-service's
// scripts/size-position.mjs) instead imports these same functions from its own sibling
// src/sizing.mjs -- see that package's data/records/ for the receipt naming this friction.
const MAX_DEFENSIBLE_KELLY_MULTIPLE = 1.5;
const JOULES_PER_KWH = 3600000;
const BARRIER_MISMATCH_THRESHOLD = 0.01;
const COLLAPSE_STAGES = new Set([1, 2, 3, 4, 5]);
const BARRIER_UNITS = new Set(["joules", "kwh"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`size-position: ${label} must be a finite number, got ${JSON.stringify(value)}`);
  return value;
}
function requireUnitInterval(value, label) {
  requireFiniteNumber(value, label);
  if (value < 0 || value > 1) throw new RangeError(`size-position: ${label} must lie in [0,1], got ${value}`);
  return value;
}
function requirePositiveNumber(value, label) {
  requireFiniteNumber(value, label);
  if (value <= 0) throw new RangeError(`size-position: ${label} must be > 0, got ${value}`);
  return value;
}
function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`size-position: ${label} must be a boolean, got ${JSON.stringify(value)}`);
  return value;
}
function requireDecimalString(value, label) {
  if (typeof value !== "string") throw new TypeError(`size-position: ${label} must be an exact decimal string, got ${JSON.stringify(value)}`);
  return parse(value);
}
function requireStage(value, label) {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || !COLLAPSE_STAGES.has(value)) {
    throw new RangeError(`size-position: ${label} must be an integer 1-5 (the five stages of collapse), got ${JSON.stringify(value)}`);
  }
  return value;
}
function requireBarrierJoules(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") throw new TypeError(`size-position: ${label} must be an object, got ${JSON.stringify(value)}`);
  if (!BARRIER_UNITS.has(value.unit)) throw new TypeError(`size-position: ${label}.unit must be "joules" or "kwh", got ${JSON.stringify(value.unit)}`);
  const amount = requireDecimalString(value.amount, `${label}.amount`);
  const usdPerKwh = requireDecimalString(value.usdPerKwh, `${label}.usdPerKwh`);
  if (typeof value.asOf !== "string" || !DATE_PATTERN.test(value.asOf)) {
    throw new TypeError(`size-position: ${label}.asOf must be a YYYY-MM-DD date string, got ${JSON.stringify(value.asOf)}`);
  }
  return { amount, unit: value.unit, usdPerKwh, asOf: value.asOf };
}
function barrierUsdFromJoules(barrierJoules) {
  const amountKwh = barrierJoules.unit === "joules"
    ? Number(format(barrierJoules.amount)) / JOULES_PER_KWH
    : Number(format(barrierJoules.amount));
  const usdPerKwhNumber = Number(format(barrierJoules.usdPerKwh));
  const places = Math.max(barrierJoules.usdPerKwh.places, 2);
  return parse((amountKwh * usdPerKwhNumber).toFixed(places));
}
function barrierUsdReport(barrierJoules, survivalCapital) {
  const fromJoulesDecimal = barrierUsdFromJoules(barrierJoules);
  const fromJoulesNumber = Number(format(fromJoulesDecimal));
  const declaredNumber = Number(format(survivalCapital));
  const mismatchFraction = declaredNumber === 0
    ? (fromJoulesNumber === 0 ? 0 : Infinity)
    : Math.abs(fromJoulesNumber - declaredNumber) / declaredNumber;
  return {
    fromJoules: format(fromJoulesDecimal),
    declared: format(survivalCapital),
    asOf: barrierJoules.asOf,
    mismatchFraction,
    mismatchAboveOnePercent: mismatchFraction > BARRIER_MISMATCH_THRESHOLD,
  };
}
function kellyFraction({ winProbability, payoffRatio }) {
  const p = requireUnitInterval(winProbability, "edge.winProbability");
  const b = requirePositiveNumber(payoffRatio, "edge.payoffRatio");
  return (b * p - (1 - p)) / b;
}
function continuousKellyFraction({ drift, volatility, riskFreeRate = 0 }) {
  const mu = requireFiniteNumber(drift, "edge.drift");
  const sigma = requirePositiveNumber(volatility, "edge.volatility");
  const r = requireFiniteNumber(riskFreeRate, "edge.riskFreeRate");
  return (mu - r) / (sigma * sigma);
}
function playStyleForGoal({ winProbability, payoffRatio = 1 }) {
  const p = requireUnitInterval(winProbability, "edge.winProbability");
  const b = requirePositiveNumber(payoffRatio, "edge.payoffRatio");
  const expectedValue = p * b - (1 - p);
  if (expectedValue > 0) return "timid";
  if (expectedValue < 0) return "bold";
  return "indifferent";
}

/**
 * Sizes one position against a bounded, walled risk sleeve, full Kelly by default, refusing rather than sizing when liability, edge sign, or the sleeve's own capital forbids it; also reports the sleeve's collapse stage and, when a joule-denominated barrier is declared, its USD figure compared against the sleeve's own survivalCapital.
 * @param {object} request
 * @param {{winProbability: number, payoffRatio: number}|{drift: number, volatility: number, riskFreeRate?: number}} request.edge A discrete win/loss edge or a continuous drift/volatility edge.
 * @param {{riskCapital: string, survivalCapital: string, stage?: 1|2|3|4|5|null, barrierJoules?: {amount: string, unit: "joules"|"kwh", usdPerKwh: string, asOf: string}|null}} request.sleeve Exact decimal strings; survivalCapital is validated but never used to size. stage names the collapse stage (1-5) at which the sleeve's own venue or rail stops. barrierJoules states the survival barrier in energy; when present, its USD figure is authoritative and compared against survivalCapital, with a disagreement above one percent reported rather than silently resolved.
 * @param {boolean} request.liabilityBeyondStake True when the instrument can create obligation beyond the staked amount.
 * @param {number} [request.kellyMultiple] The Kelly multiple to apply before the MAX_DEFENSIBLE_KELLY_MULTIPLE cap; defaults to 1 (full Kelly); must be > 0.
 * @param {number} [request.goal] An optional target growth multiple, carried through to the returned record for context only.
 * @returns {{admitted: true, fraction: number, stake: string, regime: "bold"|"timid"|"indifferent"|"growth", kellyMultipleApplied: number, goal: number|null, stage: 1|2|3|4|5|null, barrierUsd: {fromJoules: string, declared: string, asOf: string, mismatchFraction: number, mismatchAboveOnePercent: boolean}|null}|{admitted: false, reason: string, goal: number|null, stage: 1|2|3|4|5|null, barrierUsd: {fromJoules: string, declared: string, asOf: string, mismatchFraction: number, mismatchAboveOnePercent: boolean}|null}} The sizing record, or a refusal datum naming why nothing was sized.
 * @throws {TypeError} When a required field is missing or the wrong type.
 * @throws {RangeError} When a numeric field lies outside its admissible range.
 */
export function sizePosition({ edge, sleeve, liabilityBeyondStake, kellyMultiple = 1, goal = null }) {
  if (typeof edge !== "object" || edge === null) throw new TypeError("size-position: edge is required");
  if (typeof sleeve !== "object" || sleeve === null) throw new TypeError("size-position: sleeve is required");
  requireBoolean(liabilityBeyondStake, "liabilityBeyondStake");
  requirePositiveNumber(kellyMultiple, "kellyMultiple");
  if (goal !== null) requireFiniteNumber(goal, "goal");
  if (typeof sleeve.riskCapital !== "string") throw new TypeError("size-position: sleeve.riskCapital must be an exact decimal string");
  if (typeof sleeve.survivalCapital !== "string") throw new TypeError("size-position: sleeve.survivalCapital must be an exact decimal string");

  const riskCapital = parse(sleeve.riskCapital);
  const survivalCapital = parse(sleeve.survivalCapital);
  if (cmp(riskCapital, parse("0")) <= 0) throw new RangeError("size-position: sleeve.riskCapital must be a positive decimal amount");

  const stage = requireStage(sleeve.stage ?? null, "sleeve.stage");
  const barrierJoules = requireBarrierJoules(sleeve.barrierJoules ?? null, "sleeve.barrierJoules");
  const barrierUsd = barrierJoules === null ? null : barrierUsdReport(barrierJoules, survivalCapital);

  if (liabilityBeyondStake) {
    return { admitted: false, reason: "liability beyond the staked amount is the one hard ruin line -- refused, never sized", goal, stage, barrierUsd };
  }

  const discrete = typeof edge.winProbability === "number";
  const kelly = discrete
    ? kellyFraction({ winProbability: edge.winProbability, payoffRatio: edge.payoffRatio })
    : continuousKellyFraction({ drift: edge.drift, volatility: edge.volatility, riskFreeRate: edge.riskFreeRate });
  const regime = discrete
    ? playStyleForGoal({ winProbability: edge.winProbability, payoffRatio: edge.payoffRatio })
    : "growth";

  if (kelly <= 0) {
    return { admitted: false, reason: "non-positive edge -- no size is growth-optimal at these parameters", goal, stage, barrierUsd };
  }

  const appliedMultiple = Math.min(kellyMultiple, MAX_DEFENSIBLE_KELLY_MULTIPLE);
  const fraction = kelly * appliedMultiple;
  const places = Math.max(riskCapital.places, 2);
  const stakeDecimal = parse((fraction * Number(format(riskCapital))).toFixed(places));

  if (cmp(stakeDecimal, riskCapital) > 0) {
    return { admitted: false, reason: "sized stake would exceed the sleeve's risk capital -- refused, never clamped silently", goal, stage, barrierUsd };
  }

  return { admitted: true, fraction, stake: format(stakeDecimal), regime, kellyMultipleApplied: appliedMultiple, goal, stage, barrierUsd };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("sizePosition — Sizes one position against a bounded, walled risk sleeve, full Kelly by default, refusing rather than sizing when liability, edge sign, or the sleeve's own capital forbids it; also reports the sleeve's collapse stage and, when a joule-denominated barrier is declared, its USD figure compared against the sleeve's own survivalCapital.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(sizePosition(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/scratch-size-position-sleeve-20260905.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { sizePosition } from "../scripts/scratch-size-position-sleeve-20260905.mjs";

test("sizes full Kelly on a discrete edge, timid regime", () => {
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000" },
    liabilityBeyondStake: false,
  });
  assert.equal(result.admitted, true);
  assert.ok(Math.abs(result.fraction - 0.2) < 1e-9);
  assert.equal(result.stake, "200");
  assert.equal(result.regime, "timid");
  assert.equal(result.kellyMultipleApplied, 1);
  assert.equal(result.stage, null);
  assert.equal(result.barrierUsd, null);
});

test("refuses liability beyond the stake regardless of edge", () => {
  const result = sizePosition({
    edge: { winProbability: 0.9, payoffRatio: 2 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000" },
    liabilityBeyondStake: true,
  });
  assert.equal(result.admitted, false);
  assert.match(result.reason, /liability beyond/);
});

test("refuses a non-positive edge", () => {
  const result = sizePosition({
    edge: { winProbability: 0.4, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000" },
    liabilityBeyondStake: false,
  });
  assert.equal(result.admitted, false);
  assert.match(result.reason, /non-positive edge/);
});

test("refuses rather than clamps when the stake would exceed the sleeve's risk capital", () => {
  const result = sizePosition({
    edge: { drift: 0.10, volatility: 0.20 },
    sleeve: { riskCapital: "500", survivalCapital: "10000" },
    liabilityBeyondStake: false,
  });
  assert.equal(result.admitted, false);
  assert.match(result.reason, /exceed the sleeve/);
});

test("continuous edge reports the growth regime, never bold/timid", () => {
  const result = sizePosition({
    edge: { drift: 0.05, volatility: 0.5 },
    sleeve: { riskCapital: "1000", survivalCapital: "10000" },
    liabilityBeyondStake: false,
  });
  assert.equal(result.admitted, true);
  assert.equal(result.regime, "growth");
});

test("goal is carried through to the record but never changes the sizing math", () => {
  const withoutGoal = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000" },
    liabilityBeyondStake: false,
  });
  const withGoal = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000" },
    liabilityBeyondStake: false,
    goal: 10,
  });
  assert.equal(withGoal.fraction, withoutGoal.fraction);
  assert.equal(withGoal.stake, withoutGoal.stake);
  assert.equal(withGoal.goal, 10);
});

test("a declared stage 1-5 is carried through on an admitted result and on a refusal", () => {
  const admitted = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000", stage: 2 },
    liabilityBeyondStake: false,
  });
  assert.equal(admitted.stage, 2);
  const refused = sizePosition({
    edge: { winProbability: 0.9, payoffRatio: 2 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000", stage: 1 },
    liabilityBeyondStake: true,
  });
  assert.equal(refused.stage, 1);
});

test("refuses a stage outside 1-5", () => {
  assert.throws(() => sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000", stage: 6 },
    liabilityBeyondStake: false,
  }), RangeError);
});

test("barrierJoules in kwh converts to USD at the declared price and agrees with survivalCapital", () => {
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: {
      riskCapital: "1000", survivalCapital: "5000",
      barrierJoules: { amount: "5000", unit: "kwh", usdPerKwh: "1", asOf: "2026-07-01" },
    },
    liabilityBeyondStake: false,
  });
  assert.equal(result.barrierUsd.fromJoules, "5000");
  assert.equal(result.barrierUsd.mismatchAboveOnePercent, false);
});

test("barrierJoules in joules converts through 3.6 MJ per kWh before pricing", () => {
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: {
      riskCapital: "1000", survivalCapital: "10",
      barrierJoules: { amount: "18000000", unit: "joules", usdPerKwh: "2", asOf: "2026-07-01" },
    },
    liabilityBeyondStake: false,
  });
  assert.equal(result.barrierUsd.fromJoules, "10");
});

test("a mismatch above one percent between the declared and joule-derived barrier is reported, never silently resolved", () => {
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: {
      riskCapital: "1000", survivalCapital: "4000",
      barrierJoules: { amount: "5000", unit: "kwh", usdPerKwh: "1", asOf: "2026-07-01" },
    },
    liabilityBeyondStake: false,
  });
  assert.equal(result.admitted, true);
  assert.equal(result.barrierUsd.mismatchAboveOnePercent, true);
  assert.ok(Math.abs(result.barrierUsd.mismatchFraction - 0.25) < 1e-9);
});

test("refuses a barrierJoules with an unrecognized unit", () => {
  assert.throws(() => sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: {
      riskCapital: "1000", survivalCapital: "5000",
      barrierJoules: { amount: "5000", unit: "btu", usdPerKwh: "1", asOf: "2026-07-01" },
    },
    liabilityBeyondStake: false,
  }), TypeError);
});

test("refuses a non-decimal riskCapital string", () => {
  assert.throws(() => sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "not-a-number", survivalCapital: "5000" },
    liabilityBeyondStake: false,
  }), RangeError);
});
```
## Examples
```json name="full Kelly, timid regime, admitted, with stage and a matching joule-derived barrier"
{"input":{"edge":{"winProbability":0.6,"payoffRatio":1},"sleeve":{"riskCapital":"1000","survivalCapital":"5000","stage":2,"barrierJoules":{"amount":"5000","unit":"kwh","usdPerKwh":"1","asOf":"2026-07-01"}},"liabilityBeyondStake":false},"output":{"admitted":true,"fraction":0.19999999999999996,"stake":"200","regime":"timid","kellyMultipleApplied":1,"goal":null,"stage":2,"barrierUsd":{"fromJoules":"5000","declared":"5000","asOf":"2026-07-01","mismatchFraction":0,"mismatchAboveOnePercent":false}}}
```
## Traceability
- `sleeve-position-size` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
- `stage-declaration` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `books-valued-twice`
- `barrier-joules-declaration` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `books-valued-twice`, `si-kilowatt-hour`
- `barrier-usd-authoritative` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `books-valued-twice`
- `liability-beyond-stake-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
- `non-positive-edge-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
- `stake-exceeds-sleeve-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
- `barrier-mismatch-never-silent` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `books-valued-twice`
