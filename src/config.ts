import type { SpamFilterConfig } from "./contracts.js";

export const DEFAULT_CONFIG: SpamFilterConfig = {
  minIntervalMs: 700,
  duplicateWindowMs: 12000,
  burstWindowMs: 10000,
  burstMaxMessages: 6,
  maxActors: 3000,
};

const MAX_LIMIT = Number.MAX_SAFE_INTEGER;

// Reject invalid limits instead of clamping them, so a single bad option cannot
// silently disable a guard by expanding it to an effectively unbounded value.
export const toBoundedInt = (
  value: unknown,
  fallback: number,
  min = 1,
): number => {
  if (typeof value !== "number") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(n);
  if (i < min || i > MAX_LIMIT) return fallback;
  return i;
};

export const normalizeConfig = (
  rawConfig: Partial<SpamFilterConfig> = {},
): SpamFilterConfig => ({
  minIntervalMs: toBoundedInt(
    rawConfig.minIntervalMs,
    DEFAULT_CONFIG.minIntervalMs,
    0,
  ),
  duplicateWindowMs: toBoundedInt(
    rawConfig.duplicateWindowMs,
    DEFAULT_CONFIG.duplicateWindowMs,
  ),
  burstWindowMs: toBoundedInt(
    rawConfig.burstWindowMs,
    DEFAULT_CONFIG.burstWindowMs,
  ),
  burstMaxMessages: toBoundedInt(
    rawConfig.burstMaxMessages,
    DEFAULT_CONFIG.burstMaxMessages,
  ),
  maxActors: toBoundedInt(rawConfig.maxActors, DEFAULT_CONFIG.maxActors),
});
