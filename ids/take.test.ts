// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `ids:take` ([8g5], [9pu]): an ID is free when its three bare characters appear
// nowhere in the repository, and re-rolling past a hit is the whole mechanism.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { freeId } from "./take.ts";

/** A draw source that yields the given IDs in order, then throws rather than looping. */
function draws(...ids: readonly string[]): () => string {
  let at = 0;
  return () => {
    const next = ids[at];
    at += 1;
    if (next === undefined) throw new Error("drew more times than the test supplied");
    return next;
  };
}

/** A corpus holding exactly these IDs. */
function holding(...taken: readonly string[]): (id: string) => boolean {
  const set = new Set(taken);
  return (id) => set.has(id);
}

describe("ids:take", () => {
  it("takes the first draw when it appears nowhere", async () => {
    const got = await freeId(holding(), draws("Ay4"));
    assert.equal(got.id, "Ay4");
    assert.equal(got.draws, 1);
  });

  it("re-rolls past a draw the repository already holds, and says how many draws it cost", async () => {
    const got = await freeId(holding("Ay4", "q7Z"), draws("Ay4", "q7Z", "0kR"));
    assert.equal(got.id, "0kR");
    assert.equal(got.draws, 3, "the two hits are counted, because the cost of the rule is the point");
  });

  it("re-rolls past a repeat within one run: an ID drawn already is taken, though nothing is written yet", async () => {
    const seen = new Set<string>();
    const present = (id: string): boolean => seen.has(id);
    const first = await freeId(present, draws("Ay4"));
    seen.add(first.id);
    const second = await freeId(present, draws("Ay4", "0kR"));
    assert.equal(second.id, "0kR");
    assert.notEqual(second.id, first.id);
  });

  it("refuses rather than looping for ever when every draw is taken", async () => {
    await assert.rejects(
      freeId(() => true, draws(...Array.from({ length: 5000 }, () => "Ay4"))),
      /free/i,
      "an exhausted space is refused in words, never an endless loop",
    );
  });

  it("gives back exactly what it drew, and judges nothing about its shape", async () => {
    const got = await freeId(holding(), draws("zzz"));
    assert.equal(got.id, "zzz", "the draw source decides the alphabet; this only decides which are free");
  });
});
