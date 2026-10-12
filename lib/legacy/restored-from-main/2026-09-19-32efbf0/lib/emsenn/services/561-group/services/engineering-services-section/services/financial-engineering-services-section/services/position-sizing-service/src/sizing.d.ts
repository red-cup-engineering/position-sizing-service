export interface SizingReport {
  readonly kellyFraction: number;
  readonly relativeRiskAversion: number;
  readonly recommendedFraction: number;
  readonly kellyMultiple: number;
  readonly capped: boolean;
  readonly edgeSensitivity: number;
  readonly drawdownRisk: { readonly half: number; readonly ninetyPercent: number };
  readonly note: string;
}

export interface PlayStyle {
  readonly style: "bold" | "timid" | "indifferent";
  readonly expectedValue: number;
  readonly detail: string;
}

export declare const MAX_DEFENSIBLE_KELLY_MULTIPLE: number;

export declare function kellyFraction(input: { winProbability: number; payoffRatio: number }): number;
export declare function continuousKellyFraction(input: { drift: number; volatility: number; riskFreeRate?: number }): number;
export declare function crraFraction(input: { kellyFraction: number; relativeRiskAversion: number }): number;
export declare function quantileOptimalLeverage(input: { drift: number; volatility: number; riskFreeRate?: number; quantile: number; horizonYears?: number }): number;
export declare function probabilityOfDrawdown(input: { fraction: number; kellyMultiple?: number }): number;
export declare function playStyleForGoal(input: { winProbability: number; payoffRatio?: number }): PlayStyle;
export declare function leveragedGrowthRate(input: { drift: number; volatility: number; leverage: number }): number;
export declare function volatilityDragBreakeven(input: { drift: number; leverage: number }): number;
export declare function volatilityLeverageParity(input: { drift: number; leverage: number }): number;
export declare function sizingAdvice(input: { drift: number; volatility: number; riskFreeRate?: number; ruinCost?: "material" | "written-off"; relativeRiskAversion?: number }): SizingReport;
export declare function clampToLong(fraction: number): number;
