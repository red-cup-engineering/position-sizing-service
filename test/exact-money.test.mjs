import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// Independent receiving fixture. Deliberately uses small integer arithmetic
// rather than the production exact-number or Energy Bank implementations.
// Set this to the original source or the candidate source without changing the
// receiving cases. This fixture has no account, payment or trading effects.
const source = process.env.ASSAY_POSITION_SLEEVE_PATH ?? new URL("../src/sleeve.mjs", import.meta.url).pathname;
assert.ok(source, 'ASSAY_POSITION_SLEEVE_PATH must name the exact sleeve.mjs under receiving');
const { sizePosition } = await import(pathToFileURL(source).href);

const abs = n => n < 0n ? -n : n;
const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };
function fraction(n, d = 1n) {
  assert.notEqual(d, 0n);
  if (d < 0n) [n, d] = [-n, -d];
  const g = gcd(n, d); return { n: n / g, d: d / g };
}
function decimal(s) {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(s);
  assert.ok(m, `oracle decimal: ${s}`);
  const scale = (m[3]?.length ?? 0) - Number(m[4] ?? 0);
  const n = BigInt(m[2] + (m[3] ?? '')) * (m[1] === '-' ? -1n : 1n);
  return scale >= 0 ? fraction(n, 10n ** BigInt(scale)) : fraction(n * 10n ** BigInt(-scale));
}
const mul = (a, b) => fraction(a.n * b.n, a.d * b.d);
const div = (a, b) => fraction(a.n * b.d, a.d * b.n);
const sub = (a, b) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
const asWire = a => ({ kind: 'exactNumber.rational', num: String(a.n), den: String(a.d) });
function rounded(q, places) {
  const scaled = abs(q.n) * 10n ** BigInt(places);
  let units = scaled / q.d;
  if (2n * (scaled % q.d) >= q.d) units += 1n;
  const digits = units.toString().padStart(places + 1, '0');
  const unsigned = places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/0+$/, '').replace(/\.$/, '');
  return q.n < 0n && units !== 0n ? `-${unsigned}` : unsigned;
}
const placesOf = s => Math.max((s.split('.')[1] ?? '').length, 2);
const positive = { winProbability: 0.75, payoffRatio: 1 };
const request = (riskCapital, edge = positive) => ({ edge, sleeve: { riskCapital, survivalCapital: '5000' }, liabilityBeyondStake: false });
function withBarrier(amount, declared, unit = 'kwh', price = '1') {
  const q = request('1000');
  q.sleeve.survivalCapital = declared;
  q.sleeve.barrierJoules = { amount, unit, usdPerKwh: price, asOf: '2026-10-26' };
  return q;
}
function expectedBarrier(input) {
  const b = input.sleeve.barrierJoules;
  return rounded(div(mul(decimal(b.amount), decimal(b.usdPerKwh)), decimal(b.unit === 'joules' ? '3600000' : '1')), placesOf(b.usdPerKwh));
}

test('exact capital survives the first unsafe integer and large exponent boundary', () => {
  for (const [capital, stake] of [
    ['9007199254740993', '4503599627370496.5'],
    ['1000000000000000000000', '500000000000000000000'],
    ['9'.repeat(320), `4${'9'.repeat(319)}.5`],
  ]) {
    const result = sizePosition(request(capital));
    assert.equal(result.admitted, true);
    assert.equal(result.fraction, 0.5);
    assert.equal(result.stake, stake);
  }
});

test('declared half-away quantization resolves exact positive midpoint cases', () => {
  for (const [capital, stake] of [['0.03', '0.02'], ['1.005', '0.503'], ['0.05', '0.03']]) {
    const result = sizePosition(request(capital));
    assert.equal(result.admitted, true);
    assert.equal(result.stake, stake);
  }
});

test('source decimal scale beyond Number.toFixed capacity remains exact', () => {
  const capital = `1.${'0'.repeat(101)}1`;
  const result = sizePosition(request(capital));
  assert.equal(result.admitted, true);
  assert.equal(result.stake, `0.5${'0'.repeat(100)}1`);
});

test('canonical statistical scalar is expanded exactly without asserting statistical truth', () => {
  const capital = '9007199254740993.003';
  for (const edge of [
    { winProbability: 0.6, payoffRatio: 1 },
    { winProbability: 0.5000000000000001, payoffRatio: 1 },
    { drift: 1e-7, volatility: 1 },
    { drift: 0.000001, volatility: 1 },
    { drift: 0.3, volatility: 1 },
  ]) {
    const result = sizePosition(request(capital, edge));
    const expectedFraction = edge.winProbability !== undefined
      ? (edge.payoffRatio * edge.winProbability - (1 - edge.winProbability)) / edge.payoffRatio
      : edge.drift / (edge.volatility * edge.volatility);
    assert.equal(result.fraction, expectedFraction, 'the selected statistical policy remains unchanged');
    assert.equal(result.stake, rounded(mul(decimal(capital), decimal(String(expectedFraction))), placesOf(capital)));
  }
});

test('exact scaling agrees with an independent integer oracle across magnitude and quantization seams', () => {
  const capitals = ['0.01', '0.03', '1.005', '17.12345', '999999999999999.99', '9007199254740993', '1000000000000000000001'];
  const scalars = [0.125, 0.3, 0.5, 0.875, 1e-7];
  for (const capital of capitals) for (const scalar of scalars) {
    const result = sizePosition(request(capital, { drift: scalar, volatility: 1 }));
    assert.equal(result.admitted, true);
    assert.equal(result.fraction, scalar);
    assert.equal(result.stake, rounded(mul(decimal(capital), decimal(String(scalar))), placesOf(capital)), `${capital} × ${scalar}`);
  }
});

test('joule and kilowatt-hour paths preserve the same exact dimensioned quantity', () => {
  const inKwh = withBarrier('9007199254740993', '9007199254740993');
  const inJoules = withBarrier('32425917317067574800000', '9007199254740993', 'joules');
  for (const input of [inKwh, inJoules]) {
    const result = sizePosition(input);
    assert.equal(result.barrierUsd.fromJoules, '9007199254740993');
    assert.equal(result.barrierUsd.mismatchAboveOnePercent, false);
    assert.equal(result.barrierUsd.mismatchFraction, 0);
  }
});

test('energy valuation rounds only the final exact quotient at the declared price scale', () => {
  for (const input of [
    withBarrier('54000', '0.02', 'joules'),
    withBarrier('90000', '0.03', 'joules'),
    withBarrier('123456789123456789123456789', '1', 'joules', '0.000000123'),
    withBarrier('7.5', '1', 'kwh', '0.003'),
  ]) assert.equal(sizePosition(input).barrierUsd.fromJoules, expectedBarrier(input));
});

test('one-percent predicate preserves exact equality and a one-unit counterexample above unsafe integers', () => {
  const declared = '100000000000000000000';
  for (const [amount, above] of [
    ['101000000000000000000', false],
    ['101000000000000000001', true],
    ['100999999999999999999', false],
    ['98999999999999999999', true],
    ['99000000000000000000', false],
  ]) {
    const result = sizePosition(withBarrier(amount, declared));
    assert.equal(result.barrierUsd.fromJoules, amount);
    assert.equal(result.barrierUsd.mismatchAboveOnePercent, above, `${amount} vs ${declared}`);
  }
});

test('mismatch numeric presentation is formed from the reduced ratio, including huge equal-scale amounts', () => {
  const declared = `1${'0'.repeat(320)}`;
  const derived = `2${'0'.repeat(320)}`;
  const result = sizePosition(withBarrier(derived, declared));
  assert.equal(result.barrierUsd.fromJoules, derived);
  assert.equal(result.barrierUsd.mismatchAboveOnePercent, true);
  assert.equal(result.barrierUsd.mismatchFraction, 1);
  for (const [amount, expected] of [['0', 0], ['1', Infinity]]) {
    const r = sizePosition(withBarrier(amount, '0'));
    assert.equal(r.barrierUsd.mismatchFraction, expected);
    assert.equal(r.barrierUsd.mismatchAboveOnePercent, expected === Infinity);
  }
});

test('existing policy refusals and survival-capital independence remain intact', () => {
  const q = request('9007199254740993');
  assert.equal(sizePosition({ ...q, liabilityBeyondStake: true }).admitted, false);
  assert.equal(sizePosition({ ...q, edge: { winProbability: 0.4, payoffRatio: 1 } }).admitted, false);
  assert.equal(sizePosition({ ...q, edge: { drift: 2, volatility: 1 } }).admitted, false);
  const sized = sizePosition({ ...q, kellyMultiple: 100, goal: 17 });
  assert.equal(sized.kellyMultipleApplied, 1.5);
  assert.equal(sized.fraction, 0.75);
  assert.equal(sized.goal, 17);
  const otherSurvival = sizePosition({ ...q, sleeve: { ...q.sleeve, survivalCapital: '1', stage: 3 } });
  assert.equal(otherSurvival.stake, sizePosition(q).stake);
  assert.equal(otherSurvival.stage, 3);
});

test('a non-finite statistical result refuses before conversion to exact money', () => {
  assert.throws(() => sizePosition(request('1000', { drift: 1, volatility: 1e-200 })), RangeError);
});

test('result evidence records scalar and quantization interpretation without payment claims', () => {
  const result = sizePosition(request('1.005'));
  assert.equal(result.arithmetic.scalarInterpretation, 'ecmascript-shortest-decimal');
  assert.equal(result.arithmetic.fractionDecimal, '0.5');
  assert.equal(result.arithmetic.roundedStake, '0.503');
  assert.equal(result.arithmetic.places, 3);
  assert.equal(result.arithmetic.rounding, 'half-away-from-zero');
  assert.deepEqual(result.arithmetic.fraction, asWire(fraction(1n, 2n)));
  assert.deepEqual(result.arithmetic.riskCapital, asWire(fraction(201n, 200n)));
  assert.deepEqual(result.arithmetic.unroundedStake, asWire(fraction(201n, 400n)));
  assert.equal(Object.hasOwn(result, 'payment'), false);
  assert.equal(Object.hasOwn(result, 'customerAcceptance'), false);
  const barrier = sizePosition(withBarrier('54000', '0.02', 'joules')).barrierUsd;
  assert.equal(barrier.arithmetic.roundedUsd, '0.02');
  assert.equal(barrier.arithmetic.places, 2);
  assert.equal(barrier.arithmetic.rounding, 'half-away-from-zero');
  assert.deepEqual(barrier.arithmetic.amount, asWire(fraction(54000n)));
  assert.deepEqual(barrier.arithmetic.kwhDivisor, asWire(fraction(3600000n)));
  assert.deepEqual(barrier.arithmetic.usdPerKwh, asWire(fraction(1n)));
  assert.deepEqual(barrier.arithmetic.unroundedUsd, asWire(fraction(3n, 200n)));
  assert.deepEqual(barrier.arithmetic.absoluteDifference, asWire(fraction(0n)));
  assert.deepEqual(barrier.arithmetic.mismatchFraction, asWire(fraction(0n)));
  assert.equal(barrier.mismatchFractionProjection, 'finite');
  assert.deepEqual(JSON.parse(JSON.stringify(result)).arithmetic, result.arithmetic, 'exact arithmetic survives ordinary JSON transport');
});
