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

  const victims = Array.from(state.entries()).sort(
    (a, b) => a[1].lastMessageAt - b[1].lastMessageAt,
  );
  while (state.size > maxActors && victims.length) {
    const [key] = victims.shift() as [string, ActorState];
    state.delete(key);
  }
};
