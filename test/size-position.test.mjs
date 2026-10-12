import { test } from "node:test";
import assert from "node:assert/strict";
import { sizePosition } from "../scripts/size-position.mjs";

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
  assert.equal(result.goal, null);
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

test("refuses a non-decimal riskCapital string", () => {
  assert.throws(() => sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "not-a-number", survivalCapital: "5000" },
    liabilityBeyondStake: false,
  }), RangeError);
});

test("refuses a non-positive riskCapital", () => {
  assert.throws(() => sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "0", survivalCapital: "5000" },
    liabilityBeyondStake: false,
  }), RangeError);
});

test("stage defaults to null when not declared, and is carried through on an admitted result", () => {
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000" },
    liabilityBeyondStake: false,
  });
  assert.equal(result.stage, null);
});

test("a declared stage 1-5 is carried through on an admitted result", () => {
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000", stage: 2 },
    liabilityBeyondStake: false,
  });
  assert.equal(result.stage, 2);
});

test("stage is carried through on a refusal too, never dropped", () => {
  const result = sizePosition({
    edge: { winProbability: 0.9, payoffRatio: 2 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000", stage: 1 },
    liabilityBeyondStake: true,
  });
  assert.equal(result.admitted, false);
  assert.equal(result.stage, 1);
});

test("refuses a stage outside 1-5", () => {
  assert.throws(() => sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000", stage: 6 },
    liabilityBeyondStake: false,
  }), RangeError);
});

test("barrierUsd is null when barrierJoules is not declared", () => {
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: { riskCapital: "1000", survivalCapital: "5000" },
    liabilityBeyondStake: false,
  });
  assert.equal(result.barrierUsd, null);
});

test("barrierJoules in kwh converts to USD at the declared price and agrees with survivalCapital within one percent", () => {
  // 5000 kWh at 1 USD/kWh = 5000 USD, matching survivalCapital exactly.
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: {
      riskCapital: "1000", survivalCapital: "5000",
      barrierJoules: { amount: "5000", unit: "kwh", usdPerKwh: "1", asOf: "2026-07-01" },
    },
    liabilityBeyondStake: false,
  });
  assert.equal(result.barrierUsd.fromJoules, "5000");
  assert.equal(result.barrierUsd.declared, "5000");
  assert.equal(result.barrierUsd.mismatchFraction, 0);
  assert.equal(result.barrierUsd.mismatchAboveOnePercent, false);
  assert.equal(result.barrierUsd.asOf, "2026-07-01");
});

test("barrierJoules in joules converts through 3.6 MJ per kWh before pricing", () => {
  // 18,000,000 J = 5 kWh; at 2 USD/kWh that is 10 USD.
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: {
      riskCapital: "1000", survivalCapital: "10",
      barrierJoules: { amount: "18000000", unit: "joules", usdPerKwh: "2", asOf: "2026-07-01" },
    },
    liabilityBeyondStake: false,
  });
  assert.equal(result.barrierUsd.fromJoules, "10");
  assert.equal(result.barrierUsd.mismatchAboveOnePercent, false);
});

test("a mismatch above one percent between the declared and joule-derived barrier is reported as a datum, never silently resolved", () => {
  // fromJoules = 5000 USD; declared survivalCapital = 4000 USD, a 25% mismatch.
  const result = sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: {
      riskCapital: "1000", survivalCapital: "4000",
      barrierJoules: { amount: "5000", unit: "kwh", usdPerKwh: "1", asOf: "2026-07-01" },
    },
    liabilityBeyondStake: false,
  });
  assert.equal(result.admitted, true); // the mismatch is reported, never a refusal
  assert.equal(result.barrierUsd.fromJoules, "5000");
  assert.equal(result.barrierUsd.declared, "4000");
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

test("refuses a barrierJoules with a malformed asOf date", () => {
  assert.throws(() => sizePosition({
    edge: { winProbability: 0.6, payoffRatio: 1 },
    sleeve: {
      riskCapital: "1000", survivalCapital: "5000",
      barrierJoules: { amount: "5000", unit: "kwh", usdPerKwh: "1", asOf: "07/01/2026" },
    },
    liabilityBeyondStake: false,
  }), TypeError);
});
