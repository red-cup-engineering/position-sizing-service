import test from 'node:test';
import assert from 'node:assert/strict';
import { binaryContractReturns, capitalTimeAllocation, kellyFraction, ladderOptimalContracts, ladderReservationPrices, nestedClaimArbitrage, recordKellyFraction, strategyEvidence } from '../src/sizing.mjs';

const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label ?? ''} ${actual} vs ${expected}`);

test('capital that does not bind has no hurdle: every opportunity takes its own Kelly fraction, whatever its turnover', () => {
  const coin = binaryContractReturns({ probability: 0.6, price: 0.5 });
  const { hurdle, binding, allocations } = capitalTimeAllocation({ opportunities: [{ id: 'quick', rate: 1, holding: 1, scenarios: coin }, { id: 'slow', rate: 0.01, holding: 24, scenarios: coin }] });
  assert.equal(binding, false); assert.equal(hurdle, 0);
  for (const a of allocations) close(a.fraction, kellyFraction({ winProbability: 0.6, payoffRatio: 1 }), 1e-9, a.id);
});

test('when capital binds, the hurdle is the price of capital-time: quick turnover is preferred exactly as far as its return per capital-time warrants', () => {
  const edge = binaryContractReturns({ probability: 0.6, price: 0.5 });
  const opportunities = [{ id: 'hourly', rate: 10, holding: 1, scenarios: edge }, { id: 'daily', rate: 10, holding: 24, scenarios: edge }];
  const { hurdle, binding, capitalUsed, allocations } = capitalTimeAllocation({ opportunities });
  assert.equal(binding, true); assert.ok(hurdle > 0);
  close(capitalUsed, 1, 1e-9, 'all capital is used');
  const [hourly, daily] = allocations;
  assert.ok(hourly.fraction > daily.fraction, 'the same edge locked 24 times longer earns less capital');
  // KKT: each taken opportunity's marginal log return equals the hurdle times its holding time
  for (const [a, o] of allocations.map((a, i) => [a, opportunities[i]])) {
    if (a.fraction === 0) { assert.ok(o.scenarios.reduce((s, sc) => s + sc.probability * sc.return, 0) <= hurdle * o.holding + 1e-12); continue; }
    close(o.scenarios.reduce((s, sc) => s + (sc.probability * sc.return) / (1 + a.fraction * sc.return), 0), hurdle * o.holding, 1e-9, `${a.id} KKT`);
  }
});

test('an opportunity whose return per unit of capital-time is below the hurdle gets nothing', () => {
  const rich = binaryContractReturns({ probability: 0.7, price: 0.5 }), thin = binaryContractReturns({ probability: 0.52, price: 0.5 });
  const { hurdle, allocations } = capitalTimeAllocation({ opportunities: [{ id: 'rich', rate: 50, holding: 1, scenarios: rich }, { id: 'thin', rate: 50, holding: 12, scenarios: thin }] });
  assert.ok(hurdle * 12 > 0.04, 'the thin edge per unit time is below the hurdle');
  assert.equal(allocations[1].fraction, 0);
  assert.ok(allocations[0].fraction > 0);
});

test('a riskless return is capped by the capital it can use, and the hurdle prices it', () => {
  const { allocations, capitalUsed, binding } = capitalTimeAllocation({ opportunities: [{ id: 'sure', rate: 2, holding: 1, scenarios: [{ probability: 1, return: 0.01 }] }] });
  assert.equal(binding, true); close(capitalUsed, 1, 1e-9); close(allocations[0].fraction, 0.5, 1e-9);
});

test('carry lowers both sides\' reservation prices and the size bought; none reproduces the uncarried ladder', () => {
  const bands = [0.2, 0.3, 0.3, 0.2], wealth = 100;
  const free = ladderReservationPrices({ bands, wealth }), zero = ladderReservationPrices({ bands, wealth, carry: 0 }), carried = ladderReservationPrices({ bands, wealth, carry: 0.02 });
  assert.deepEqual(zero, free);
  for (const side of ['yes', 'no']) carried[side].forEach((r, j) => { assert.ok(r < free[side][j], `${side}[${j}]`); close(free[side][j] - r, 0.02 * free[side][j], 2e-3, `${side}[${j}] carry ≈ λτ × price for a small stake`); });
  const n = (carry) => ladderOptimalContracts({ bands, wealth, strike: 1, side: 'yes', price: 0.45, carry });
  assert.ok(n(0.05) <= n(0) && n(0) > 0);
  assert.throws(() => ladderReservationPrices({ bands, wealth, carry: -1 }), /non-negative/u);
});

test('nested claims: a lower strike\'s YES ask below a higher strike\'s YES bid is a riskless book', () => {
  const strikes = [{ bid: 0.7, ask: 0.72 }, { bid: 0.74, ask: 0.76 }, { bid: 0.3, ask: 0.33 }];
  assert.deepEqual(nestedClaimArbitrage({ strikes }).map(({ buy, sell }) => [buy, sell]), [[0, 1]]);
  close(nestedClaimArbitrage({ strikes })[0].profit, 0.02, 1e-12);
  assert.deepEqual(nestedClaimArbitrage({ strikes, cost: () => 0.02 }), [], 'taking costs can close it');
  assert.deepEqual(nestedClaimArbitrage({ strikes: [{ bid: 0.6, ask: 0.62 }, { bid: 0.4, ask: 0.42 }] }), []);
});

test('a strategy gets no stake without a record, nor with one that has not earned back half a total loss', () => {
  assert.equal(recordKellyFraction({ returns: [] }).fraction, 0);
  assert.equal(recordKellyFraction({ returns: [0.3] }).fraction, 0);
  assert.equal(recordKellyFraction({ returns: Array(40).fill(0.01) }).fraction, 0, 'forty 1% wins (0.40) are not yet half a total loss');
  assert.ok(recordKellyFraction({ returns: Array(60).fill(0.01) }).fraction > 0);
  assert.equal(recordKellyFraction({ returns: [-0.05, 0.02, -0.01, 0.6] }).fraction > 0, true);
  assert.equal(recordKellyFraction({ returns: [-0.05, 0.02, -0.04, 0.01] }).fraction, 0);
});

test('the stake grows with the record and tends to the strategy\'s Kelly fraction', () => {
  // A record alternating +30% and −28%: its Kelly fraction solves 0.3/(1 + 0.3φ) = 0.28/(1 − 0.28φ), φ = 0.02/0.168.
  const kelly = 0.02 / 0.168, at = (pairs) => recordKellyFraction({ returns: Array.from({ length: 2 * pairs }, (_, i) => (i % 2 ? -0.28 : 0.3)) }).fraction;
  const stakes = [10, 40, 100, 1000, 20000].map(at);
  assert.equal(stakes[0], 0);
  for (let i = 2; i < stakes.length; i += 1) assert.ok(stakes[i] > stakes[i - 1], `stake rises with evidence: ${stakes}`);
  close(stakes.at(-1), kelly, 2e-3, 'large record');
});

test('the record\'s evidence is the wealth of the bettor that staked it: no stake, no evidence; an edge earns both', () => {
  const losing = strategyEvidence({ returns: [-0.05, 0.02, -0.04, 0.01, -0.03, -0.02] });
  assert.equal(losing.fraction, 0); assert.equal(losing.evidence, 1);
  let seed = 7; const draw = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const returns = Array.from({ length: 600 }, () => (draw() < 0.6 ? 0.05 : -0.05));
  const earning = strategyEvidence({ returns });
  assert.ok(earning.fraction > 0.5 && earning.fraction <= 1, `${earning.fraction}`);
  close(earning.evidence, earning.stakes.reduce((w, phi, i) => w * (1 + phi * returns[i]), 1), 1e-9 * earning.evidence, 'evidence is the staked bettor\'s wealth');
  assert.ok(earning.evidence > 1);
  assert.equal(earning.stakes[0], 0, 'the first settlement is staked nothing');
  const half = strategyEvidence({ returns: returns.slice(0, 300) }), rest = strategyEvidence({ returns: returns.slice(300), state: half.state });
  close(rest.evidence, earning.evidence, 1e-9 * earning.evidence, 'incremental');
  assert.throws(() => strategyEvidence({ returns: [-1.5] }), /below the floor/u);
});
