import type { TextGuard, TextGuardInput } from "@textfilters/core";

export type SpamFilterInput = TextGuardInput;
export type SpamCheckInput = SpamFilterInput;

export const SPAM_FILTER_NAME = "spam";

export const SPAM_BLOCK_REASONS = {
  empty: "empty",
  missingActor: "missing_actor",
  tooFast: "too_fast",
  duplicate: "duplicate",
  burst: "burst",
} as const;

export type SpamBlockReason =
  (typeof SPAM_BLOCK_REASONS)[keyof typeof SPAM_BLOCK_REASONS];

export type SpamFilterDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: SpamBlockReason };
export type SpamCheckResult = SpamFilterDecision;

export type SpamActorKeyPolicy = "shared_unknown" | "reject_missing";
export type SpamClockPolicy = "input_or_system" | "system";

export interface SpamFilterConfig {
  readonly minIntervalMs: number;
  readonly duplicateWindowMs: number;
  readonly burstWindowMs: number;
  readonly burstMaxMessages: number;
  readonly maxActors: number;
  readonly actorKeyPolicy: SpamActorKeyPolicy;
  readonly clockPolicy: SpamClockPolicy;
  readonly trackRejectedAttempts: boolean;
}

export interface ActorState {
  timestamps: number[];
  lastMessageAt: number;
  lastNormalizedText: string;
  lastTextAt: number;
  recentNormalizedTexts: Map<string, number>;
}

export interface SpamFilter extends TextGuard {
  readonly name: typeof SPAM_FILTER_NAME;
  check(input: SpamCheckInput): SpamCheckResult;
  reset(): void;
}
