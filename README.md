# @red-cup-engineering/position-sizing-service

Growth-optimal position sizing: the one upstream owner for Kelly arithmetic in this estate — no
strategy package computes its own Kelly fraction; every consumer imports it from here. Implements
the finance-science-services-section note
[Growth-optimal sizing when ruin is cheap](../../../../../science-services-section/services/social-science-services-section/services/economics-and-business-science-services-section/services/finance-science-services-section/content/text/documents/articles/notes/2026/08/27/2026-08-27-note-on-growth-optimal-sizing-when-ruin-is-cheap.md)
(2026-08-27) and the economics-science-services-section note
[Agent + liquid + time — the growth policy](../../../../../science-services-section/services/social-science-services-section/services/economics-and-business-science-services-section/services/economics-science-services-section/content/text/documents/articles/notes/2026/09/01/2026-09-01-note-on-agent-liquid-time-growth-policy.md)
(2026-09-01, the bounded-stake rule: survival capital walled off, risk capital sized hard, the
only real ruin is liability beyond the stake or touching survival capital).

## Modules

- **`sizing`** (`.`) — the primitives: `kellyFraction` (discrete, `b`-to-1 odds),
  `continuousKellyFraction` (`f* = (μ − r)/σ²`), `crraFraction` (the fractional-Kelly
  generalization), `MAX_DEFENSIBLE_KELLY_MULTIPLE`, `quantileOptimalLeverage`,
  `probabilityOfDrawdown`, `playStyleForGoal` (the Dubins-Savage bold/timid decision),
  `leveragedGrowthRate`/`volatilityDragBreakeven`/`volatilityLeverageParity` (daily-reset
  leverage decay), `sizingAdvice`, and `clampToLong`. Statistics, not money: floating-point by
  design (see Numeric discipline below).
- **`sleeve`** (`./sleeve`) — `sizePosition`, the bounded-risk-sleeve envelope over the sizing
  primitives above: full Kelly by default on the risk sleeve alone (capped at
  `MAX_DEFENSIBLE_KELLY_MULTIPLE`), refusing rather than sizing or clamping when liability
  beyond the stake, a non-positive edge, or a stake that would exceed the sleeve's own risk
  capital forbids it. Survival capital is validated but never read by the sizing math — it is
  walled off by omission, not by a runtime check on its value. Two optional declared attributes
  realize the 2026-09-05 fintech-under-energy-descent note (sections 2, 3.5,
  `561-group-finance-operations-services-section`): `sleeve.stage` (an integer 1-5, the collapse
  stage — Orlov's five stages — at which the sleeve's own venue or rail stops) is carried through
  to every sizing result unchanged; `sleeve.barrierJoules` (`{amount, unit: "joules"|"kwh",
  usdPerKwh, asOf}`) states the survival barrier in energy rather than only USD, and when
  declared, its USD figure (`result.barrierUsd.fromJoules`) is authoritative — compared against
  the sleeve's own `survivalCapital` (`result.barrierUsd.declared`), with a disagreement above
  one percent reported as `mismatchAboveOnePercent`/`mismatchFraction`, never silently resolved
  in either direction.
- **`size-position`** (`./size-position`, also the `size-position` bin) — the CLI/NDJSON face
  over `sleeve`'s `sizePosition`.

## Numeric discipline

Two kinds of number live in this package and they must not be confused (see this section's own
README, "Numeric discipline"). `sizing`'s functions take and return floats — a drift, a
volatility, a Kelly fraction are all inferences from a sample, carrying estimation error far
larger than any floating-point representation error. `sleeve`'s `riskCapital`, `survivalCapital`,
and the returned `stake` are exact decimal strings (via `@red-cup-engineering/energy-bank`'s
`decimal` module), because a rounding error in a sized stake is a lost or invented asset.
`energy-bank/decimal` has no scalar-multiply primitive (it is a ledger built for add/sum/compare
over postings, not scalar arithmetic against a statistic), so the fraction-times-capital product
itself is computed in double precision like every other statistic here; only the never-exceed
guarantee against the caller's own `riskCapital` string is an exact decimal comparison.
