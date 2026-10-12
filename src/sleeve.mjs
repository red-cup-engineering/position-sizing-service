/**
 * `sleeve` — sizes one position against a bounded, walled risk sleeve (the 2026-09-01
 * bounded-stake growth policy: full Kelly by default, refusing rather than clamping on
 * liability-beyond-stake or a stake exceeding risk capital) and reports its collapse stage and
 * joule-denominated barrier (the 2026-09-05 fintech-under-energy-descent note). See
 * `sizePosition`'s own JSDoc for the algebra and numeric discipline.
 */

import { parse, cmp, format } from "@red-cup-engineering/energy-bank/decimal";
import { kellyFraction, continuousKellyFraction, playStyleForGoal, MAX_DEFENSIBLE_KELLY_MULTIPLE } from "./sizing.mjs";

/** 1 kWh = 3.6 MJ exactly (SI), used to convert a joules-denominated barrier to kWh. */
const JOULES_PER_KWH = 3600000;
/** Above this fraction, a declared USD survival barrier disagreeing with its joule-derived figure is reported as a datum. */
const BARRIER_MISMATCH_THRESHOLD = 0.01;
/** The five stages of collapse (Orlov), per social-history-science-services-section's glossary term. */
const COLLAPSE_STAGES = new Set([1, 2, 3, 4, 5]);
const BARRIER_UNITS = new Set(["joules", "kwh"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`sleeve: ${label} must be a boolean, got ${JSON.stringify(value)}`);
  return value;
}

function requirePositiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`sleeve: ${label} must be a finite number, got ${JSON.stringify(value)}`);
  if (value <= 0) throw new RangeError(`sleeve: ${label} must be > 0, got ${value}`);
  return value;
}

function requireDecimalString(value, label) {
  if (typeof value !== "string") throw new TypeError(`sleeve: ${label} must be an exact decimal string, got ${JSON.stringify(value)}`);
  return parse(value); // parse() itself throws RangeError on a malformed decimal string
}

/**
 * Validate an optional collapse-stage declaration (the five stages of collapse, 1-5).
 * @param {unknown} value
 * @param {string} label
 * @returns {1|2|3|4|5|null}
 * @throws {RangeError} if `value` is present and not an integer 1-5
 */
function requireStage(value, label) {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || !COLLAPSE_STAGES.has(value)) {
    throw new RangeError(`sleeve: ${label} must be an integer 1-5 (the five stages of collapse), got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Validate an optional joule/kWh-denominated survival-barrier declaration.
 * @param {unknown} value
 * @param {string} label
 * @returns {{amount: object, unit: "joules"|"kwh", usdPerKwh: object, asOf: string} | null}
 * @throws {TypeError} if `value` is present and malformed
 */
function requireBarrierJoules(value, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") throw new TypeError(`sleeve: ${label} must be an object, got ${JSON.stringify(value)}`);
  if (!BARRIER_UNITS.has(value.unit)) throw new TypeError(`sleeve: ${label}.unit must be "joules" or "kwh", got ${JSON.stringify(value.unit)}`);
  const amount = requireDecimalString(value.amount, `${label}.amount`);
  const usdPerKwh = requireDecimalString(value.usdPerKwh, `${label}.usdPerKwh`);
  if (typeof value.asOf !== "string" || !DATE_PATTERN.test(value.asOf)) {
    throw new TypeError(`sleeve: ${label}.asOf must be a YYYY-MM-DD date string, got ${JSON.stringify(value.asOf)}`);
  }
  return { amount, unit: value.unit, usdPerKwh, asOf: value.asOf };
}

/**
 * The USD value of a joule/kWh-denominated barrier, at the barrier's own declared price.
 * @param {{amount: object, unit: "joules"|"kwh", usdPerKwh: object}} barrierJoules
 * @returns {object} an energy-bank decimal
 */
function barrierUsdFromJoules(barrierJoules) {
  const amountKwh = barrierJoules.unit === "joules"
    ? Number(format(barrierJoules.amount)) / JOULES_PER_KWH
    : Number(format(barrierJoules.amount));
  const usdPerKwhNumber = Number(format(barrierJoules.usdPerKwh));
  const places = Math.max(barrierJoules.usdPerKwh.places, 2);
  return parse((amountKwh * usdPerKwhNumber).toFixed(places));
}

/**
 * Compare a joule-derived USD barrier against the sleeve's own declared `survivalCapital`; the
 * joule-derived figure is authoritative, and a disagreement above one percent is reported as a
 * datum here rather than silently resolved.
 * @param {{amount: object, unit: "joules"|"kwh", usdPerKwh: object, asOf: string}} barrierJoules
 * @param {object} survivalCapital an energy-bank decimal
 * @returns {{fromJoules: string, declared: string, asOf: string, mismatchFraction: number, mismatchAboveOnePercent: boolean}}
 */
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

/**
 * Sizes one position against a bounded, walled risk sleeve, full Kelly by default, refusing
 * rather than sizing when liability, edge sign, or the sleeve's own capital forbids it.
 * @param {object} request
 * @param {{winProbability: number, payoffRatio: number}|{drift: number, volatility: number, riskFreeRate?: number}} request.edge A discrete win/loss edge or a continuous drift/volatility edge.
 * @param {{riskCapital: string, survivalCapital: string, stage?: 1|2|3|4|5|null, barrierJoules?: {amount: string, unit: "joules"|"kwh", usdPerKwh: string, asOf: string}|null}} request.sleeve
 *   Exact decimal strings; survivalCapital is validated but never used to size. `stage` names the
 *   collapse stage (1-5, Orlov's five stages) at which the sleeve's own venue or rail stops.
 *   `barrierJoules` states the survival barrier in energy; when present, its USD figure is
 *   authoritative and compared against `survivalCapital`, with a disagreement above one percent
 *   reported rather than silently resolved.
 * @param {boolean} request.liabilityBeyondStake True when the instrument can create obligation beyond the staked amount.
 * @param {number} [request.kellyMultiple] The Kelly multiple to apply before the MAX_DEFENSIBLE_KELLY_MULTIPLE cap; defaults to 1 (full Kelly); must be > 0.
 * @param {number} [request.goal] An optional target growth multiple, carried through to the returned record for context only -- Dubins-Savage's bold/timid result turns on the sign of the edge alone, never on the target's size, so it never changes the sizing math.
 * @returns {{admitted: true, fraction: number, stake: string, regime: "bold"|"timid"|"indifferent"|"growth", kellyMultipleApplied: number, goal: number|null, stage: 1|2|3|4|5|null, barrierUsd: {fromJoules: string, declared: string, asOf: string, mismatchFraction: number, mismatchAboveOnePercent: boolean}|null}|{admitted: false, reason: string, goal: number|null, stage: 1|2|3|4|5|null, barrierUsd: {fromJoules: string, declared: string, asOf: string, mismatchFraction: number, mismatchAboveOnePercent: boolean}|null}} The sizing record, or a refusal datum naming why nothing was sized.
 * @throws {TypeError} When a required field is missing or the wrong type.
 * @throws {RangeError} When a numeric or decimal field lies outside its admissible range.
 */
export function sizePosition({ edge, sleeve, liabilityBeyondStake, kellyMultiple = 1, goal = null }) {
  if (typeof edge !== "object" || edge === null) throw new TypeError("sleeve: edge is required");
  if (typeof sleeve !== "object" || sleeve === null) throw new TypeError("sleeve: sleeve is required");
  requireBoolean(liabilityBeyondStake, "liabilityBeyondStake");
  requirePositiveNumber(kellyMultiple, "kellyMultiple");
  if (goal !== null && (typeof goal !== "number" || !Number.isFinite(goal))) throw new TypeError(`sleeve: goal must be a finite number or null, got ${JSON.stringify(goal)}`);

  const riskCapital = requireDecimalString(sleeve.riskCapital, "sleeve.riskCapital");
  const survivalCapital = requireDecimalString(sleeve.survivalCapital, "sleeve.survivalCapital"); // validated; read only for the barrierJoules mismatch report, never for sizing
  if (cmp(riskCapital, parse("0")) <= 0) throw new RangeError("sleeve: sleeve.riskCapital must be a positive decimal amount");

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
  // Dubins-Savage's bold/timid decision only applies to a discrete single-bet framing; a
  // continuous GBM edge has no such framing, so it reports the plain growth-optimal regime.
  const regime = discrete
    ? playStyleForGoal({ winProbability: edge.winProbability, payoffRatio: edge.payoffRatio }).style
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
