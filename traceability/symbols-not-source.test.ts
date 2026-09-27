// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// A symbols directory checked in beside the source is not source, and no query that
// walks source walks it ([QBm]). The rule holds
// of the ground, not of one caller: a query that walks the tree knows it whichever way it
// came in, so neither forward nor traceAll has to be told. Tier 2: real git, in a fixture
// repository carrying a real symbols directory, as this repository carries one.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexCommit, traceAll, traceForward } from "./index.ts";
import { widgetRepository } from "./testing/fixture.ts";
import type { Widget } from "./testing/fixture.ts";

let w: Widget;
/** The commit at which the repository carries its own symbols directory. */
let indexedAt: string;

/** Every file under `dir`, as paths relative to it joined onto `prefix`, with its text. */
function filesUnder(dir: string, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const at = `${prefix}/${entry}`;
    if (statSync(full).isDirectory()) Object.assign(out, filesUnder(full, at));
    else out[at] = readFileSync(full, "utf8");
  }
  return out;
}

describe("a symbols directory is not source", () => {
  before(() => {
    w = widgetRepository();
    const built = mkdtempSync(join(tmpdir(), "not-source-"));
    try {
      indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: built });
      const files = filesUnder(built, "symbols");
      // The reproduction is only real if the symbols carry citations of their own: they are
      // what a source-walking query would otherwise find and place.
      assert.ok(Object.keys(files).length >= 2, `symbols directory has ${String(Object.keys(files).length)} files`);
      assert.ok(Object.values(files).some((t) => t.includes("ADR-")), "the symbols carry citations");
      indexedAt = w.fixture.commit("index this repository's own symbols", files).sha;
    } finally {
      rmSync(built, { recursive: true, force: true });
    }
  });
  after(() => {
    w.fixture.remove();
  });

  it("gives a forward query no position inside it, though it cites the artifact on nearly every line", () => {
    const answer = traceForward({ repo: w.fixture.dir, at: indexedAt, reference: "ADR-002" });
    const inside = answer.positions.filter((p) => p.position.path.startsWith("symbols/"));
    assert.deepEqual(inside, [], `forward placed ${String(inside.length)} positions inside the symbols directory`);
  });

  it("gives traceAll no entry inside it, without being told to exclude it", () => {
    const all = traceAll({ repo: w.fixture.dir, at: indexedAt });
    const inside = all.entries.filter((e) => e.path.startsWith("symbols/"));
    assert.deepEqual(inside.map((e) => `${e.path}:${String(e.line)}`).slice(0, 5), [], `traceAll walked ${String(inside.length)} lines of the symbols directory`);
  });

  it("still traces the source beside it, so the exclusion removes the record and nothing else", () => {
    const answer = traceForward({ repo: w.fixture.dir, at: indexedAt, reference: "ADR-002" });
    assert.ok(
      answer.positions.some((p) => p.position.path === "src/widget/spin.ts"),
      `the source is still traced: ${JSON.stringify(answer.positions.map((p) => p.position.path))}`,
    );
  });
});
