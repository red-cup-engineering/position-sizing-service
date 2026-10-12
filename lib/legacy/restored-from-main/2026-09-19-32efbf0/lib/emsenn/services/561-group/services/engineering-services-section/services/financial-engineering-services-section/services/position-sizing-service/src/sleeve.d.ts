export interface SleeveEdgeDiscrete {
  readonly winProbability: number;
  readonly payoffRatio: number;
}

export interface SleeveEdgeContinuous {
  readonly drift: number;
  readonly volatility: number;
  readonly riskFreeRate?: number;
}

export type CollapseStage = 1 | 2 | 3 | 4 | 5;

export interface SleeveBarrierJoules {
  readonly amount: string;
  readonly unit: "joules" | "kwh";
  readonly usdPerKwh: string;
  readonly asOf: string;
}

export interface SleeveBarrierUsdReport {
  readonly fromJoules: string;
  readonly declared: string;
  readonly asOf: string;
  readonly mismatchFraction: number;
  readonly mismatchAboveOnePercent: boolean;
}

export interface Sleeve {
  readonly riskCapital: string;
  readonly survivalCapital: string;
  readonly stage?: CollapseStage | null;
  readonly barrierJoules?: SleeveBarrierJoules | null;
}

export interface SleeveSizingAdmitted {
  readonly admitted: true;
  readonly fraction: number;
  readonly stake: string;
  readonly regime: "bold" | "timid" | "indifferent" | "growth";
  readonly kellyMultipleApplied: number;
  readonly goal: number | null;
  readonly stage: CollapseStage | null;
  readonly barrierUsd: SleeveBarrierUsdReport | null;
}

export interface SleeveSizingRefusal {
  readonly admitted: false;
  readonly reason: string;
  readonly goal: number | null;
  readonly stage: CollapseStage | null;
  readonly barrierUsd: SleeveBarrierUsdReport | null;
}

export declare function sizePosition(input: {
  edge: SleeveEdgeDiscrete | SleeveEdgeContinuous;
  sleeve: Sleeve;
  liabilityBeyondStake: boolean;
  kellyMultiple?: number;
  goal?: number | null;
}): SleeveSizingAdmitted | SleeveSizingRefusal;
