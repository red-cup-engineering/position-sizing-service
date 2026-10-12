import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DEFENSIBLE_KELLY_MULTIPLE,
  clampToLong,
  continuousKellyFraction,
  crraFraction,
  kellyFraction,
  leveragedGrowthRate,
  playStyleForGoal,
  probabilityOfDrawdown,
  quantileOptimalLeverage,
  sizingAdvice,
  volatilityDragBreakeven,
  volatilityLeverageParity,
} from "../src/sizing.mjs";

const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} within ${tolerance} of ${expected}`);

// ── Kelly ────────────────────────────────────────────────────────────────────────────────

test("kellyFraction(): even-money bet reduces to p − q", () => {
  close(kellyFraction({ winProbability: 0.6, payoffRatio: 1 }), 0.2);
  close(kellyFraction({ winProbability: 0.5, payoffRatio: 1 }), 0);
});

test("kellyFraction(): edge over odds for an uneven payoff", () => {
  // p=0.5, b=2 → (2(0.5) − 0.5)/2 = 0.25
  close(kellyFraction({ winProbability: 0.5, payoffRatio: 2 }), 0.25);
});

test("kellyFraction(): a negative-edge bet returns a negative fraction rather than being clamped", () => {
  const f = kellyFraction({ winProbability: 0.4, payoffRatio: 1 });
  assert.ok(f < 0, "a losing bet must report as negative, not silently zero");
  assert.equal(clampToLong(f), 0);
});

test("continuousKellyFraction(): f* = (mu − r)/sigma^2", () => {
  close(continuousKellyFraction({ drift: 0.10, volatility: 0.20 }), 0.10 / 0.04);
  close(continuousKellyFraction({ drift: 0.10, volatility: 0.20, riskFreeRate: 0.04 }), 0.06 / 0.04);
});

test("continuousKellyFraction(): a Sharpe-0.5 asset gives full-Kelly leverage of 2.5", () => {
  // mu = 0.10, sigma = 0.20 → Sharpe 0.5, the worked example from the sizing research.
  close(continuousKellyFraction({ drift: 0.10, volatility: 0.20 }), 2.5);
});

test("continuousKellyFraction(): refuses a non-positive volatility", () => {
  assert.throws(() => continuousKellyFraction({ drift: 0.1, volatility: 0 }), RangeError);
  assert.throws(() => continuousKellyFraction({ drift: 0.1, volatility: -0.2 }), RangeError);
});

test("kellyFraction(): refuses a probability outside [0,1] and a non-finite input", () => {
  assert.throws(() => kellyFraction({ winProbability: 1.5, payoffRatio: 1 }), RangeError);
  assert.throws(() => kellyFraction({ winProbability: NaN, payoffRatio: 1 }), TypeError);
});

// ── CRRA: the written-off-stake case ─────────────────────────────────────────────────────

test("crraFraction(): sigma = 1 recovers full Kelly, sigma = 2 is half Kelly", () => {
  close(crraFraction({ kellyFraction: 2.5, relativeRiskAversion: 1 }), 2.5);
  close(crraFraction({ kellyFraction: 2.5, relativeRiskAversion: 2 }), 1.25);
});

test("crraFraction(): risk aversion below log utility bets MORE than Kelly", () => {
  // This is the load-bearing case: when ruin is cheap, sigma < 1 and the fraction exceeds Kelly.
  const f = crraFraction({ kellyFraction: 2.5, relativeRiskAversion: 0.5 });
  assert.ok(f > 2.5, "sigma < 1 must exceed full Kelly");
  close(f, 5);
});

test("crraFraction(): refuses a non-positive coefficient rather than returning Infinity", () => {
  assert.throws(() => crraFraction({ kellyFraction: 2.5, relativeRiskAversion: 0 }), RangeError);
  assert.throws(() => crraFraction({ kellyFraction: 2.5, relativeRiskAversion: -1 }), RangeError);
});

// ── quantile-optimal leverage ────────────────────────────────────────────────────────────

test("quantileOptimalLeverage(): the median reduces exactly to full Kelly", () => {
  const kelly = continuousKellyFraction({ drift: 0.10, volatility: 0.20 });
  const median = quantileOptimalLeverage({ drift: 0.10, volatility: 0.20, quantile: 0.5 });
  close(median, kelly, 1e-6);
});

test("quantileOptimalLeverage(): higher quantiles demand strictly more leverage", () => {
  const p = { drift: 0.10, volatility: 0.20 };
  const l50 = quantileOptimalLeverage({ ...p, quantile: 0.5 });
  const l75 = quantileOptimalLeverage({ ...p, quantile: 0.75 });
  const l90 = quantileOptimalLeverage({ ...p, quantile: 0.90 });
  assert.ok(l50 < l75 && l75 < l90, `expected monotone increase, got ${l50}, ${l75}, ${l90}`);
});

test("quantileOptimalLeverage(): reproduces the research figures at their stated horizon", () => {
  // The 3.5-at-the-75th / 4.5-at-the-90th figures for a Sharpe-0.5 asset only hold over a
  // ten-year horizon; the z/(sigma*sqrt(T)) term shrinks as T grows, so the same quantile
  // target implies far more leverage over one year than over ten. Recording the horizon
  // matters: quoting those numbers without it overstates how much leverage a short-horizon
  // quantile target actually justifies.
  const p = { drift: 0.10, volatility: 0.20, horizonYears: 10 };
  close(quantileOptimalLeverage({ ...p, quantile: 0.75 }), 3.5, 0.1);
  close(quantileOptimalLeverage({ ...p, quantile: 0.90 }), 4.5, 0.1);
  // Over one year the same targets demand markedly more.
  assert.ok(quantileOptimalLeverage({ drift: 0.10, volatility: 0.20, quantile: 0.75 }) > 5);
});

test("quantileOptimalLeverage(): a longer horizon needs less leverage for the same quantile", () => {
  const p = { drift: 0.10, volatility: 0.20, quantile: 0.9 };
  assert.ok(quantileOptimalLeverage({ ...p, horizonYears: 4 }) < quantileOptimalLeverage({ ...p, horizonYears: 1 }));
});

test("quantileOptimalLeverage(): refuses the degenerate endpoints", () => {
  assert.throws(() => quantileOptimalLeverage({ drift: 0.1, volatility: 0.2, quantile: 0 }), RangeError);
  assert.throws(() => quantileOptimalLeverage({ drift: 0.1, volatility: 0.2, quantile: 1 }), RangeError);
});

// ── drawdown ─────────────────────────────────────────────────────────────────────────────

test("probabilityOfDrawdown(): at full Kelly the percentages match exactly", () => {
  close(probabilityOfDrawdown({ fraction: 0.5 }), 0.5, 1e-12);
  close(probabilityOfDrawdown({ fraction: 0.1 }), 0.1, 1e-12);
  close(probabilityOfDrawdown({ fraction: 0.4 }), 0.4, 1e-12);
});

test("probabilityOfDrawdown(): half Kelly cubes the probability, it does not square it", () => {
  // P(hitting fraction x) = x^((2-k)/k). At k = 1/2 the exponent is 3, so a 50% drawdown
  // falls from probability 0.5 to 0.125 -- a sharper improvement than the often-repeated
  // "half Kelly halves the risk" intuition suggests.
  close(probabilityOfDrawdown({ fraction: 0.5, kellyMultiple: 0.5 }), 0.125, 1e-12);
  close(probabilityOfDrawdown({ fraction: 0.5, kellyMultiple: 2 / 3 }), Math.pow(0.5, 2), 1e-12);
});

test("probabilityOfDrawdown(): at twice Kelly, every drawdown becomes certain", () => {
  assert.equal(probabilityOfDrawdown({ fraction: 0.5, kellyMultiple: 2 }), 1);
  assert.equal(probabilityOfDrawdown({ fraction: 0.01, kellyMultiple: 3 }), 1);
});

// ── Dubins & Savage ──────────────────────────────────────────────────────────────────────

test("playStyleForGoal(): a subfair game calls for bold play", () => {
  const r = playStyleForGoal({ winProbability: 0.45 });
  assert.equal(r.style, "bold");
  assert.ok(r.expectedValue < 0);
});

test("playStyleForGoal(): a superfair game calls for timid play", () => {
  const r = playStyleForGoal({ winProbability: 0.55 });
  assert.equal(r.style, "timid");
  assert.ok(r.expectedValue > 0);
});

test("playStyleForGoal(): a fair game is indifferent", () => {
  assert.equal(playStyleForGoal({ winProbability: 0.5 }).style, "indifferent");
});

test("playStyleForGoal(): the payoff ratio, not just the probability, decides the regime", () => {
  // p = 0.4 is subfair at even money but superfair at 2-to-1.
  assert.equal(playStyleForGoal({ winProbability: 0.4, payoffRatio: 1 }).style, "bold");
  assert.equal(playStyleForGoal({ winProbability: 0.4, payoffRatio: 2 }).style, "timid");
});

// ── leverage decay ───────────────────────────────────────────────────────────────────────

test("leveragedGrowthRate(): return scales with L, drag with L squared", () => {
  const mu = 0.10;
  const sigma = 0.20;
  close(leveragedGrowthRate({ drift: mu, volatility: sigma, leverage: 1 }), 0.10 - 0.02);
  close(leveragedGrowthRate({ drift: mu, volatility: sigma, leverage: 3 }), 0.30 - 0.18);
});

test("leveragedGrowthRate(): zero volatility means leverage is pure multiplication", () => {
  close(leveragedGrowthRate({ drift: 0.10, volatility: 0, leverage: 3 }), 0.30);
});

test("volatilityDragBreakeven(): 3x at 10% drift breaks even near 25.8% volatility", () => {
  close(volatilityDragBreakeven({ drift: 0.10, leverage: 3 }), Math.sqrt(0.2 / 3), 1e-12);
  close(volatilityDragBreakeven({ drift: 0.10, leverage: 3 }), 0.2582, 1e-4);
});

test("volatilityDragBreakeven(): the breakeven is where growth is exactly zero", () => {
  const sigma = volatilityDragBreakeven({ drift: 0.10, leverage: 3 });
  close(leveragedGrowthRate({ drift: 0.10, volatility: sigma, leverage: 3 }), 0, 1e-12);
});

test("volatilityLeverageParity(): the parity point is where 3x exactly matches 1x", () => {
  const sigma = volatilityLeverageParity({ drift: 0.10, leverage: 3 });
  const levered = leveragedGrowthRate({ drift: 0.10, volatility: sigma, leverage: 3 });
  const plain = leveragedGrowthRate({ drift: 0.10, volatility: sigma, leverage: 1 });
  close(levered, plain, 1e-12);
  close(sigma, 0.2236, 1e-4);
});

test("volatilityLeverageParity(): refuses leverage of 1 or below, where the comparison is vacuous", () => {
  assert.throws(() => volatilityLeverageParity({ drift: 0.1, leverage: 1 }), RangeError);
});

// ── advice ───────────────────────────────────────────────────────────────────────────────

test("sizingAdvice(): material capital defaults to half Kelly", () => {
  const r = sizingAdvice({ drift: 0.10, volatility: 0.20, ruinCost: "material" });
  close(r.kellyFraction, 2.5);
  close(r.recommendedFraction, 1.25);
  close(r.kellyMultiple, 0.5);
  assert.equal(r.capped, false);
});

test("sizingAdvice(): a written-off stake sizes above full Kelly, within the defensible cap", () => {
  const r = sizingAdvice({ drift: 0.10, volatility: 0.20, ruinCost: "written-off" });
  assert.ok(r.kellyMultiple > 1, "written-off capital should exceed full Kelly");
  assert.ok(r.kellyMultiple <= MAX_DEFENSIBLE_KELLY_MULTIPLE + 1e-12);
  // The default written-off coefficient (0.75) lands at 1.333x Kelly, inside the 1.5x
  // ceiling, so nothing is clamped and the report should not claim it was.
  assert.equal(r.capped, false);
  close(r.kellyMultiple, 1 / 0.75, 1e-12);
});

test("sizingAdvice(): the cap holds however extreme the stated risk tolerance", () => {
  const r = sizingAdvice({ drift: 0.10, volatility: 0.20, relativeRiskAversion: 0.01 });
  close(r.kellyMultiple, MAX_DEFENSIBLE_KELLY_MULTIPLE, 1e-12);
  assert.equal(r.capped, true);
});

test("sizingAdvice(): no edge means no size, and it says so with the bold-play caveat", () => {
  const r = sizingAdvice({ drift: 0, volatility: 0.20 });
  close(r.kellyFraction, 0);
  assert.match(r.note, /no positive edge/);
  assert.match(r.note, /bold/);
});

test("sizingAdvice(): a negative-drift asset reports a negative Kelly fraction", () => {
  const r = sizingAdvice({ drift: -0.05, volatility: 0.20 });
  assert.ok(r.kellyFraction < 0);
});

test("sizingAdvice(): edge sensitivity exposes how much rests on the drift estimate", () => {
  // Kelly is linear in (mu − r), so a 25% haircut on drift is a 25% move in the fraction.
  const r = sizingAdvice({ drift: 0.10, volatility: 0.20 });
  close(r.edgeSensitivity, 0.25, 1e-9);
});

test("sizingAdvice(): reports the drawdown odds implied by its own recommendation", () => {
  const material = sizingAdvice({ drift: 0.10, volatility: 0.20, ruinCost: "material" });
  const writtenOff = sizingAdvice({ drift: 0.10, volatility: 0.20, ruinCost: "written-off" });
  close(material.drawdownRisk.half, 0.125, 1e-12);
  assert.ok(
    writtenOff.drawdownRisk.half > material.drawdownRisk.half,
    "sizing up must report strictly worse drawdown odds",
  );
});

// ── Bayesian and joint Kelly ─────────────────────────────────────────────────────────────
import {
  BETA_PRIORS,
  bayesianBinaryKellyFraction,
  betaPosterior,
  betaQuantile,
  independentScenarios,
  jointKellyForCorrelatedOutcomes,
  ladderScenarios,
} from "../src/sizing.mjs";

test("betaPosterior: conjugate update with Jeffreys by default", () => {
  const post = betaPosterior({ wins: 422, losses: 0 });
  assert.equal(post.alpha, 422.5);
  assert.equal(post.beta, 0.5);
  close(1 - post.mean, 0.5 / 423, 1e-15);
  const uniform = betaPosterior({ wins: 422, losses: 0, prior: BETA_PRIORS.uniform });
  close(1 - uniform.mean, 1 / 424, 1e-15);
  assert.throws(() => betaPosterior({ wins: 5, losses: 0, prior: BETA_PRIORS.haldane }), RangeError);
  assert.throws(() => betaPosterior({ wins: -1, losses: 0 }), RangeError);
});

test("betaQuantile matches known Beta quantiles", () => {
  // Beta(1,1) is uniform; Beta(2,1) has CDF x², so quantile q is √q.
  close(betaQuantile({ alpha: 1, beta: 1, quantile: 0.3 }), 0.3, 1e-12);
  close(betaQuantile({ alpha: 2, beta: 1, quantile: 0.64 }), 0.8, 1e-12);
  // Jeffreys 95% upper loss bound after 0/422 is below 1%.
  const upper = betaQuantile({ alpha: 0.5, beta: 422.5, quantile: 0.95 });
  assert.ok(upper > 0.004 && upper < 0.007, `upper bound ${upper}`);
});

test("bayesianBinaryKellyFraction equals Kelly at the posterior mean (linearity of E[log W] in p)", () => {
  const post = betaPosterior({ wins: 422, losses: 0 });
  const { fraction, winProbability } = bayesianBinaryKellyFraction({ posterior: post, priceCents: 97, payoffCents: 3 });
  close(fraction, kellyFraction({ winProbability: post.mean, payoffRatio: 3 / 97 }), 1e-12);
  close(winProbability, post.mean, 1e-15);
});

test("bayesianBinaryKellyFraction agrees with direct quadrature of the Beta expectation", () => {
  // Beta(30, 5): smooth density, so midpoint quadrature over p is accurate. Maximize on a fine grid of f.
  const post = betaPosterior({ wins: 29.5, losses: 4.5 });
  const N = 20000;
  const dens = [];
  let norm = 0;
  for (let i = 0; i < N; i += 1) { const p = (i + 0.5) / N; const d = Math.exp((post.alpha - 1) * Math.log(p) + (post.beta - 1) * Math.log1p(-p)); dens.push([p, d]); norm += d; }
  const b = 1.2;
  const expected = (f) => dens.reduce((s, [p, d]) => s + (d / norm) * (p * Math.log1p(b * f) + (1 - p) * Math.log1p(-f)), 0);
  let best = 0; let bestValue = -Infinity;
  for (let f = 0; f < 0.9; f += 0.0005) { const v = expected(f); if (v > bestValue) { bestValue = v; best = f; } }
  const { fraction } = bayesianBinaryKellyFraction({ posterior: post, priceCents: 100, payoffCents: 120 });
  close(fraction, best, 1e-3);
});

test("bayesianBinaryKellyFraction concentrates to classic Kelly and is zero without edge", () => {
  const p = 0.99;
  const target = kellyFraction({ winProbability: p, payoffRatio: 3 / 97 });
  const gaps = [1e2, 1e4, 1e6].map((n) => Math.abs(
    bayesianBinaryKellyFraction({ posterior: betaPosterior({ wins: p * n, losses: (1 - p) * n }), priceCents: 97, payoffCents: 3 }).fraction - target));
  assert.ok(gaps[0] > gaps[1] && gaps[1] > gaps[2] && gaps[2] < 1e-4, `gaps ${gaps}`);
  assert.equal(bayesianBinaryKellyFraction({ posterior: betaPosterior({ wins: 90, losses: 10 }), priceCents: 97, payoffCents: 3 }).fraction, 0);
});

test("Bayesian fraction sits between plug-in at the upper loss bound and MLE-based Kelly", () => {
  const post = betaPosterior({ wins: 422, losses: 0 });
  const upperLoss = betaQuantile({ alpha: post.beta, beta: post.alpha, quantile: 0.95 });
  const conservative = kellyFraction({ winProbability: 1 - upperLoss, payoffRatio: 3 / 97 });
  const bayes = bayesianBinaryKellyFraction({ posterior: post, priceCents: 97, payoffCents: 3 }).fraction;
  const mle = kellyFraction({ winProbability: 1, payoffRatio: 3 / 97 });
  assert.ok(conservative < bayes && bayes < mle, `${conservative} < ${bayes} < ${mle}`);
});

test("jointKelly: a single bet reduces to classic Kelly", () => {
  const scenarios = [{ probability: 0.9, wins: [true] }, { probability: 0.1, wins: [false] }];
  const out = jointKellyForCorrelatedOutcomes({ outcomes: [{ priceCents: 50, payoffCents: 75 }], scenarios });
  assert.ok(out.converged);
  close(out.fractions[0], kellyFraction({ winProbability: 0.9, payoffRatio: 1.5 }), 1e-9);
});

test("jointKelly: independent simultaneous bets each take less than their stand-alone Kelly", () => {
  const probs = [0.6, 0.7];
  const out = jointKellyForCorrelatedOutcomes({
    outcomes: [{ priceCents: 50, payoffCents: 50 }, { priceCents: 40, payoffCents: 60 }],
    scenarios: independentScenarios(probs),
  });
  assert.ok(out.converged);
  // Simultaneous independent bets are NOT the separate Kelly fractions in general (they interact through wealth).
  assert.ok(out.kktResidual < 1e-10);
  const alone = [kellyFraction({ winProbability: 0.6, payoffRatio: 1 }), kellyFraction({ winProbability: 0.7, payoffRatio: 1.5 })];
  assert.ok(out.fractions[0] < alone[0] && out.fractions[1] < alone[1], "simultaneous independent bets take a little less than each alone");
});

test("jointKelly: budget binds and non-negativity holds", () => {
  const scenarios = independentScenarios([0.9, 0.9, 0.9]);
  const out = jointKellyForCorrelatedOutcomes({ outcomes: [0, 1, 2].map(() => ({ priceCents: 50, payoffCents: 50 })), scenarios, budget: 0.3 });
  close(out.budgetUsed, 0.3, 1e-9);
  out.fractions.forEach((f) => assert.ok(f >= 0));
  const bad = jointKellyForCorrelatedOutcomes({ outcomes: [{ priceCents: 50, payoffCents: 50 }], scenarios: [{ probability: 0.4, wins: [true] }, { probability: 0.6, wins: [false] }] });
  assert.equal(bad.fractions[0], 0);
});

test("ladderScenarios: exactly one band settles; residual mass becomes a no-listed-band scenario", () => {
  const { outcomes, scenarios } = ladderScenarios({
    bands: [{ id: "a", probability: 0.2 }, { id: "b", probability: 0.3 }],
    bets: [{ id: "noA", band: "a", side: "no" }, { id: "yesB", band: "b", side: "yes" }],
  });
  assert.equal(outcomes.length, 2);
  assert.equal(scenarios.length, 3);
  close(scenarios.reduce((s, x) => s + x.probability, 0), 1, 1e-15);
  const byBand = Object.fromEntries(scenarios.map((s) => [s.band, s.wins]));
  assert.deepEqual(byBand.a, [false, false]);
  assert.deepEqual(byBand.b, [true, true]);
  assert.deepEqual(byBand.null, [true, false]);
  assert.throws(() => ladderScenarios({ bands: [{ id: "a", probability: 0.7 }, { id: "b", probability: 0.7 }], bets: [] }), RangeError);
});

test("jointKelly: selling several exclusive brackets takes more than the independent-loss approximation total, and satisfies KKT", () => {
  const rates = [0.02, 0.015, 0.01];
  const bets = rates.map((r, i) => ({ id: `b${i}`, band: `band${i}`, side: "no" }));
  const { outcomes, scenarios } = ladderScenarios({ bands: rates.map((r, i) => ({ id: `band${i}`, probability: r })), bets });
  const priced = outcomes.map(() => ({ priceCents: 96, payoffCents: 4 }));
  const exclusive = jointKellyForCorrelatedOutcomes({ outcomes: priced, scenarios });
  const independent = jointKellyForCorrelatedOutcomes({ outcomes: priced, scenarios: independentScenarios(rates.map((r) => 1 - r)), tolerance: 1e-7 });
  assert.ok(exclusive.converged && independent.converged && exclusive.kktResidual < 1e-10);
  assert.ok(exclusive.expectedLogGrowth > independent.expectedLogGrowth, "the exclusive-loss model is the better-informed bet");
  const total = (o) => o.fractions.reduce((s, x) => s + x, 0);
  assert.ok(total(exclusive) > total(independent), "mutually exclusive losses leave more room than independent ones");
});

// ── shared model error ───────────────────────────────────────────────────────────────────
import { estimateModelRiskModes, jointKellyForCorrelatedOutcomes as jointKelly, ladderScenarios as ladder, modelRiskScenarios } from "../src/sizing.mjs";

const bracket = (id, event, askCents, lossRate) => ({ id, event, priceCents: 100 - askCents, payoffCents: askCents, winProbability: 1 - lossRate, outcomeStructure: "exclusive-losses" });
const ladderOf = (event, lossRate = 0.01) => [bracket(`${event}-a`, event, 4, lossRate), bracket(`${event}-b`, event, 3, lossRate), bracket(`${event}-c`, event, 2, lossRate)];
const sumF = (r) => r.fractions.reduce((s, x) => s + x, 0);

test("modelRiskScenarios with no miscalibrated state is exactly the ladder joint Kelly", () => {
  const opps = ladderOf("E");
  const mr = modelRiskScenarios({ opportunities: opps, modes: [] });
  const direct = ladder({ bands: opps.map((o, i) => ({ id: String(i), probability: 1 - o.winProbability })), bets: opps.map((o, i) => ({ id: o.id, band: String(i), side: "no" })) });
  const a = jointKelly({ outcomes: mr.outcomes, scenarios: mr.scenarios });
  const b = jointKelly({ outcomes: mr.outcomes, scenarios: direct.scenarios });
  a.fractions.forEach((f, i) => assert.ok(Math.abs(f - b.fractions[i]) < 1e-6));
});

test("modelRiskScenarios probabilities sum to 1 and marginals are the mixture of scaled loss rates", () => {
  const opps = [...ladderOf("E1"), ...ladderOf("E2")];
  const { scenarios } = modelRiskScenarios({ opportunities: opps, modes: [{ weight: 0.02, lambda: 10 }] });
  assert.ok(Math.abs(scenarios.reduce((s, r) => s + r.probability, 0) - 1) < 1e-12);
  const lose = (i) => scenarios.filter((s) => !s.wins[i]).reduce((t, s) => t + s.probability, 0);
  assert.ok(Math.abs(lose(0) - (0.98 * 0.01 + 0.02 * 0.1)) < 1e-12);
  const both = scenarios.filter((s) => !s.wins[0] && !s.wins[3]).reduce((t, s) => t + s.probability, 0);
  assert.ok(Math.abs(both - (0.98 * 0.01 * 0.01 + 0.02 * 0.1 * 0.1)) < 1e-12, "events are independent given the state");
  assert.ok(both > lose(0) * lose(3), "and positively dependent marginally");
  const sameLadder = scenarios.filter((s) => !s.wins[0] && !s.wins[1]).reduce((t, s) => t + s.probability, 0);
  assert.equal(sameLadder, 0, "brackets of one ladder cannot both fail");
});

test("for a single bet the mixture sizes at the mixture-mean loss rate (Bayesian Kelly = Kelly at the mean)", () => {
  const opps = [bracket("x", "E", 4, 0.01)];
  const mr = modelRiskScenarios({ opportunities: opps, modes: [{ weight: 0.05, lambda: 5 }] });
  const f = jointKelly({ outcomes: mr.outcomes, scenarios: mr.scenarios }).fractions[0];
  const q = 0.95 * 0.01 + 0.05 * 0.05;
  assert.ok(Math.abs(f - kellyFraction({ winProbability: 1 - q, payoffRatio: 4 / 96 })) < 1e-6);
});

test("shared model error lowers growth and stake across same-day ladders, more than independent error of equal mean", () => {
  const three = (rate) => [...ladderOf("E1", rate), ...ladderOf("E2", rate), ...ladderOf("E3", rate)];
  const run = (modes, os) => { const mr = modelRiskScenarios({ opportunities: os, modes }); return jointKelly({ outcomes: mr.outcomes, scenarios: mr.scenarios, tolerance: 1e-9 }); };
  const calibrated = run([], three(0.02));
  const shared = run([{ weight: 0.04, lambda: 10 }], three(0.02));
  const heavier = run([{ weight: 0.08, lambda: 10 }], three(0.02));
  assert.ok(sumF(shared) <= sumF(calibrated) && sumF(heavier) < sumF(shared));
  assert.ok(heavier.expectedLogGrowth < shared.expectedLogGrowth && shared.expectedLogGrowth < calibrated.expectedLogGrowth);
  // same marginal loss rate, no dependence: scale every loss rate to the mixture mean instead
  const independentError = run([], three(0.02 * (0.96 + 0.04 * 10)));
  assert.ok(shared.expectedLogGrowth < independentError.expectedLogGrowth, "dependence is what the mixture adds");
});

test("modelRiskScenarios validates its modes and caps the scenario count", () => {
  assert.throws(() => modelRiskScenarios({ opportunities: ladderOf("E"), modes: [{ weight: 0.7, lambda: 2 }, { weight: 0.5, lambda: 3 }] }), RangeError);
  const many = Array.from({ length: 9 }, (_, i) => ladderOf(`E${i}`)).flat();
  assert.throws(() => modelRiskScenarios({ opportunities: many, modes: [{ weight: 0.1, lambda: 5 }] }), /scenario set would exceed/);
});

const group = (n, failures, q = 0.005) => ({ exposures: new Array(n).fill(q), failures });

test("estimateModelRiskModes: zero failures do not collapse the miscalibrated weight to zero", () => {
  const fit = estimateModelRiskModes({ settledGroups: Array.from({ length: 140 }, () => group(3, 0)) });
  assert.ok(fit.converged);
  assert.ok(fit.weight > 0.003 && fit.weight < 0.02, `weight ${fit.weight}`);
  assert.ok(Math.abs(fit.lambda - 10) < 1.5, "lambda stays near its prior when nothing identifies it");
  const flat = estimateModelRiskModes({ settledGroups: Array.from({ length: 140 }, () => group(3, 0)), prior: { weight: { alpha: 1, beta: 1 } } });
  assert.ok(flat.weight < fit.weight, "without the prior pseudo-count the weight collapses toward 0");
});

test("estimateModelRiskModes: clustered failures raise the weight and are attributed to the bad state", () => {
  const groups = [...Array.from({ length: 180 }, () => group(3, 0)), ...Array.from({ length: 6 }, () => group(3, 2)), ...Array.from({ length: 4 }, () => group(3, 1))];
  const fit = estimateModelRiskModes({ settledGroups: groups });
  const none = estimateModelRiskModes({ settledGroups: Array.from({ length: 190 }, () => group(3, 0)) });
  assert.ok(fit.weight > 3 * none.weight && fit.weight < 0.2);
  assert.ok(fit.lambda > 10);
  assert.ok(fit.responsibilities[181] > 0.5 && fit.responsibilities[0] < 0.05);
  assert.equal(fit.modes[0].weight, fit.weight);
});

test('marginals cannot prove disjoint losses; explicit independence permits simultaneous losses',()=>{
 const unknown=ladderOf('E').map(({outcomeStructure,...m})=>m);
 assert.throws(()=>modelRiskScenarios({opportunities:unknown,modes:[]}),/explicit-consistent-outcome-structure/);
 const independent=unknown.map(m=>({...m,outcomeStructure:'independent'}));
 const r=modelRiskScenarios({opportunities:independent,modes:[]});
 const both=r.scenarios.filter(s=>!s.wins[0]&&!s.wins[1]).reduce((sum,s)=>sum+s.probability,0);
 assert.ok(Math.abs(both-.0001)<1e-12);
 assert.throws(()=>modelRiskScenarios({opportunities:[...independent.slice(0,2),{...independent[2],outcomeStructure:'exclusive-losses'}],modes:[]}),/explicit-consistent/);
 assert.throws(()=>modelRiskScenarios({opportunities:ladderOf('E',.5),modes:[]}),/marginals-exceed/);
});
