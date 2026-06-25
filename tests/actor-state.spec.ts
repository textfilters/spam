import { describe, expect, it } from "vitest";

import {
  createActorState,
  pruneActorStates,
  pruneBurstTimestamps,
  pruneDuplicateTexts,
} from "../src/actor-state.js";
import type { ActorState } from "../src/index.js";

const actorState = (lastMessageAt: number): ActorState => ({
  ...createActorState(),
  lastMessageAt,
});

describe("actor state pruning", () => {
  it("prunes duplicate texts in place", () => {
    const actor = createActorState();
    actor.recentNormalizedTexts.set("old", 1_000);
    actor.recentNormalizedTexts.set("new", 1_950);

    pruneDuplicateTexts(actor, 2_000, 500);

    expect([...actor.recentNormalizedTexts]).toEqual([["new", 1_950]]);
  });

  it("compacts burst timestamps without replacing the array", () => {
    const actor = createActorState();
    actor.timestamps.push(1_000, 1_500, 1_900);
    const timestamps = actor.timestamps;

    pruneBurstTimestamps(actor, 2_000, 600);

    expect(actor.timestamps).toBe(timestamps);
    expect(actor.timestamps).toEqual([1_500, 1_900]);
  });

  it("prunes expired burst timestamps after retained non-monotonic entries", () => {
    const actor = createActorState();
    actor.timestamps.push(1_000, 500, 1_250);

    pruneBurstTimestamps(actor, 1_501, 1_000);

    expect(actor.timestamps).toEqual([1_000, 1_250]);
  });

  it("does not prune actors below maxActors", () => {
    const state = new Map<string, ActorState>([
      ["a", actorState(1_000)],
      ["b", actorState(2_000)],
    ]);

    pruneActorStates(state, 10_000, 3, 100);

    expect([...state.keys()]).toEqual(["a", "b"]);
  });

  it("prunes stale actors before evicting oldest active actors", () => {
    const state = new Map<string, ActorState>([
      ["stale", actorState(1_000)],
      ["old", actorState(9_500)],
      ["new", actorState(9_900)],
    ]);

    pruneActorStates(state, 10_000, 2, 1_000);

    expect([...state.keys()]).toEqual(["old", "new"]);
  });

  it("evicts the oldest actors when no stale actors are available", () => {
    const state = new Map<string, ActorState>([
      ["oldest", actorState(1_000)],
      ["middle", actorState(2_000)],
      ["newest", actorState(3_000)],
    ]);

    pruneActorStates(state, 3_500, 2, 10_000);

    expect([...state.keys()]).toEqual(["middle", "newest"]);
  });

  it("evicts multiple oldest actors from oversized maps in one prune", () => {
    const state = new Map<string, ActorState>([
      ["oldest", actorState(1_000)],
      ["older", actorState(2_000)],
      ["middle", actorState(3_000)],
      ["newer", actorState(4_000)],
      ["newest", actorState(5_000)],
    ]);

    pruneActorStates(state, 5_500, 2, 10_000);

    expect([...state.keys()]).toEqual(["newer", "newest"]);
  });
});
