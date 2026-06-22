import type { ActorState } from "./contracts.js";

export const createActorState = (): ActorState => ({
  timestamps: [],
  lastMessageAt: Number.NEGATIVE_INFINITY,
  lastNormalizedText: "",
  lastTextAt: Number.NEGATIVE_INFINITY,
  recentNormalizedTexts: new Map(),
});

export const pruneDuplicateTexts = (
  actor: ActorState,
  nowMs: number,
  duplicateWindowMs: number,
): void => {
  for (const [text, seenAt] of actor.recentNormalizedTexts) {
    if (nowMs - seenAt >= duplicateWindowMs) {
      actor.recentNormalizedTexts.delete(text);
    }
  }
};

export const pruneBurstTimestamps = (
  actor: ActorState,
  nowMs: number,
  burstWindowMs: number,
): void => {
  actor.timestamps = actor.timestamps.filter(
    (ts) => nowMs - ts < burstWindowMs,
  );
};

export const pruneActorStates = (
  state: Map<string, ActorState>,
  nowMs: number,
  maxActors: number,
  retentionMs: number,
): void => {
  if (state.size <= maxActors) return;

  for (const [key, actor] of state) {
    if (nowMs - actor.lastMessageAt > retentionMs) {
      state.delete(key);
    }
    if (state.size <= maxActors) return;
  }

  while (state.size > maxActors) {
    let oldestKey: string | undefined;
    let oldestAt = Number.POSITIVE_INFINITY;

    for (const [key, actor] of state) {
      if (actor.lastMessageAt < oldestAt) {
        oldestAt = actor.lastMessageAt;
        oldestKey = key;
      }
    }

    if (oldestKey === undefined) return;
    state.delete(oldestKey);
  }
};
