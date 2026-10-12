/**
 * `sizing` — growth-optimal position sizing, including the case standard finance ignores.
 *
 * Every function here implements a result established in Lenticule Science's finance section
 * on 2026-08-27; the note is the claim, this file is the artifact. See
 * `content/text/documents/articles/notes/2026/08/27/2026-08-27-note-on-growth-optimal-sizing-when-ruin-is-cheap.md`
 * under the finance-services-section, and the glossary terms it links (kelly-criterion,
 * fractional-kelly, bold-play, timid-play, subfair-game, risk-of-ruin,
 * geometric-mean-maximization, volatility-drag).
 *
 * The organizing question is what to do when the usual objective is wrong. Kelly sizing
 * maximizes E[log W], and log(0) = −∞ makes ruin infinitely bad. That is the correct
 * objective for capital you need. It is the *wrong* objective for capital you have already
 * written off, where the utility of losing everything and the utility of losing most of it
 * are near enough the same that the difference should not drive the decision. This module
 * carries both cases and makes the caller say which one they are in, because the answers
 * differ by a factor of several and picking the wrong one is the whole error.
 *
 * What it does NOT do is pretend an edge exists. Every function takes an edge estimate as an
 * input and none of them produce one. The dominant real-world failure of Kelly-style sizing
 * is not that the arithmetic is wrong but that `mu` or `p` was optimistic, and overbetting a
 * mis-estimated edge lowers the realized growth rate *before* ruin ever becomes the binding
 * concern. `sizingAdvice` therefore reports the estimation sensitivity alongside the fraction.
 *
 * Statistics, not money: these are floating-point by design. A drift or volatility is an
 * inference from a sample whose estimation error dwarfs any representation error, so exact
 * decimal arithmetic here would imply a precision the estimate does not have. Money amounts
 * elsewhere in the estate are exact and must stay that way; see this section's README.
 *
 * Plain JavaScript with no TypeScript syntax, shapes in the co-located sizing.d.ts, matching
 * the house convention for a package meant to be imported from inside a consumer's
 * node_modules.
 */

const finite = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new TypeError(`sizing: ${label} must be a finite number, got ${value}`);
  return n;
};

const positive = (value, label) => {
  const n = finite(value, label);
  if (n <= 0) throw new RangeError(`sizing: ${label} must be positive, got ${n}`);
  return n;
};

const probability = (value, label) => {
  const n = finite(value, label);
  if (n < 0 || n > 1) throw new RangeError(`sizing: ${label} must lie in [0,1], got ${n}`);
  return n;
};

// ── Kelly ────────────────────────────────────────────────────────────────────────────────

/**
 * The discrete Kelly fraction for a bet won with probability `p` paying `b`-to-1:
 *
 *   f* = (b·p − q) / b,  where q = 1 − p        ("edge over odds")
 *
 * An even-money bet (b = 1) reduces to the familiar f* = p − q = 2p − 1. A non-positive
 * result means the bet has no edge at this price; it is returned as-is rather than clamped,
 * because a caller that receives a negative fraction has learned something (the bet is
 * favourable in the other direction, or should not be taken) and silently returning 0 would
 * hide it. Use `clampToLong` if a long-only caller needs the floor.
 */
export function kellyFraction({ winProbability, payoffRatio }) {
  const p = probability(winProbability, "winProbability");
  const b = positive(payoffRatio, "payoffRatio");
  return (b * p - (1 - p)) / b;
}

/**
 * The continuous Kelly fraction for a single risky asset under geometric Brownian motion:
 *
 *   f* = (μ − r) / σ²
 *
 * This is a *leverage* figure, not a bounded weight: f* > 1 means the growth-optimal position
 * exceeds the account's own equity, which is a real result and not an error — whether it is
 * reachable depends on the venue's margin rules, which this module knows nothing about.
 */
export function continuousKellyFraction({ drift, volatility, riskFreeRate = 0 }) {
  const mu = finite(drift, "drift");
  const sigma = positive(volatility, "volatility");
  const r = finite(riskFreeRate, "riskFreeRate");
  return (mu - r) / (sigma * sigma);
}

/**
 * The CRRA relaxation — the precise generalization of "fractional Kelly":
 *
 *   f = f_Kelly / σ_RRA
 *
 * where `relativeRiskAversion` is the CRRA coefficient. It is exact for lognormal assets
 * (MacLean, Ziemba & Li 2005) and approximate otherwise.
 *
 * The coefficient is the whole argument of this module:
 *   - σ_RRA = 1 recovers log utility and full Kelly — the standard prescription.
 *   - σ_RRA > 1 is more risk-averse than log and bets *less*. Institutional practice lives
 *     here (half-Kelly is σ_RRA = 2), and it is correct for capital that must survive.
 *   - σ_RRA < 1 bets *more* than Kelly. This is the written-off-stake case: the marginal
 *     utility curve really is close to flat between zero and the whole balance, so the
 *     variance penalty log utility applies is larger than the holder's actual preference.
 *
 * As σ_RRA → 0 the fraction diverges, which is the risk-neutral limit and mathematically
 * correct: an agent genuinely indifferent to variance takes unbounded leverage on any
 * positive edge. It is also useless as advice, so this refuses a coefficient at or below zero
 * rather than returning Infinity. The practical floor is well above zero — see
 * `sizingAdvice`, which will not recommend past `MAX_DEFENSIBLE_KELLY_MULTIPLE` regardless of
 * the coefficient supplied, because estimation error binds long before risk preference does.
 */
export function crraFraction({ kellyFraction: kelly, relativeRiskAversion }) {
  const f = finite(kelly, "kellyFraction");
  const rra = positive(relativeRiskAversion, "relativeRiskAversion");
  return f / rra;
}

/**
 * The largest multiple of full Kelly this module will recommend, whatever risk preference is
 * expressed. Not a moral limit — a statistical one. Growth as a function of the bet fraction
 * is a downward parabola peaking at f*, so overbetting is symmetric with underbetting in
 * growth terms but not in variance, and past roughly 2f* the expected growth rate of a
 * correctly-estimated edge is already negative. Since a retail edge estimate is itself
 * uncertain, the effective ceiling is lower than that. Callers who want more must compute it
 * themselves and own the arithmetic.
 */
export const MAX_DEFENSIBLE_KELLY_MULTIPLE = 1.5;

// ── quantile-optimal leverage ────────────────────────────────────────────────────────────

/**
 * Leverage that maximizes a chosen quantile of terminal wealth rather than its median.
 *
 * Full Kelly is exactly median-optimal: maximizing E[log W] maximizes the 50th percentile of
 * the terminal distribution. A holder for whom the lower half of outcomes is equally
 * worthless — the written-off stake again — is not optimizing the median at all, but some
 * upper quantile, and the leverage that maximizes quantile `q` under GBM over horizon `T` is
 *
 *   L(q) = f_Kelly + z_q / (σ · √T)
 *
 * where z_q is the standard normal quantile. At q = 0.5, z = 0 and this reduces to full
 * Kelly, as it must. Above the median it exceeds Kelly, and it grows without bound as q → 1,
 * which is the correct formal statement of "if you only care about the best outcomes, bet
 * more" — and also why the result must be read alongside `probabilityOfDrawdown`.
 *
 * Horizon matters and is not optional: the same quantile target implies far more leverage
 * over a short horizon than a long one, because the distribution has less time to spread.
 */
export function quantileOptimalLeverage({ drift, volatility, riskFreeRate = 0, quantile, horizonYears = 1 }) {
  const q = probability(quantile, "quantile");
  if (q <= 0 || q >= 1) throw new RangeError(`sizing: quantile must lie strictly within (0,1), got ${q}`);
  const sigma = positive(volatility, "volatility");
  const T = positive(horizonYears, "horizonYears");
  const kelly = continuousKellyFraction({ drift, volatility, riskFreeRate });
  return kelly + normalQuantile(q) / (sigma * Math.sqrt(T));
}

/**
 * The probability that wealth, run at `kellyMultiple` times the growth-optimal fraction, ever
 * falls to `fraction` of its starting value.
 *
 * At full Kelly the classic reflection result is exactly P = fraction: a 50% drawdown has
 * probability 0.5, a 90% drawdown probability 0.1. The percentages match, which is the
 * cleanest statement of how violent growth-optimal betting is even when it is optimal. At a
 * multiple k of Kelly the exponent is (2 − k)/k, so half-Kelly cubes the
 * probability (a 50% drawdown becomes 0.125, a sharper improvement than the common
 * "half Kelly halves the risk" intuition) and 2× Kelly drives it to certainty.
 */
export function probabilityOfDrawdown({ fraction, kellyMultiple = 1 }) {
  const x = probability(fraction, "fraction");
  const k = positive(kellyMultiple, "kellyMultiple");
  if (x === 0) return 0;
  const exponent = 2 / k - 1;
  if (exponent <= 0) return 1;
  return Math.min(1, Math.pow(x, exponent));
}

// ── bold play ────────────────────────────────────────────────────────────────────────────

/**
 * Whether bold play or timid play maximizes the probability of reaching a target before ruin
 * (Dubins & Savage, *How to Gamble If You Must*, 1965).
 *
 * The result is sharp and counterintuitive, and it turns entirely on the sign of the edge:
 *   - In a SUBFAIR game (win probability ≤ ½ at even money, i.e. negative edge), BOLD play is
 *     optimal — stake everything, or the distance to the target, whichever is less. Spreading
 *     a negative-edge process across many small bets makes ruin *more* certain, not less,
 *     because the law of large numbers is working against you.
 *   - In a SUPERFAIR game (positive edge), TIMID play is optimal — bet the minimum and let
 *     time compound the advantage.
 *
 * The practical consequence is that "should I concentrate or diversify" is not a matter of
 * temperament. It is decided by whether the edge is real, which makes honest edge estimation
 * the load-bearing input rather than risk appetite.
 */
export function playStyleForGoal({ winProbability, payoffRatio = 1 }) {
  const p = probability(winProbability, "winProbability");
  const b = positive(payoffRatio, "payoffRatio");
  const expectedValue = p * b - (1 - p);
  if (expectedValue > 0) {
    return {
      style: "timid",
      expectedValue,
      detail: "superfair: positive edge, so minimum-stake repeated play maximizes P(reaching target) — let compounding work",
    };
  }
  if (expectedValue < 0) {
    return {
      style: "bold",
      expectedValue,
      detail: "subfair: negative edge, so a single maximal stake maximizes P(reaching target) — repeated small bets converge to ruin",
    };
  }
  return { style: "indifferent", expectedValue, detail: "fair game: every bounded strategy has the same P(reaching target)" };
}

// ── leverage decay ───────────────────────────────────────────────────────────────────────

/**
 * The expected compound growth rate of an `L`-times daily-reset leveraged instrument:
 *
 *   g_L ≈ L·μ − L²·σ²/2
 *
 * The return term scales with L and the drag term with L², which is the entire reason
 * leveraged ETFs behave the way they do. It is arithmetic of daily compounding, not a fee.
 */
export function leveragedGrowthRate({ drift, volatility, leverage }) {
  const mu = finite(drift, "drift");
  const sigma = finite(volatility, "volatility");
  if (sigma < 0) throw new RangeError(`sizing: volatility must not be negative, got ${sigma}`);
  const L = finite(leverage, "leverage");
  return L * mu - (L * L * sigma * sigma) / 2;
}

/**
 * The volatility at which an `L`-times leveraged instrument's expected compound growth
 * reaches zero, given the underlying's drift: σ = √(2μ/L). Above it, the leveraged instrument
 * loses value in expectation even though the underlying drifts upward.
 *
 * At μ = 10% and L = 3 this is ≈ 25.8% annualized — below the realized volatility of most
 * instruments interesting enough to hold a view on, which is why daily-reset leverage is
 * usually the wrong vehicle for expressing one.
 */
export function volatilityDragBreakeven({ drift, leverage }) {
  const mu = finite(drift, "drift");
  const L = positive(leverage, "leverage");
  if (mu <= 0) return 0;
  return Math.sqrt((2 * mu) / L);
}

/** The volatility at which `L`-times leverage stops beating unleveraged exposure: σ = √(μ). */
export function volatilityLeverageParity({ drift, leverage }) {
  const mu = finite(drift, "drift");
  const L = positive(leverage, "leverage");
  if (L <= 1) throw new RangeError(`sizing: leverage must exceed 1 to compare against unleveraged, got ${L}`);
  if (mu <= 0) return 0;
  // L·μ − L²σ²/2 = μ − σ²/2  ⇒  σ² = 2μ(L−1)/(L²−1) = 2μ/(L+1)
  return Math.sqrt((2 * mu) / (L + 1));
}

// ── advice ───────────────────────────────────────────────────────────────────────────────

/**
 * The whole module applied to one decision, returning the recommended fraction together with
 * the things a caller needs in order to distrust it appropriately.
 *
 * `ruinCost` is the argument the caller must actually make: "material" means losing the stake
 * would change behaviour, and log utility applies; "written-off" means it would not, and the
 * CRRA coefficient may drop below one. The recommendation is capped at
 * `MAX_DEFENSIBLE_KELLY_MULTIPLE` in either case, and the report carries the edge sensitivity
 * so the caller can see how much of the answer rests on an estimate rather than on arithmetic.
 */
export function sizingAdvice({ drift, volatility, riskFreeRate = 0, ruinCost = "material", relativeRiskAversion }) {
  const kelly = continuousKellyFraction({ drift, volatility, riskFreeRate });
  const rra = relativeRiskAversion !== undefined
    ? positive(relativeRiskAversion, "relativeRiskAversion")
    : ruinCost === "written-off" ? 0.75 : 2;
  const uncapped = crraFraction({ kellyFraction: kelly, relativeRiskAversion: rra });
  const ceiling = kelly * MAX_DEFENSIBLE_KELLY_MULTIPLE;
  const recommended = kelly > 0 ? Math.min(uncapped, ceiling) : uncapped;
  const capped = kelly > 0 && uncapped > ceiling;

  // How wrong is the fraction if the drift estimate is wrong by a quarter? Reported because
  // this sensitivity, not risk preference, is what actually bounds defensible leverage.
  const optimistic = continuousKellyFraction({ drift: drift * 0.75, volatility, riskFreeRate });
  const edgeSensitivity = kelly === 0 ? Infinity : Math.abs(kelly - optimistic) / Math.abs(kelly);

  return {
    kellyFraction: kelly,
    relativeRiskAversion: rra,
    recommendedFraction: recommended,
    kellyMultiple: kelly === 0 ? 0 : recommended / kelly,
    capped,
    edgeSensitivity,
    drawdownRisk: {
      half: probabilityOfDrawdown({ fraction: 0.5, kellyMultiple: kelly === 0 ? 1 : recommended / kelly }),
      ninetyPercent: probabilityOfDrawdown({ fraction: 0.1, kellyMultiple: kelly === 0 ? 1 : recommended / kelly }),
    },
    note: kelly <= 0
      ? "no positive edge at these parameters — no size is growth-optimal, and Dubins-Savage says a goal-seeker in a subfair game should play bold rather than size down"
      : capped
        ? `risk preference implies ${uncapped.toFixed(3)}, capped at ${MAX_DEFENSIBLE_KELLY_MULTIPLE}x Kelly because estimation error binds before preference does`
        : "within the defensible range",
  };
}

/** Floor a fraction at zero, for callers that cannot take the short side. */
export function clampToLong(fraction) {
  return Math.max(0, finite(fraction, "fraction"));
}

// ── Bayesian and joint Kelly ─────────────────────────────────────────────────────────────
//
// The fixed "conservative loss rate" (say 1% when a backtest saw 0 losses in 422) is a point
// estimate chosen by hand, and bracket bets on one underlying were treated as independent. The
// three functions below replace both with arithmetic: a posterior for the win probability, the
// fraction that maximizes expected log wealth under that posterior, and the fractions that
// maximize expected log wealth over a *joint* scenario set.
//
// A fact worth stating before the code, because it decides what the posterior can and cannot do:
// for ONE bet, expected log wealth is LINEAR in the unknown win probability p,
//     E_p[ p·log(1+b f) + (1−p)·log(1−f) ] = m·log(1+b f) + (1−m)·log(1−f),   m = E[p].
// So the Bayes-optimal single-bet fraction under log utility is exactly classic Kelly at the
// posterior MEAN (the predictive probability). Uncertainty does not shrink a lone bet beyond
// what the mean already does; it matters through (i) how the mean is formed from thin evidence
// (the prior), (ii) any non-linear objective (a quantile, a CRRA coefficient above 1 over many
// bets), and (iii) dependence across bets, which is what the joint solver is for.

/** ln Γ(x), x > 0 — Lanczos approximation (g = 7, n = 9; Numerical Recipes / Godfrey), |error| < 1e-13. */
function logGamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const y = x - 1;
  let a = c[0];
  const t = y + 7.5;
  for (let i = 1; i < 9; i += 1) a += c[i] / (y + i);
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized incomplete beta I_x(a, b) — continued fraction, modified Lentz (Numerical Recipes 6.4). */
function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  const fraction = (xx, aa, bb) => {
    const tiny = 1e-300;
    let c = 1;
    let d = 1 - ((aa + bb) * xx) / (aa + 1);
    d = Math.abs(d) < tiny ? 1 / tiny : 1 / d;
    let h = d;
    for (let m = 1; m <= 500; m += 1) {
      const m2 = 2 * m;
      let k = (m * (bb - m) * xx) / ((aa + m2 - 1) * (aa + m2));
      d = 1 + k * d; d = Math.abs(d) < tiny ? 1 / tiny : 1 / d;
      c = 1 + k / c; if (Math.abs(c) < tiny) c = tiny;
      h *= d * c;
      k = (-(aa + m) * (aa + bb + m) * xx) / ((aa + m2) * (aa + m2 + 1));
      d = 1 + k * d; d = Math.abs(d) < tiny ? 1 / tiny : 1 / d;
      c = 1 + k / c; if (Math.abs(c) < tiny) c = tiny;
      const delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-15) break;
    }
    return h;
  };
  return x < (a + 1) / (a + b + 2)
    ? (front * fraction(x, a, b)) / a
    : 1 - (front * fraction(1 - x, b, a)) / b;
}

/** Named priors for a binomial win probability: Beta(alpha, beta). */
export const BETA_PRIORS = Object.freeze({
  /** Jeffreys: the Beta(1/2, 1/2) reference prior, invariant under reparametrization (Jeffreys 1946). */
  jeffreys: Object.freeze({ alpha: 0.5, beta: 0.5 }),
  /** Laplace's uniform Beta(1, 1): add-one smoothing; after 0 losses in n the mean loss rate is 1/(n+2), twice Jeffreys' 1/(2(n+1)) asymptotically. */
  uniform: Object.freeze({ alpha: 1, beta: 1 }),
  /** Haldane improper Beta(0, 0): posterior mean equals the sample frequency; refuses to shade a 0-loss record. */
  haldane: Object.freeze({ alpha: 0, beta: 0 }),
});

/**
 * Beta posterior for a Bernoulli success probability p after `wins` successes and `losses` failures.
 *
 * Conjugacy: prior p ~ Beta(α₀, β₀), likelihood p^wins (1−p)^losses ⇒ posterior Beta(α₀ + wins, β₀ + losses)
 * (Gelman et al., Bayesian Data Analysis 3e, §2.4). Here "win" means the bet paid; a tail-selling record of
 * 0 losses in 422 is {wins: 422, losses: 0}. The default prior is Jeffreys Beta(½, ½): after 0 losses in n the
 * posterior mean loss rate is (½)/(n+1), i.e. 0.118% at n = 422, in contrast to the maximum-likelihood 0 (which
 * would size an infinite-edge bet) and to a hand-set 1%. The prior is stated, not hidden: pass `prior` to change it.
 *
 * @param {{wins: number, losses: number, prior?: {alpha: number, beta: number}}} input
 * @returns {{alpha: number, beta: number, wins: number, losses: number, prior: {alpha: number, beta: number},
 *   mean: number, variance: number}}
 */
export function betaPosterior({ wins, losses, prior = BETA_PRIORS.jeffreys } = {}) {
  const w = finite(wins, "wins");
  const l = finite(losses, "losses");
  if (w < 0 || l < 0) throw new RangeError("sizing: wins and losses must be non-negative");
  const a0 = finite(prior?.alpha, "prior.alpha");
  const b0 = finite(prior?.beta, "prior.beta");
  if (a0 < 0 || b0 < 0) throw new RangeError("sizing: prior parameters must be non-negative");
  const alpha = a0 + w;
  const beta = b0 + l;
  if (alpha <= 0 || beta <= 0) throw new RangeError("sizing: the posterior is improper (a Haldane prior needs both a win and a loss)");
  const n = alpha + beta;
  return { alpha, beta, wins: w, losses: l, prior: { alpha: a0, beta: b0 }, mean: alpha / n, variance: (alpha * beta) / (n * n * (n + 1)) };
}

/**
 * The `quantile`-quantile of a Beta(alpha, beta) distribution, by bisection on the regularized incomplete beta
 * function (monotone, so bisection is exact to the 1e-14 tolerance; no derivative needed at the singular ends).
 * Used for the "plug-in at an upper confidence bound" comparison: pass the LOSS posterior (swap alpha and beta).
 */
export function betaQuantile({ alpha, beta, quantile }) {
  const a = positive(alpha, "alpha");
  const b = positive(beta, "beta");
  const q = probability(quantile, "quantile");
  if (q === 0) return 0;
  if (q === 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200 && hi - lo > 1e-15; i += 1) {
    const mid = (lo + hi) / 2;
    if (regularizedIncompleteBeta(mid, a, b) < q) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Bayes-optimal stake fraction for one binary bet, under log utility, given a Beta posterior on the win probability.
 *
 *   f̂ = argmax_{f∈[0,1)} E_{p∼posterior}[ p·log(1 + b f) + (1−p)·log(1 − f) ],   b = payoffCents / priceCents.
 *
 * `priceCents` is the stake at risk per contract (the loss); `payoffCents` the gain per contract if it wins.
 *
 * Method. The objective is the posterior expectation of a function that is affine in p, so by linearity
 * of expectation it equals G(f; m) = m·log(1+b f) + (1−m)·log(1−f) with m the posterior mean (the predictive
 * win probability). G is strictly concave on [0, 1) with G′(f) = m·b/(1+b f) − (1−m)/(1−f), strictly decreasing;
 * the maximizer is found by bisection on the sign of G′ (guaranteed to converge; 200 halvings), clamped at 0
 * when G′(0) = m·b − (1−m) ≤ 0. The closed form is f̂ = (b·m − (1−m))/b, which IS the classic Kelly fraction
 * at p = m (Kelly 1956; Thorp 2006); the bisection is kept so the code states the optimization, and the tests
 * check it against an independent quadrature of the Beta density.
 *
 * Limit: as wins + losses → ∞ the posterior concentrates (variance → 0, mean → the true p), so f̂ → classic
 * Kelly at the true p. With a fixed-size record it is strictly below Kelly at the sample frequency whenever
 * the record contains no losses, because the Jeffreys mean (½)/(n+1) exceeds 0.
 *
 * Comparison with plug-in at an upper bound. Plugging in the upper 1−δ quantile of the LOSS rate (the usual
 * "conservative loss rate") is NOT Bayes-optimal: it is a deliberate over-shading, more cautious than the
 * posterior mean by an amount that grows with the posterior spread; for a tail-seller with 0/422 the 95%
 * upper loss bound under Jeffreys is ≈0.55% against a mean of 0.118%. Shading is legitimate as a risk
 * preference (see crraFraction, sizingAdvice) but should be a stated multiple, not an accident of the estimator.
 *
 * @returns {{fraction: number, winProbability: number, odds: number, expectedLogGrowth: number}}
 */
export function bayesianBinaryKellyFraction({ posterior, priceCents, payoffCents } = {}) {
  const mean = posterior?.mean ?? (positive(posterior?.alpha, "posterior.alpha") / (posterior.alpha + positive(posterior?.beta, "posterior.beta")));
  const m = probability(mean, "posterior.mean");
  const b = positive(payoffCents, "payoffCents") / positive(priceCents, "priceCents");
  const derivative = (f) => (m * b) / (1 + b * f) - (1 - m) / (1 - f);
  let fraction = 0;
  if (derivative(0) > 0) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 200 && hi - lo > 1e-16; i += 1) {
      const mid = (lo + hi) / 2;
      if (derivative(mid) > 0) lo = mid; else hi = mid;
    }
    fraction = (lo + hi) / 2;
  }
  const growth = (m === 0 ? 0 : m * Math.log1p(b * fraction)) + (m === 1 ? 0 : (1 - m) * Math.log1p(-fraction));
  return { fraction, winProbability: m, odds: b, expectedLogGrowth: growth };
}

/**
 * Scenarios for a ladder of brackets on ONE underlying, where exactly one band settles.
 *
 * A temperature (or gas price) lands in exactly one band; each band's probability comes from its distribution
 * and the listed bands need not cover the line, so any remaining mass becomes a residual scenario in which no
 * listed band settles. A bet is {id, band, side}: side "yes" wins exactly when its band settles, side "no" wins
 * in every scenario where it does not (selling YES on a bracket is "no" on that bracket). The result feeds
 * `jointKellyForCorrelatedOutcomes` directly.
 *
 * @param {{bands: {id: string, probability: number}[], bets: {id: string, band: string, side?: "yes"|"no"}[]}} input
 * @returns {{outcomes: {id: string}[], scenarios: {probability: number, wins: boolean[], band: string|null}[]}}
 */
export function ladderScenarios({ bands, bets } = {}) {
  if (!Array.isArray(bands) || !Array.isArray(bets)) throw new TypeError("sizing: bands and bets must be arrays");
  const ids = new Set();
  let mass = 0;
  for (const band of bands) {
    if (ids.has(band.id)) throw new RangeError(`sizing: duplicate band ${band.id}`);
    ids.add(band.id);
    mass += probability(band.probability, `band ${band.id} probability`);
  }
  if (mass > 1 + 1e-9) throw new RangeError(`sizing: band probabilities sum to ${mass}, above 1 (bands must be mutually exclusive)`);
  const rows = bands.map((band) => ({ id: band.id, probability: band.probability }));
  if (mass < 1 - 1e-12) rows.push({ id: null, probability: 1 - mass });
  for (const bet of bets) if (!ids.has(bet.band)) throw new RangeError(`sizing: bet ${bet.id} names unknown band ${bet.band}`);
  const scenarios = rows
    .filter((row) => row.probability > 0)
    .map((row) => ({
      probability: row.probability,
      band: row.id,
      wins: bets.map((bet) => (bet.side === "yes" ? row.id === bet.band : row.id !== bet.band)),
    }));
  return { outcomes: bets.map((bet) => ({ id: bet.id })), scenarios };
}

/**
 * Scenarios for mutually independent bets: all 2^n joint outcomes with product probabilities (n ≤ 20).
 * @param {number[]} winProbabilities
 */
export function independentScenarios(winProbabilities) {
  const n = winProbabilities.length;
  if (n > 20) throw new RangeError("sizing: independentScenarios is limited to 20 bets");
  const scenarios = [];
  for (let mask = 0; mask < 2 ** n; mask += 1) {
    let p = 1;
    const wins = winProbabilities.map((w, i) => {
      const won = Boolean(mask & (1 << i));
      p *= won ? w : 1 - w;
      return won;
    });
    if (p > 0) scenarios.push({ probability: p, wins });
  }
  return scenarios;
}

/**
 * Kelly fractions for SIMULTANEOUS bets over a discrete joint scenario set.
 *
 *   maximize  L(f) = Σ_s π_s · log( 1 + Σ_i f_i · r_{i,s} )
 *   subject to f_i ≥ 0,  Σ_i f_i ≤ budget < 1,
 *
 * where scenario s occurs with probability π_s and bet i returns r_{i,s} = b_i = payoffCents_i / priceCents_i per
 * unit staked if it wins in s and −1 if it loses (fully collateralized, so the loss is the stake). This is the
 * multi-asset Kelly problem (Kelly 1956 §; Thorp 2006 §4; Cover 1984 for the log-optimal portfolio, an
 * equivalent concave program). L is strictly concave in f wherever the return vectors span, the feasible set
 * is a capped simplex, so any KKT point is the global optimum. KKT: with g_i = ∂L/∂f_i = Σ_s π_s r_{i,s}/W_s
 * and W_s = 1 + Σ f_i r_{i,s}, optimality is g_i ≤ λ for all i with equality where f_i > 0, λ ≥ 0, and
 * λ(budget − Σ f) = 0. For independent bets the answer separates into the classic per-bet Kelly fractions
 * (checked in the tests); for mutually exclusive losing bands it differs, and that difference is the point.
 *
 * Method: projected gradient ascent with Barzilai–Borwein steps and Armijo backtracking (Birgin, Martínez &
 * Raydan 2000, spectral projected gradient), projecting on {f ≥ 0, Σf ≤ budget} by the sorting-based
 * Euclidean projection onto the simplex (Duchi et al. 2008). Iterates are kept strictly inside W_s > 0. Stops
 * when the projected-gradient residual falls below `tolerance` (default 1e-10) or at `maxIterations`
 * (default 20000), and says which via `converged` and reports the KKT residual.
 *
 * @param {{outcomes: {id?: string, priceCents: number, payoffCents: number}[],
 *   scenarios: {probability: number, wins: boolean[]|Set<number>}[], budget?: number, tolerance?: number, maxIterations?: number}} input
 *   `scenarios[s].wins[i]` is true when bet i wins in scenario s; probabilities must sum to 1.
 * @returns {{fractions: number[], expectedLogGrowth: number, converged: boolean, iterations: number, kktResidual: number, budgetUsed: number}}
 */
export function jointKellyForCorrelatedOutcomes({ outcomes, scenarios, budget = 1, tolerance = 1e-10, maxIterations = 20000 } = {}) {
  if (!Array.isArray(outcomes) || !Array.isArray(scenarios) || scenarios.length === 0) throw new TypeError("sizing: outcomes and scenarios are required");
  const n = outcomes.length;
  const B = Math.min(positive(budget, "budget"), 1 - 1e-9);
  const b = outcomes.map((o, i) => positive(o.payoffCents, `outcomes[${i}].payoffCents`) / positive(o.priceCents, `outcomes[${i}].priceCents`));
  let mass = 0;
  const pi = scenarios.map((s, k) => { const p = probability(s.probability, `scenarios[${k}].probability`); mass += p; return p; });
  if (Math.abs(mass - 1) > 1e-9) throw new RangeError(`sizing: scenario probabilities sum to ${mass}, not 1`);
  const R = scenarios.map((s, k) => outcomes.map((_, i) => {
    const won = s.wins instanceof Set ? s.wins.has(i) : s.wins?.[i];
    if (won === undefined) throw new TypeError(`sizing: scenario ${k} does not state bet ${i}`);
    return won ? b[i] : -1;
  }));
  return jointKellyForScenarioReturns({ scenarios: pi.map((p, k) => ({ probability: p, returns: R[k] })), budget: B, tolerance, maxIterations });
}

/**
 * The same log-growth optimizer for arbitrary joint returns (equities, spot,
 * contracts, collateralized derivatives), rather than encoding every asset as
 * a binary bet. Returns include trading, holding, funding and exit costs.
 * baselineWealth includes held positions' scenario P&L / current equity.
 * Constraints are linear { coefficients: number[], cap: number } on NEW
 * capital fractions; venue cash, common-factor limits and stress loss therefore
 * constrain the same portfolio. This is scenario loss control, not a claimed
 * probability bound on future pathwise drawdown.
 */
export function jointKellyForScenarioReturns({ scenarios, budget = 1, baselineWealth, constraints = [], tolerance = 1e-10, maxIterations = 20000 } = {}) {
  if (!Array.isArray(scenarios) || !scenarios.length || scenarios.length > 20000) throw new TypeError('sizing: 1..20000 joint scenarios required');
  const n = scenarios[0].returns?.length;
  if (!Number.isInteger(n) || n > 64) throw new RangeError('sizing: at most 64 scenario instruments');
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 20000 || !Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('sizing: bounded iterations and positive tolerance required');
  if (!Array.isArray(constraints) || constraints.length > 1024) throw new RangeError('sizing: bounded constraint set required');
  const B = Math.min(positive(budget, 'budget'), 1 - 1e-9);
  const pi = scenarios.map((s, k) => probability(s.probability, `scenario[${k}].probability`));
  if (Math.abs(pi.reduce((a, p) => a + p, 0) - 1) > 1e-9) throw new RangeError('sizing: scenario probabilities must sum to 1');
  const R = scenarios.map((s, k) => {
    if (!Array.isArray(s.returns) || s.returns.length !== n) throw new TypeError(`sizing: scenario[${k}] return dimensions differ`);
    return s.returns.map((r, i) => finite(r, `scenario[${k}].returns[${i}]`));
  });
  const baseline = baselineWealth ?? pi.map(() => 1);
  if (!Array.isArray(baseline) || baseline.length !== pi.length) throw new TypeError('sizing: baseline wealth dimensions differ');
  baseline.forEach((w, k) => positive(w, `baselineWealth[${k}]`));
  const bounds = constraints.map((c, k) => {
    if (!Array.isArray(c.coefficients) || c.coefficients.length !== n) throw new TypeError(`sizing: constraint[${k}] dimensions differ`);
    const coefficients = c.coefficients.map((x, i) => finite(x, `constraint[${k}][${i}]`));
    const cap = finite(c.cap, `constraint[${k}].cap`);
    if (cap < 0) throw new RangeError('sizing: existing holdings already breach a constraint');
    return { coefficients, cap };
  });
  if (n === 0) return { fractions: [], expectedLogGrowth: pi.reduce((s, p, k) => s + p * Math.log(baseline[k]), 0), converged: true, iterations: 0, kktResidual: 0, budgetUsed: 0 };
  // Bound arithmetic work as well as array sizes and iteration count. Difficult
  // projections must refuse instead of monopolizing an agent host.
  let numericalWork = 0;
  const charge = (work) => { numericalWork += work; if (numericalWork > 20000000) throw new RangeError('sizing: numerical work budget exceeded'); };
  const wealth = (f) => { charge(R.length * n); return R.map((row, k) => baseline[k] + row.reduce((sum, r, i) => sum + r * f[i], 0)); };
  const objective = (f) => {
    const w = wealth(f);
    let total = 0;
    for (let k = 0; k < w.length; k += 1) { if (w[k] <= 0) return -Infinity; if (pi[k] > 0) total += pi[k] * Math.log(w[k]); }
    return total;
  };
  const gradient = (f) => {
    const w = wealth(f);
    charge(R.length * n);
    return f.map((_, i) => R.reduce((sum, row, k) => sum + pi[k] * row[i] / w[k], 0));
  };
  const simplexProject = (v) => {
    const clipped = v.map((x) => Math.max(0, x));
    if (clipped.reduce((s, x) => s + x, 0) <= B) return clipped;
    const sorted = [...v].sort((x, y) => y - x);
    let cumulative = 0;
    let theta = 0;
    for (let j = 0; j < sorted.length; j += 1) {
      cumulative += sorted[j];
      const t = (cumulative - B) / (j + 1);
      if (sorted[j] - t > 0) theta = t;
    }
    return v.map((x) => Math.max(0, x - theta));
  };
  // Dykstra projection onto the capped simplex and the supplied half-spaces.
  // Unlike successive clipping this is the Euclidean projection required by
  // the optimizer. The no-new-position point is always feasible.
  const project = (v) => {
    if (!bounds.length) return simplexProject(v);
    const corrections = Array.from({ length: bounds.length + 1 }, () => new Array(n).fill(0));
    let x = v.slice();
    for (let sweep = 0; sweep < 4000; sweep += 1) {
      charge(n * (bounds.length + 1) * 6);
      const before = x.slice();
      for (let j = 0; j <= bounds.length; j += 1) {
        const y = x.map((a, i) => a + corrections[j][i]);
        if (j === 0) x = simplexProject(y);
        else {
          const { coefficients: a, cap } = bounds[j - 1];
          const norm = a.reduce((s, c) => s + c * c, 0);
          const excess = a.reduce((s, c, i) => s + c * y[i], 0) - cap;
          x = excess > 0 && norm > 0 ? y.map((c, i) => c - excess * a[i] / norm) : y;
        }
        corrections[j] = y.map((a, i) => a - x[i]);
      }
      const feasible = x.every((a) => a >= -1e-12) && x.reduce((a, b) => a + b, 0) <= B + 1e-12
        && bounds.every(({ coefficients: a, cap }) => a.reduce((s, c, i) => s + c * x[i], 0) <= cap + 1e-12);
      if (feasible && Math.max(...x.map((a, i) => Math.abs(a - before[i]))) <= 1e-12) return x.map((a) => Math.max(0, a));
    }
    throw new RangeError('sizing: constraint projection did not converge');
  };
  const residual = (f, g) => {
    // KKT residual: how far the projected gradient step moves f, in the unit-step metric.
    const next = project(f.map((x, i) => x + g[i]));
    return Math.max(...next.map((x, i) => Math.abs(x - f[i])));
  };

  let f = new Array(n).fill(0);
  let value = objective(f);
  let g = gradient(f);
  let step = 1 / Math.max(1e-12, ...f.map((_, i) => R.reduce((s, row, k) => s + pi[k] * row[i] * row[i], 0)));
  let iterations = 0;
  let res = residual(f, g);
  while (res > tolerance && iterations < maxIterations) {
    iterations += 1;
    let t = step;
    let next;
    let nextValue;
    for (let tries = 0; tries < 60; tries += 1) {
      next = project(f.map((x, i) => x + t * g[i]));
      nextValue = objective(next);
      const decrease = g.reduce((s, gi, i) => s + gi * (next[i] - f[i]), 0);
      if (nextValue >= value + 1e-4 * decrease) break;
      t /= 2;
      next = null;
    }
    if (!next || !(nextValue >= value)) break; // no ascent direction at machine precision: at the optimum
    const nextGradient = gradient(next);
    const s = next.map((x, i) => x - f[i]);
    const y = nextGradient.map((x, i) => g[i] - x); // -(∇L(next) − ∇L(f)) is the ascent-curvature secant (L concave)
    const sy = s.reduce((acc, x, i) => acc + x * y[i], 0);
    const ss = s.reduce((acc, x) => acc + x * x, 0);
    step = sy > 0 ? Math.min(1e6, Math.max(1e-12, ss / sy)) : Math.min(1e6, t * 2);
    f = next; value = nextValue; g = nextGradient;
    res = residual(f, g);
  }
  return { fractions: f, expectedLogGrowth: value, converged: res <= tolerance, iterations, kktResidual: res, budgetUsed: f.reduce((s, x) => s + x, 0) };
}

// ── shared model error ───────────────────────────────────────────────────────────────────

/** Upper bound on the joint scenarios `modelRiskScenarios` will build (K modes × Π_events (members+1)). */
export const MAX_MODEL_RISK_SCENARIOS = 20000;

/** Normalize a list of latent model states: weights sum to ≤ 1, the remainder is the calibrated state (λ = 1). */
function normalizeModes(modes) {
  if (!Array.isArray(modes)) throw new TypeError("sizing: modes must be an array");
  const out = [];
  let mass = 0;
  modes.forEach((mode, k) => {
    const weight = probability(mode?.weight, `modes[${k}].weight`);
    const lambda = positive(mode?.lambda, `modes[${k}].lambda`);
    mass += weight;
    if (weight > 0) out.push({ id: mode.id ?? `mode-${k}`, weight, lambda });
  });
  if (mass > 1 + 1e-9) throw new RangeError(`sizing: mode weights sum to ${mass}, above 1`);
  if (mass < 1 - 1e-12) out.unshift({ id: "calibrated", weight: 1 - mass, lambda: 1 });
  return out;
}

/** Explicit binary joint outcomes. Marginals do not identify dependence.
 * outcomeStructure is a caller-supplied model assumption, not an evidence acceptance.
 * Simultaneous Kelly requires a joint distribution: Thorp, section 6,
 * https://www.eecs.harvard.edu/cs286r/courses/fall12/papers/Thorpe_KellyCriterion2007.pdf */
export function binaryOutcomeScenarios(members) {
  if (!Array.isArray(members) || members.length === 0) throw new TypeError('sizing: binary outcomes required');
  const wins = members.map(m => probability(m.winProbability, `${m.id} winProbability`));
  if (members.length === 1) return {structure:'single',scenarios:independentScenarios(wins)};
  const structure = members[0].outcomeStructure;
  if (!['exclusive-losses','exclusive-wins','independent'].includes(structure) || members.some(m => m.outcomeStructure !== structure))
    throw new TypeError('sizing: explicit-consistent-outcome-structure-required');
  if (structure === 'independent') return {structure,scenarios:independentScenarios(wins)};
  const mass = structure === 'exclusive-losses' ? wins.map(w => 1-w) : wins;
  if (mass.reduce((s,p) => s+p,0) > 1+1e-9) throw new RangeError('sizing: exclusive-outcome-marginals-exceed-one');
  return {structure,scenarios:ladderScenarios({bands:mass.map((p,i)=>({id:String(i),probability:p})),bets:members.map((m,i)=>({id:m.id,band:String(i),side:structure==='exclusive-losses'?'no':'yes'}))}).scenarios};
}

/** Preserve the declared event structure under the existing loss-scale stress model. */
function eventModeScenarios(members, lambda) {
  const base = binaryOutcomeScenarios(members); // validate the original marginals before stress normalization
  let loss = members.map(m => Math.min(1, lambda*(1-m.winProbability)));
  const normalize = xs => { const sum=xs.reduce((s,p)=>s+p,0); return sum>1 ? xs.map(p=>p/sum) : xs; };
  if (base.structure === 'exclusive-losses') loss=normalize(loss);
  let wins=loss.map(p=>1-p);
  if (base.structure === 'exclusive-wins') wins=normalize(wins);
  return binaryOutcomeScenarios(members.map((m,i)=>({...m,winProbability:wins[i]})));
}

/**
 * Joint scenario set under SHARED MODEL ERROR: a finite mixture over latent model states.
 *
 * Why. For one bet, Bayesian Kelly under a Beta posterior equals Kelly at the posterior mean (E over p of an
 * affine-in-p objective), so parameter uncertainty that is independent across bets changes nothing. What hurts a
 * tail-seller is a *common* error: the forecast is wrong for a whole station-day or regime, so every certified
 * tail fails together. Model it as a latent state Z ∈ {1..K}, P(Z=k) = w_k, shared by every bet in the group. In
 * state k each bet's loss probability is q_i^(k) = min(1, λ_k · q_i), q_i = 1 − winProbability_i (λ = 1 is the
 * calibrated state). GIVEN Z, events (ladders) are independent and inside an event the bets follow the same
 * explicit outcomeStructure declared by the caller. Missing or inconsistent structure is refused. Where λ-scaled exclusive losses would sum above 1 they are renormalized to sum to 1.
 *
 * Objective. Wealth multiple in joint outcome s of state k is W = 1 + Σ f_i r_{i,s}; by the law of total
 * expectation  E log W = Σ_k w_k Σ_s π_{k,s} log(1 + Σ_i f_i r_{i,s}).  That is exactly an ordinary scenario
 * set with probability w_k·π_{k,s} (scenarios with identical win vectors are merged), so
 * `jointKellyForCorrelatedOutcomes` applies unchanged. Marginally the bets are positively correlated through
 * Z even though they are conditionally independent: P(two fail) = Σ_k w_k q^(k)_i q^(k)_j > q_i q_j.
 *
 * Estimating w_k and λ_k: see `estimateModelRiskModes`.
 *
 * @param {{opportunities: {id: string, event?: string, priceCents: number, payoffCents: number, winProbability: number, outcomeStructure?: 'exclusive-losses'|'exclusive-wins'|'independent'}[],
 *   modes: {id?: string, weight: number, lambda: number}[]}} input  `modes` weights sum to ≤ 1; the remainder is calibrated.
 *   All opportunities passed share ONE latent state (the caller chooses the group: one event, or one date).
 * @returns {{outcomes: object[], scenarios: {probability: number, wins: boolean[]}[], modes: object[], events: {event: string, structure: string}[]}}
 */
export function modelRiskScenarios({ opportunities, modes } = {}) {
  if (!Array.isArray(opportunities)) throw new TypeError("sizing: opportunities must be an array");
  const states = normalizeModes(modes ?? []);
  const byEvent = new Map();
  opportunities.forEach((o, index) => {
    const key = o.event ?? `\u0000${o.id}`;
    byEvent.set(key, [...(byEvent.get(key) ?? []), { ...o, index }]);
  });
  const outcomes = opportunities.map((o) => ({ id: o.id, priceCents: o.priceCents, payoffCents: o.payoffCents }));
  const n = opportunities.length;
  const merged = new Map();
  const events = [];
  for (const [k, state] of states.entries()) {
    const perEvent = [...byEvent.entries()].map(([event, members]) => {
      const built = eventModeScenarios(members, state.lambda);
      if (k === 0) events.push({ event, structure: built.structure });
      return { members, scenarios: built.scenarios };
    });
    const size = perEvent.reduce((s, e) => s * e.scenarios.length, 1);
    if (size * states.length > MAX_MODEL_RISK_SCENARIOS) throw new RangeError(`sizing: model-risk scenario set would exceed ${MAX_MODEL_RISK_SCENARIOS}; group at a finer level`);
    let partial = [{ probability: state.weight, wins: new Array(n).fill(false) }];
    for (const { members, scenarios } of perEvent) {
      const next = [];
      for (const row of partial) {
        for (const sc of scenarios) {
          const wins = row.wins.slice();
          members.forEach((m, j) => { wins[m.index] = sc.wins[j]; });
          next.push({ probability: row.probability * sc.probability, wins });
        }
      }
      partial = next;
    }
    for (const row of partial) {
      const key = row.wins.map((w) => (w ? 1 : 0)).join("");
      const hit = merged.get(key);
      if (hit) hit.probability += row.probability; else merged.set(key, row);
    }
  }
  const scenarios = [...merged.values()].filter((s) => s.probability > 0);
  const total = scenarios.reduce((s, r) => s + r.probability, 0);
  for (const s of scenarios) s.probability /= total; // remove rounding drift
  return { outcomes, scenarios, modes: states, events };
}

/** Default prior for `estimateModelRiskModes`: P(miscalibrated) ~ Beta(2, 98) (mode 1 %, mean 2 %), ln λ ~ Normal(ln 10, 0.5²). */
export const MODEL_RISK_PRIOR = Object.freeze({
  weight: Object.freeze({ alpha: 2, beta: 98 }),
  logLambda: Object.freeze({ mean: Math.log(10), sd: 0.5 }),
});

/** P(exactly y failures) among independent bets with failure probabilities qs (Poisson-binomial DP, truncated at y). */
function poissonBinomialPmf(qs, y) {
  let dist = new Array(y + 1).fill(0);
  dist[0] = 1;
  for (const q of qs) {
    const next = new Array(y + 1).fill(0);
    for (let c = 0; c <= y; c += 1) {
      if (dist[c] === 0) continue;
      next[c] += dist[c] * (1 - q);
      if (c + 1 <= y) next[c + 1] += dist[c] * q;
    }
    dist = next;
  }
  return dist[y];
}

/**
 * Fit the two-state shared-model-error mixture (calibrated vs λ-scaled) from settled groups by EM, MAP.
 *
 * Data: each settled group g (an event, or a station-day if shared error is believed to be date-wide) supplies the
 * STATED loss probabilities q_{g,i} of the certified tails sold in it and the number of them that failed, y_g.
 * Model: Z_g ~ Bernoulli(w) (1 = miscalibrated), independent across groups; given Z_g=0, failures are
 * Poisson-binomial(q); given Z_g=1, Poisson-binomial(min(1, λ q)). (Exclusivity inside a ladder makes the true
 * count law slightly different; to first order in q both put mass Σq on "one failure", which is the regime here.)
 *
 * EM. E-step: r_g = w L1_g(λ) / (w L1_g(λ) + (1−w) L0_g). M-step: w = (Σ r_g + α − 1)/(G + α + β − 2) (the Beta
 * prior's mode), and λ = argmax_{λ∈[1, λmax]} Σ r_g log L1_g(λ) + log N(ln λ; μ, σ²) by golden-section search on ln λ.
 * The priors are the stated defaults in MODEL_RISK_PRIOR. They matter: with ZERO observed failures the likelihood
 * ratio L1/L0 < 1 pushes r_g → 0, and an uninformed MLE would collapse w to 0 (and leave λ unidentified, since
 * a state that never occurs has no parameter to fit); with Beta(α>1, β) the weight settles at the prior pseudo-count
 * (α−1)/(α+β−2) times the evidence-weighted shrinkage, never below it, and λ stays at the prior until a failed
 * group makes it identifiable. That is the intended behaviour: absence of failures in n groups bounds w, it does not
 * prove w = 0 (rule of three: w ≲ 3/G_eff at 95 %).
 *
 * @param {{settledGroups: {exposures: number[], failures: number}[], prior?: object, lambdaMax?: number, maxIterations?: number, tolerance?: number}} input
 * @returns {{weight: number, lambda: number, modes: {id: string, weight: number, lambda: number}[], logPosterior: number,
 *   iterations: number, converged: boolean, groups: number, failures: number, responsibilities: number[]}}
 *   `modes` is ready to pass to `modelRiskScenarios`.
 */
export function estimateModelRiskModes({ settledGroups, prior = MODEL_RISK_PRIOR, lambdaMax = 1000, maxIterations = 2000, tolerance = 1e-9 } = {}) {
  if (!Array.isArray(settledGroups) || settledGroups.length === 0) throw new TypeError("sizing: settledGroups must be a non-empty array");
  const pw = { alpha: prior.weight?.alpha ?? MODEL_RISK_PRIOR.weight.alpha, beta: prior.weight?.beta ?? MODEL_RISK_PRIOR.weight.beta };
  const pl = { mean: prior.logLambda?.mean ?? MODEL_RISK_PRIOR.logLambda.mean, sd: positive(prior.logLambda?.sd ?? MODEL_RISK_PRIOR.logLambda.sd, "prior.logLambda.sd") };
  const groups = settledGroups.map((g, k) => {
    if (!Array.isArray(g.exposures) || !Number.isInteger(g.failures) || g.failures < 0 || g.failures > g.exposures.length) throw new RangeError(`sizing: settledGroups[${k}] needs exposures[] and 0 ≤ failures ≤ exposures.length`);
    g.exposures.forEach((q, i) => probability(q, `settledGroups[${k}].exposures[${i}]`));
    return g;
  });
  // Identical groups (same exposures and failures) share a likelihood: collapse them with a multiplicity.
  const unique = new Map();
  groups.forEach((g, k) => {
    const key = `${g.failures}|${g.exposures.join(",")}`;
    const u = unique.get(key) ?? { g, count: 0, members: [] };
    u.count += 1; u.members.push(k); unique.set(key, u);
  });
  const rows = [...unique.values()];
  const logL = (g, lambda) => Math.log(Math.max(1e-300, poissonBinomialPmf(g.exposures.map((q) => Math.min(1, lambda * q)), g.failures)));
  const L0 = rows.map((u) => Math.exp(logL(u.g, 1)));
  const logPriorLambda = (lam) => -0.5 * ((Math.log(lam) - pl.mean) / pl.sd) ** 2;
  const logPosterior = (w, lam) => rows.reduce((s, u, k) => s + u.count * Math.log((1 - w) * L0[k] + w * Math.exp(logL(u.g, lam))), 0)
    + (pw.alpha - 1) * Math.log(w) + (pw.beta - 1) * Math.log(1 - w) + logPriorLambda(lam);
  let w = Math.min(0.5, Math.max(1e-6, (pw.alpha) / (pw.alpha + pw.beta)));
  let lambda = Math.min(lambdaMax, Math.max(1, Math.exp(pl.mean)));
  let previous = logPosterior(w, lambda);
  let iterations = 0;
  let converged = false;
  let r = [];
  while (iterations < maxIterations) {
    iterations += 1;
    r = rows.map((u, k) => { const a = w * Math.exp(logL(u.g, lambda)); return a / (a + (1 - w) * L0[k]); });
    const sumR = r.reduce((s, x, k) => s + x * rows[k].count, 0);
    w = Math.min(1 - 1e-9, Math.max(1e-9, (sumR + pw.alpha - 1) / (groups.length + pw.alpha + pw.beta - 2)));
    const Q = (u) => r.reduce((s, x, k) => s + rows[k].count * x * logL(rows[k].g, Math.exp(u)), 0) + logPriorLambda(Math.exp(u));
    let lo = 0;
    let hi = Math.log(lambdaMax);
    const phi = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 60; i += 1) {
      const a = hi - phi * (hi - lo);
      const b = lo + phi * (hi - lo);
      if (Q(a) < Q(b)) lo = a; else hi = b;
    }
    lambda = Math.exp((lo + hi) / 2);
    const current = logPosterior(w, lambda);
    if (Math.abs(current - previous) < tolerance) { converged = true; previous = current; break; }
    previous = current;
  }
  const responsibilities = new Array(groups.length);
  rows.forEach((u, k) => u.members.forEach((m) => { responsibilities[m] = r[k]; }));
  return {
    weight: w, lambda,
    modes: [{ id: "miscalibrated", weight: w, lambda }], // the remainder 1 − w is the calibrated state
    logPosterior: previous, iterations, converged, groups: groups.length,
    failures: groups.reduce((s, g) => s + g.failures, 0), responsibilities,
  };
}

// ── internals ────────────────────────────────────────────────────────────────────────────

/**
 * The standard normal quantile function, via Acklam's rational approximation (relative error
 * below 1.15e-9 across the open interval) followed by one Halley refinement step using an
 * Abramowitz-Stegun erfc. Written out rather than imported to keep this package dependency-free,
 * matching the house convention.
 */
function normalQuantile(p) {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  let x;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - plow) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q)
      / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = 0.5 * erfc(-x / Math.SQRT2) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const r = t * Math.exp(
    -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806
      + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
  );
  return x >= 0 ? r : 2 - r;
}
