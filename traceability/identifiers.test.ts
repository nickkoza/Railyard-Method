// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [EaR], [pY5] — tier 2, real git: a query takes an artifact as it is cited, by its own ID, and names
// each artifact by its ID and its file, never by a form a reader would copy and the check reports.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { traceForward } from "./index.ts";
import { fixtureRepository } from "./testing/fixture.ts";
import type { Fixture } from "./testing/fixture.ts";

const CLI = join(import.meta.dirname, "../bin/railyard-trace.ts");

const SPEC = [
  "# Grasp", "", "**ID:** [Ga1]", "",
  "## Acceptance criteria", "",
  "1. [Gb2] A trial ends in success or one failure reason.",
  "2. [Gc3] Success means the item rests in the bin.", "",
  "## Decisions", "",
  "1. [Gd4] **The bin is 10 cm deep.** Forced: the stand-in's mesh.", "",
].join("\n");
const PRINCIPLES = ["# Principles", "", "**ID:** [Pa1]", "", "1. [Pb2] Nothing moves unwatched.", ""].join("\n");
const MODEL = JSON.stringify({ metadata: { id: "Ma1" }, nodes: [{ "unique-id": "sim", "node-type": "service", name: "Sim", description: "The sim.", "source-path": "sim" }], relationships: [] }, null, 2);
const CODE = [
  "# Watched, as [Pb2] asks; deep enough for [Gd4].",
  "def run_trial(seed):  # [Gc3]",
  "    return 'success'",
  "",
].join("\n");

let fixture: Fixture;

function trace(...args: string[]): string {
  const ran = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
  return ran.stdout;
}

describe("[EaR]: a query takes an artifact by its own ID, and names it by that ID and its file", () => {
  before(() => {
    fixture = fixtureRepository();
    fixture.commit("The grasp spec, the principles, the model and the bench", {
      "docs/specs/grasp.md": SPEC,
      "docs/principles/principles.md": PRINCIPLES,
      "docs/architecture/sim.json": MODEL,
      "sim/grasp.py": CODE,
    });
  });
  after(() => { fixture.remove(); });

  const cited = (reference: string): string[] =>
    traceForward({ repo: fixture.dir, reference }).positions.map((p) => `${p.link.source} ${p.position.path}`);

  it("takes a criterion as [ID], as a bare ID, and as its file and ID, alike", () => {
    const answers = ["[Gc3]", "Gc3", "docs/specs/grasp.md#Gc3"].map((r) => traceForward({ repo: fixture.dir, reference: r }));
    for (const a of answers) {
      assert.equal(a.artifact.id, "Gc3");
      assert.equal(a.artifact.path, "docs/specs/grasp.md");
      assert.ok(a.positions.some((p) => p.link.source === "code-citation" && p.position.path === "sim/grasp.py"), JSON.stringify(a.positions));
    }
  });

  it("takes a decision kept in its spec by its own ID, and reads that decision's text rather than a criterion's", () => {
    const a = traceForward({ repo: fixture.dir, reference: "Gd4" });
    assert.equal(a.artifact.id, "Gd4");
    assert.notEqual(a.artifact.anchor, "criterion-1");
    assert.ok(a.current !== null);
    assert.ok(cited("Gd4").includes("code-citation sim/grasp.py"));
  });

  it("takes the principles and a principle by their own IDs", () => {
    assert.ok(cited("Pb2").includes("code-citation sim/grasp.py"));
    assert.equal(traceForward({ repo: fixture.dir, reference: "Pa1" }).artifact.path, "docs/principles/principles.md");
  });

  it("takes an architecture model by its metadata.id, and lists what its nodes own", () => {
    const a = traceForward({ repo: fixture.dir, reference: "Ma1" });
    assert.equal(a.artifact.path, "docs/architecture/sim.json");
    assert.ok(cited("Ma1").includes("architecture-source-path sim/grasp.py"), JSON.stringify(cited("Ma1")));
  });

  it("prints each artifact as [ID] (its file), and no retired form", () => {
    const out = [
      trace("backward", "sim/grasp.py:3", "--repo", fixture.dir),
      trace("forward", "Gc3", "--repo", fixture.dir),
    ].join("\n");
    assert.match(out, /\[Gc3\] \(docs\/specs\/grasp\.md\)/);
    assert.doesNotMatch(out, /`grasp` criterion|#criterion-|criterion \d/);
  });

  it("[QBm]: takes a query as it is written, a position as backward and an ID as forward, with no command word", () => {
    assert.equal(trace("sim/grasp.py:2", "--repo", fixture.dir), trace("backward", "sim/grasp.py:2", "--repo", fixture.dir));
    for (const id of ["Gc3", "[Gc3]"]) assert.equal(trace(id, "--repo", fixture.dir), trace("forward", "Gc3", "--repo", fixture.dir), id);
  });

  it("[QBm]: refuses an item by its place where it carries an ID, naming the ID to give instead", () => {
    const ran = spawnSync(process.execPath, [CLI, "forward", "docs/specs/grasp.md#criterion-2", "--repo", fixture.dir], { encoding: "utf8" });
    assert.equal(ran.status, 1, ran.stdout);
    assert.match(ran.stderr, /\[Gc3\]/);
    assert.match(ran.stderr, /forward Gc3/);
    assert.doesNotMatch(ran.stderr, /at \w+ \(/, "in words, never a raw error");
  });

  it("[QBm]: says a repository with no commit has none, in those words", () => {
    const empty = fixtureRepository();
    try {
      for (const args of [["Gc3"], ["sim/grasp.py:1"]]) {
        const ran = spawnSync(process.execPath, [CLI, ...args, "--repo", empty.dir], { encoding: "utf8" });
        assert.equal(ran.status, 1, ran.stdout);
        assert.match(ran.stderr, /has no commits yet/, ran.stderr);
        assert.match(ran.stderr, /commit/);
      }
    } finally {
      empty.remove();
    }
  });

  it("names no retired form in its usage", () => {
    const usage = trace("--help");
    assert.doesNotMatch(usage, /ADR-\d|criterion \d|#criterion-/);
    assert.match(usage, /#Ay4|\[Ay4\]/);
  });
});
