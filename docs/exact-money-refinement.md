# Exact money at the position-sizing boundary

## Receiving requirement

An agent submitting an exact decimal capital amount receives a stake computed
without converting that amount to binary floating point. Existing statistical
sizing, risk-sleeve limits, liability refusals, stage declarations and the
separation of survival capital from sizing remain the governing policy.

The source defect is the conversion of `riskCapital`, energy quantity, energy
price and both barrier amounts through `Number` before final decimal comparison.
For example, a half-sized stake against `9007199254740993` must be
`4503599627370496.5`, rather than losing the final unit before multiplication.

## Contracts and refinement

| Clause | Machine guarantee | Owning operation |
| --- | --- | --- |
| MONEY-01 | Keep statistical Kelly and applied multiple as existing binary64 calculations. Admit the final finite scalar using its ECMAScript shortest decimal spelling; disclose that interpretation. This does not make estimated probabilities exact facts. | `sizePosition` and the existing sizing module |
| MONEY-02 | Multiply the admitted scalar by the complete original decimal capital as exact rationals. Round once, half away from zero, at `max(original capital places, 2)`. Preserve original refusal when the rounded stake exceeds exact risk capital. | Exact Number `rationalOfDecimal`, `ratMultiply`, `decimalOfRational`; Energy Bank final comparison |
| MONEY-03 | Compute energy quantity × price / unit divisor exactly, with divisor 3,600,000 for joules and 1 for kWh. Round once, half away from zero, at `max(original price places, 2)`. | The same Exact Number supplier |
| MONEY-04 | Derive the mismatch decision from exact rounded and declared barrier values. Retain the original signed denominator convention and zero-declared behavior. Strictly more than one percent is tested against exact 1/100; a lossy display ratio cannot decide the boolean. | Rational subtraction, division and comparison |
| MONEY-05 | Add transport-safe evidence naming scalar interpretation, admitted coefficients, unrounded rational result, decimal result, places and rounding rule. Evidence records arithmetic, not issuer authentication, mathematical model fitness, trade authority, payment or customer acceptance. | `arithmetic` on sized records and `barrierUsd` |
| MONEY-06 | Refuse a nonfinite final sizing fraction before monetary computation. Preserve liability and nonpositive-edge refusal outcomes. No network, order, account or payment effects occur. | `sizePosition` |

The representation invariant is the supplier's canonical `exactNumber.rational`
carrier: decimal numerator and positive denominator strings in reduced form.
The existing Energy Bank parser remains the admission and final formatting owner
for the financial service's decimal-string contract. No new arithmetic library is
introduced; all rational algorithms and quantization belong to the released
`@red-cup-engineering/exact-number-data-service@0.1.7`.

## Evidence shape

When a stake is computed, the result includes `arithmetic` with
`scalarInterpretation: "ecmascript-shortest-decimal"`, `fractionDecimal`,
`fraction`, `riskCapital`, `unroundedStake`, `roundedStake`, `places` and
`rounding: "half-away-from-zero"`. The rational-valued fields are native Exact
Number carriers. A computed stake refused for exceeding capital retains this
evidence; a refusal before computing a stake does not invent it.

`barrierUsd.arithmetic` carries `amount`, `kwhDivisor`, `usdPerKwh`,
`unroundedUsd`, `roundedUsd`, `places`, `rounding`, `absoluteDifference` and
`mismatchFraction`. The last value is an exact rational, or null when a nonzero
difference has a zero declared denominator. `mismatchFraction` at the existing
outer location remains a floating-point presentation. Its projection status is
reported separately so that overflow, underflow and an undefined finite ratio
cannot be confused with exact equality.

## Verification and limits

Requirements-derived independent assays cover exact amounts above 2^53, exponent
range, high decimal precision, ties, tiny finite coefficients, exact unit
conversion and strict one-percent boundaries. The existing entire package suite
checks preserved policy and statistical behavior. A native CLI case exercises
the package's original JSON transport.

The original inputs are declarations. No calculation authenticates those inputs
or verifies a forecast, market price, energy quantity, capital ownership or
outside economic result. The approximate mismatch display can lose precision;
its exact witness and boolean remain authoritative for this arithmetic contract.
