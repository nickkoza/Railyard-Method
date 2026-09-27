// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [CS8], [63N], [QzV] — tier 2, real git: a link asserted as the code was written is read by the
// queries both ways, as recorded when the code was made, from the links file committed beside it.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { traceBackward, traceForward } from "./index.ts";
import { fixtureRepository } from "./testing/fixture.ts";
import type { Fixture } from "./testing/fixture.ts";
import { link } from "../method/links.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SPEC = ["# Grasp", "", "**ID:** [Ga1]", "", "## Acceptance criteria", "", "1. [Gb2] A trial ends in success or one failure reason.", "2. [Gc3] Success means the item rests in the bin.", ""].join("\n");
const CODE = ["class Bench:", "    def run_trial(self, seed):", "        return 'success'", "", "def in_bin(item):", "    return item.z < 0.1", ""].join("\n");

let fixture: Fixture;

describe("[CS8]: asserted links, read by the queries", () => {
  before(() => {
    fixture = fixtureRepository();
    fixture.commit("The grasp spec and bench", { "docs/specs/grasp.md": SPEC, "sim/grasp.py": CODE });
    link(fixture.dir, "sim/grasp.py", "Bench.run_trial", ["Gb2"], "2026-09-24");
    link(fixture.dir, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    fixture.commit("Links for the bench", { "symbols/links/sim/grasp.py.json": readFileSync(join(fixture.dir, "symbols/links/sim/grasp.py.json"), "utf8") });
  });
  after(() => { fixture.remove(); });

  it("answers a line inside a linked thing with its link, recorded, and says where it was read", () => {
    const answer = traceBackward({ repo: fixture.dir, path: "sim/grasp.py", line: 3 });
    const asserted = answer.links.filter((l) => l.source === "asserted-link");
    assert.deepEqual(asserted.map((l) => [l.artifact.label, l.kind]), [["[Gb2]", "recorded"]]);
  });

  it("answers a line in no linked thing with no asserted link", () => {
    const answer = traceBackward({ repo: fixture.dir, path: "sim/grasp.py", line: 4 });
    assert.deepEqual(answer.links.filter((l) => l.source === "asserted-link"), []);
  });

  it("lists, from a criterion, the thing linked to it, by its span", () => {
    const answer = traceForward({ repo: fixture.dir, reference: "[Gc3]" });
    const spans = answer.positions.filter((p) => p.link.source === "asserted-link").map((p) => [p.position.path, p.position.start, p.position.end]);
    assert.deepEqual(spans, [["sim/grasp.py", 5, 6]]);
  });
});

describe("[EaR], [5jT]: each asserted link is dated by its own lines in the links file", () => {
  const ONE = ["# Grasp", "", "**ID:** [Ga1]", "", "## Acceptance criteria", "", "1. [Gb2] A trial ends in success or one failure reason.", ""].join("\n");
  const TWO = `${ONE}2. [Gc3] Success means the item rests in the bin.\n`;
  const links = (): string => readFileSync(join(fixture.dir, "symbols/links/sim/grasp.py.json"), "utf8");
  const asserted = (line: number): [string, string, boolean][] =>
    traceBackward({ repo: fixture.dir, path: "sim/grasp.py", line }).links
      .filter((l) => l.source === "asserted-link")
      .map((l) => [l.artifact.id ?? "", l.state, l.linked === null]);

  before(() => {
    fixture = fixtureRepository();
    fixture.commit("The grasp spec and bench", { "docs/specs/grasp.md": ONE, "sim/grasp.py": CODE });
    link(fixture.dir, "sim/grasp.py", "Bench.run_trial", ["Gb2"], "2026-09-24");
    fixture.commit("Links for the bench", { "symbols/links/sim/grasp.py.json": links() });
  });
  after(() => { fixture.remove(); });

  it("finds a link added to a thing already linked current, not made before its criterion existed", () => {
    fixture.commit("A second criterion", { "docs/specs/grasp.md": TWO });
    link(fixture.dir, "sim/grasp.py", "Bench.run_trial", ["Gc3"], "2026-09-25");
    fixture.commit("The bench implements it too", { "symbols/links/sim/grasp.py.json": links() });
    assert.deepEqual(asserted(3), [["Gb2", "current", false], ["Gc3", "current", false]]);
  });

  it("finds a link confirmed after its criterion changed current", () => {
    fixture.commit("The first criterion says more", { "docs/specs/grasp.md": TWO.replace("one failure reason.", "one failure reason, named.") });
    assert.deepEqual(asserted(3).find(([id]) => id === "Gb2"), ["Gb2", "suspect", false], "until it is confirmed, the change leaves it suspect");
    link(fixture.dir, "sim/grasp.py", "Bench.run_trial", ["Gb2"], "2026-09-26");
    fixture.commit("Confirmed", { "symbols/links/sim/grasp.py.json": links() });
    assert.deepEqual(asserted(3).find(([id]) => id === "Gb2"), ["Gb2", "current", false]);
  });
});
