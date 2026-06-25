import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  createSpamFilter,
  SPAM_BLOCK_REASONS,
  SPAM_FILTER_NAME,
  spamFilter,
  type ActorState,
  type SpamCheckInput,
  type SpamCheckResult,
  type SpamFilterConfig,
  type SpamFilterDecision,
  type SpamFilterInput,
} from "../src/index.js";

type SequenceStep = SpamFilterInput;

const expectDecisions = (
  config: Partial<SpamFilterConfig> | undefined,
  sequence: readonly SequenceStep[],
): SpamFilterDecision[] => {
  const filter = createSpamFilter(config);
  const decisions: SpamFilterDecision[] = [];

  for (const step of sequence) {
    decisions.push(filter.check(step));
  }

  return decisions;
};

describe("textfilters-spam", () => {
  it("exposes old-compatible guard API and alias factory", () => {
    const filter = spamFilter({ minIntervalMs: 0 });
    const input: SpamCheckInput = {
      actorKey: "u1",
      text: "hello",
      nowMs: 1,
    };

    expectTypeOf<SpamCheckInput>().toEqualTypeOf<SpamFilterInput>();
    expectTypeOf<SpamCheckResult>().toEqualTypeOf<SpamFilterDecision>();
    expectTypeOf<ActorState>().toMatchTypeOf<{
      timestamps: number[];
      lastMessageAt: number;
      lastNormalizedText: string;
      lastTextAt: number;
      recentNormalizedTexts: Map<string, number>;
    }>();
    expectTypeOf<SpamFilterConfig>().toMatchTypeOf<{
      actorKeyPolicy: "shared_unknown" | "reject_missing";
      clockPolicy: "input_or_system" | "system";
      trackRejectedAttempts: boolean;
    }>();
    expect(filter.name).toBe(SPAM_FILTER_NAME);
    const result: SpamCheckResult = filter.check(input);
    expect(result).toEqual({ allowed: true });
  });

  it("allows first message and blocks empty/whitespace", () => {
    expect(
      expectDecisions(undefined, [
        { actorKey: "u1", text: "hello", nowMs: 1_000 },
        { actorKey: "u1", text: "   ", nowMs: 2_000 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.empty },
    ]);
  });

  it("blocks too fast consecutive messages", () => {
    expect(
      expectDecisions({ minIntervalMs: 700 }, [
        { actorKey: "u1", text: "one", nowMs: 1_000 },
        { actorKey: "u1", text: "two", nowMs: 1_600 },
        { actorKey: "u1", text: "two", nowMs: 1_701 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: true },
    ]);
  });

  it("allows zero to disable interval checks", () => {
    expect(
      expectDecisions({ minIntervalMs: 0 }, [
        { actorKey: "u1", text: "one", nowMs: 1_000 },
        { actorKey: "u1", text: "two", nowMs: 1_001 },
      ]),
    ).toEqual([{ allowed: true }, { allowed: true }]);
  });

  it("keeps interval checks disabled when explicit clocks move backward", () => {
    expect(
      expectDecisions({ minIntervalMs: 0 }, [
        { actorKey: "u1", text: "one", nowMs: 1_000 },
        { actorKey: "u1", text: "two", nowMs: 999 },
      ]),
    ).toEqual([{ allowed: true }, { allowed: true }]);
  });

  it("enforces interval and duplicate checks after messages at time zero", () => {
    expect(
      expectDecisions({ minIntervalMs: 700 }, [
        { actorKey: "u1", text: "one", nowMs: 0 },
        { actorKey: "u1", text: "two", nowMs: 100 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
    ]);

    expect(
      expectDecisions({ minIntervalMs: 0, duplicateWindowMs: 700 }, [
        { actorKey: "u1", text: "same", nowMs: 0 },
        { actorKey: "u1", text: "same", nowMs: 100 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
    ]);
  });

  it("does not update actor state on rejected interval checks", () => {
    expect(
      expectDecisions({ minIntervalMs: 700 }, [
        { actorKey: "u1", text: "one", nowMs: 1_000 },
        { actorKey: "u1", text: "two", nowMs: 1_600 },
        { actorKey: "u1", text: "three", nowMs: 1_701 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: true },
    ]);
  });

  it("keeps current non-monotonic and negative nowMs behavior", () => {
    expect(
      expectDecisions({ minIntervalMs: 700 }, [
        { actorKey: "u1", text: "first", nowMs: 1_000 },
        { actorKey: "u1", text: "back", nowMs: 500 },
        { actorKey: "u1", text: "next", nowMs: 1_701 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: true },
    ]);

    expect(
      expectDecisions({ minIntervalMs: 700 }, [
        { actorKey: "u1", text: "negative", nowMs: -100 },
        { actorKey: "u1", text: "zero", nowMs: 0 },
      ]),
    ).toEqual([{ allowed: true }, { allowed: true }]);
  });

  it("falls back to Date.now for non-finite nowMs", () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_600);
    const filter = createSpamFilter({ minIntervalMs: 700 });

    try {
      expect(
        filter.check({ actorKey: "u1", text: "one", nowMs: 1_000 }),
      ).toEqual({
        allowed: true,
      });
      expect(
        filter.check({ actorKey: "u1", text: "two", nowMs: Number.NaN }),
      ).toEqual({
        allowed: false,
        reason: SPAM_BLOCK_REASONS.tooFast,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("falls back to Date.now when nowMs is missing", () => {
    const nowSpy = vi.spyOn(Date, "now");
    const filter = createSpamFilter({ minIntervalMs: 700 });

    try {
      nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_600);

      expect(filter.check({ actorKey: "u1", text: "one" })).toEqual({
        allowed: true,
      });
      expect(filter.check({ actorKey: "u1", text: "two" })).toEqual({
        allowed: false,
        reason: SPAM_BLOCK_REASONS.tooFast,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("can ignore caller-provided clocks for server-side time policy", () => {
    const nowSpy = vi.spyOn(Date, "now");
    const filter = createSpamFilter({
      clockPolicy: "system",
      minIntervalMs: 700,
    });

    try {
      nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_600);

      expect(
        filter.check({ actorKey: "u1", text: "one", nowMs: 10_000 }),
      ).toEqual({ allowed: true });
      expect(
        filter.check({ actorKey: "u1", text: "two", nowMs: 20_000 }),
      ).toEqual({
        allowed: false,
        reason: SPAM_BLOCK_REASONS.tooFast,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("uses system time with missing nowMs under system clock policy", () => {
    const nowSpy = vi.spyOn(Date, "now");
    const filter = createSpamFilter({
      clockPolicy: "system",
      minIntervalMs: 700,
    });

    try {
      nowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_701);

      expect(filter.check({ actorKey: "u1", text: "one" })).toEqual({
        allowed: true,
      });
      expect(filter.check({ actorKey: "u1", text: "two" })).toEqual({
        allowed: true,
      });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("blocks duplicate messages in duplicate window after text normalization", () => {
    expect(
      expectDecisions({ minIntervalMs: 0, duplicateWindowMs: 10_000 }, [
        { actorKey: "u1", text: "Hello   world", nowMs: 1_000 },
        { actorKey: "u1", text: " hello world ", nowMs: 2_000 },
        { actorKey: "u1", text: "hello world", nowMs: 11_500 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
      { allowed: true },
    ]);
  });

  it("blocks repeated messages after intervening accepted text", () => {
    expect(
      expectDecisions({ minIntervalMs: 0, duplicateWindowMs: 10_000 }, [
        { actorKey: "u1", text: "spam", nowMs: 1_000 },
        { actorKey: "u1", text: "other", nowMs: 2_000 },
        { actorKey: "u1", text: "spam", nowMs: 3_000 },
        { actorKey: "u1", text: "spam", nowMs: 12_000 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
      { allowed: true },
    ]);
  });

  it("normalizes text by stripping zero-width chars, NFKC, trimming, and lowercasing", () => {
    expect(
      expectDecisions({ minIntervalMs: 0, duplicateWindowMs: 10_000 }, [
        { actorKey: "u1", text: " Ｈe\u200Bllo ", nowMs: 1_000 },
        { actorKey: "u1", text: "hello", nowMs: 2_000 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
    ]);
  });

  it("blocks burst flooding by actor", () => {
    expect(
      expectDecisions(
        { minIntervalMs: 0, burstWindowMs: 5_000, burstMaxMessages: 3 },
        [
          { actorKey: "u1", text: "1", nowMs: 1_000 },
          { actorKey: "u1", text: "2", nowMs: 2_000 },
          { actorKey: "u1", text: "3", nowMs: 3_000 },
          { actorKey: "u1", text: "4", nowMs: 4_000 },
          { actorKey: "u1", text: "5", nowMs: 7_001 },
        ],
      ),
    ).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.burst },
      { allowed: true },
    ]);
  });

  it("tracks actors independently", () => {
    expect(
      expectDecisions({ minIntervalMs: 700 }, [
        { actorKey: "u1", text: "one", nowMs: 1_000 },
        { actorKey: "u2", text: "one", nowMs: 1_100 },
        { actorKey: "u1", text: "two", nowMs: 1_200 },
        { actorKey: "u2", text: "two", nowMs: 1_900 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: true },
    ]);
  });

  it("supports reset()", () => {
    const filter = createSpamFilter({ minIntervalMs: 10_000 });

    expect(filter.check({ actorKey: "u1", text: "one", nowMs: 1_000 })).toEqual(
      {
        allowed: true,
      },
    );
    expect(filter.check({ actorKey: "u1", text: "two", nowMs: 1_100 })).toEqual(
      {
        allowed: false,
        reason: SPAM_BLOCK_REASONS.tooFast,
      },
    );

    filter.reset();

    const afterReset = { actorKey: "u1", text: "two", nowMs: 1_100 };
    expect(filter.check(afterReset)).toEqual({ allowed: true });
  });

  it("evicts old actor states when map grows over limit", () => {
    expect(
      expectDecisions(
        {
          minIntervalMs: 0,
          duplicateWindowMs: 100,
          burstWindowMs: 100,
          maxActors: 2,
        },
        [
          { actorKey: "u1", text: "a", nowMs: 0 },
          { actorKey: "u2", text: "a", nowMs: 0 },
          { actorKey: "u3", text: "a", nowMs: 1_000 },
          { actorKey: "u1", text: "a", nowMs: 1_001 },
        ],
      ),
    ).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: true },
      { allowed: true },
    ]);
  });

  it("evicts oldest states when map is oversized without stale actors", () => {
    expect(
      expectDecisions(
        {
          minIntervalMs: 1,
          duplicateWindowMs: 1_000,
          burstWindowMs: 1_000,
          maxActors: 2,
        },
        [
          { actorKey: "u1", text: "a", nowMs: 1_000 },
          { actorKey: "u2", text: "a", nowMs: 1_000 },
          { actorKey: "u3", text: "a", nowMs: 1_000 },
          { actorKey: "u1", text: "a", nowMs: 1_001 },
        ],
      ),
    ).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: true },
      { allowed: true },
    ]);
  });

  it("normalizes actor key and strips zero-width characters from text", () => {
    expect(
      expectDecisions({ minIntervalMs: 0, duplicateWindowMs: 10_000 }, [
        { actorKey: " User_1 ", text: "he\u200Bllo", nowMs: 1_000 },
        { actorKey: "user_1", text: "hello", nowMs: 2_000 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
    ]);
  });

  it("keeps missing actor keys in the shared unknown bucket by default", () => {
    expect(
      expectDecisions({ minIntervalMs: 0, duplicateWindowMs: 10_000 }, [
        { text: "same", nowMs: 1_000 },
        { actorKey: "   ", text: " same ", nowMs: 2_000 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
    ]);
  });

  it("can reject missing actor keys explicitly", () => {
    const filter = createSpamFilter({
      actorKeyPolicy: "reject_missing",
      minIntervalMs: 0,
    });

    expect(filter.check({ text: "hello", nowMs: 1_000 })).toEqual({
      allowed: false,
      reason: SPAM_BLOCK_REASONS.missingActor,
    });
    expect(
      filter.check({ actorKey: "   ", text: "hello", nowMs: 1_000 }),
    ).toEqual({
      allowed: false,
      reason: SPAM_BLOCK_REASONS.missingActor,
    });
    expect(
      filter.check({ actorKey: "u1", text: "hello", nowMs: 1_000 }),
    ).toEqual({
      allowed: true,
    });
  });

  it("keeps rejected attempts from updating state by default", () => {
    expect(
      expectDecisions({ minIntervalMs: 700 }, [
        { actorKey: "u1", text: "one", nowMs: 1_000 },
        { actorKey: "u1", text: "two", nowMs: 1_600 },
        { actorKey: "u1", text: "three", nowMs: 1_701 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: true },
    ]);
  });

  it("can track rejected attempts to keep pressure on repeated failures", () => {
    expect(
      expectDecisions({ minIntervalMs: 700, trackRejectedAttempts: true }, [
        { actorKey: "u1", text: "one", nowMs: 1_000 },
        { actorKey: "u1", text: "two", nowMs: 1_600 },
        { actorKey: "u1", text: "three", nowMs: 1_701 },
        { actorKey: "u1", text: "four", nowMs: 2_301 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
    ]);
  });

  it("does not let tracked rejected attempts rewind actor time", () => {
    expect(
      expectDecisions({ minIntervalMs: 700, trackRejectedAttempts: true }, [
        { actorKey: "u1", text: "one", nowMs: 1_000 },
        { actorKey: "u1", text: "back", nowMs: 500 },
        { actorKey: "u1", text: "next", nowMs: 1_200 },
      ]),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
    ]);
  });

  it("can extend duplicate windows after rejected duplicates", () => {
    expect(
      expectDecisions(
        {
          minIntervalMs: 0,
          duplicateWindowMs: 1_000,
          trackRejectedAttempts: true,
        },
        [
          { actorKey: "u1", text: "same", nowMs: 1_000 },
          { actorKey: "u1", text: "same", nowMs: 1_500 },
          { actorKey: "u1", text: "same", nowMs: 2_001 },
          { actorKey: "u1", text: "same", nowMs: 2_501 },
          { actorKey: "u1", text: "same", nowMs: 3_502 },
        ],
      ),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
      { allowed: false, reason: SPAM_BLOCK_REASONS.duplicate },
      { allowed: true },
    ]);
  });

  it("falls back to safe defaults for invalid config values", () => {
    expect(
      expectDecisions(
        {
          minIntervalMs: -1,
          duplicateWindowMs: 0,
          burstWindowMs: Number.NaN,
          burstMaxMessages: -5,
          maxActors: 0,
        },
        [
          { actorKey: "u1", text: "one", nowMs: 1_000 },
          { actorKey: "u1", text: "two", nowMs: 1_600 },
        ],
      ),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
    ]);

    expect(
      expectDecisions(
        {
          minIntervalMs: null as unknown as number,
        },
        [
          { actorKey: "u1", text: "one", nowMs: 1_000 },
          { actorKey: "u1", text: "two", nowMs: 1_600 },
        ],
      ),
    ).toEqual([
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
    ]);
  });

  it("runs deterministic sequences with explicit nowMs", () => {
    expect(
      expectDecisions(
        { minIntervalMs: 200, duplicateWindowMs: 1_000, burstMaxMessages: 2 },
        [
          { actorKey: "a", text: "one", nowMs: 10 },
          { actorKey: "b", text: "one", nowMs: 20 },
          { actorKey: "a", text: "two", nowMs: 209 },
          { actorKey: "a", text: "two", nowMs: 410 },
          { actorKey: "a", text: "three", nowMs: 620 },
        ],
      ),
    ).toEqual([
      { allowed: true },
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.tooFast },
      { allowed: true },
      { allowed: false, reason: SPAM_BLOCK_REASONS.burst },
    ]);
  });
});
