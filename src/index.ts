import {
  createActorState,
  pruneActorStates,
  pruneBurstTimestamps,
  pruneDuplicateTexts,
} from "./actor-state.js";
import { normalizeConfig } from "./config.js";
import {
  SPAM_BLOCK_REASONS,
  SPAM_FILTER_NAME,
  type ActorState,
  type SpamCheckInput,
  type SpamFilter,
  type SpamFilterConfig,
} from "./contracts.js";
import { normalizeActorKey, normalizeForSpam } from "./normalize.js";

export * from "./contracts.js";

export function createSpamFilter(
  rawConfig: Partial<SpamFilterConfig> = {},
): SpamFilter {
  const config = normalizeConfig(rawConfig);
  const state = new Map<string, ActorState>();

  const retentionMs = Math.max(
    config.minIntervalMs,
    config.duplicateWindowMs,
    config.burstWindowMs,
  );

  return {
    name: SPAM_FILTER_NAME,
    check(input: SpamCheckInput) {
      const nowMs = Number.isFinite(input.nowMs)
        ? Number(input.nowMs)
        : Date.now();
      const { actorKey, text } = input;
      const normalizedActorKey = normalizeActorKey(actorKey);
      const normalized = normalizeForSpam(text);
      if (!normalized) {
        return { allowed: false, reason: SPAM_BLOCK_REASONS.empty };
      }

      let actor = state.get(normalizedActorKey);
      if (!actor) {
        actor = createActorState();
        state.set(normalizedActorKey, actor);
      }

      if (
        config.minIntervalMs > 0 &&
        actor.lastMessageAt >= 0 &&
        nowMs - actor.lastMessageAt < config.minIntervalMs
      ) {
        return { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast };
      }

      pruneDuplicateTexts(actor, nowMs, config.duplicateWindowMs);
      const previousTextAt = actor.recentNormalizedTexts.get(normalized);
      if (
        previousTextAt !== undefined &&
        nowMs - previousTextAt < config.duplicateWindowMs
      ) {
        return { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate };
      }

      pruneBurstTimestamps(actor, nowMs, config.burstWindowMs);
      if (actor.timestamps.length >= config.burstMaxMessages) {
        return { allowed: false, reason: SPAM_BLOCK_REASONS.burst };
      }

      // State updates happen only after all blocking checks pass, so rejected
      // messages do not extend duplicate windows or burst counters.
      actor.timestamps.push(nowMs);
      actor.lastMessageAt = nowMs;
      actor.lastNormalizedText = normalized;
      actor.lastTextAt = nowMs;
      actor.recentNormalizedTexts.set(normalized, nowMs);
      pruneActorStates(state, nowMs, config.maxActors, retentionMs);

      return { allowed: true };
    },
    reset() {
      state.clear();
    },
  };
}

export function spamFilter(
  rawConfig: Partial<SpamFilterConfig> = {},
): SpamFilter {
  return createSpamFilter(rawConfig);
}
