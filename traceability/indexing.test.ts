// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Producing a symbols file ([LRA], [63N], [LPv]): index writes a version of a symbols directory from exactly what the
// backward query already knows, and adds no evidence of its own. Tier 2: real
// git, in a fixture repository.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { indexCommit, readSymbols, traceBackward } from "./index.ts";
import type { SymbolLink, SymbolPosition } from "./index.ts";
import { widgetRepository } from "./testing/fixture.ts";
import type { Widget } from "./testing/fixture.ts";

const BUILD = "c".repeat(64);
const OTHER_BUILD = "d".repeat(64);

let w: Widget;

function where(): string {
  return mkdtempSync(join(tmpdir(), "indexed-"));
}

/** A link as a line of text, so that what was indexed and what the query answers can be compared whole. */
function said(link: SymbolLink): string {
  return [link.kind, link.source, link.artifact.label, link.state, link.linked?.commit ?? "-", link.madeBy.commit, link.madeBy.path ?? "-", link.madeBy.line ?? "-"].join(" ");
}

function linksAt(positions: readonly SymbolPosition[]): string[] {
  return positions.flatMap((p) => p.links.map(said)).sort();
}

describe("railyard-trace index", () => {
  before(() => {
    w = widgetRepository();
  });
  after(() => {
    w.fixture.remove();
  });

  it("records for a position exactly what the backward query answers for it, and no more", () => {
    const dir = where();
    try {
      const done = indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: dir, builds: [BUILD] });
      assert.equal(done.at.commit, w.stops.sha);
      assert.equal(done.written.written, true);
      const version = readSymbols(dir).version(BUILD);
      assert.equal(version.commit, w.stops.sha);
      for (const [path, line] of [["src/widget/spin.ts", 6], ["src/widget/spin.ts", 12], ["src/widget/core/stop.test.ts", 1], ["src/a/twin.test.ts", 1]] as const) {
        const query = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path, line });
        assert.deepEqual(linksAt(version.at(path, line, null)), query.links.map(said).sort(), `${path}:${String(line)}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says of each link how it is known, as the query does: only a structural record is recorded, and nothing is tested or confirmed", () => {
    const dir = where();
    try {
      indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: dir, builds: [BUILD] });
      const version = readSymbols(dir).version(BUILD);
      const links = version.at("src/widget/spin.ts", 6, null).flatMap((p) => p.links);
      assert.ok(links.length > 0);
      for (const link of links) {
        assert.equal(link.kind, link.source === "architecture-source-path" ? "recorded" : "cited", said(link));
      }
      assert.ok(links.some((l) => l.source === "architecture-source-path" && l.artifact.label === "CALM node `widget`"));
      assert.ok(links.some((l) => l.source === "code-citation" && l.artifact.label === "ADR-002"));
      assert.ok(links.some((l) => l.state === "suspect" && l.artifact.label === "`widget` criterion 2"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records no position that traces to nothing, and none in the artifacts' own documents", () => {
    const dir = where();
    try {
      indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: dir, builds: [BUILD] });
      const version = readSymbols(dir).version(BUILD);
      assert.deepEqual(version.at("other/plain.txt", 1, null), []);
      assert.deepEqual(version.at("docs/specs/widget.md", 5, null), []);
      assert.deepEqual(version.at("docs/waymarks/002-second.md", 1, null), []);
      assert.deepEqual(version.at("docs/architecture/model.json", 4, null), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("makes one position of consecutive lines with the same links", () => {
    const dir = where();
    try {
      const done = indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: dir, builds: [BUILD] });
      const version = readSymbols(dir).version(BUILD);
      // spin.ts is 13 lines in five runs: 1-4, then 5-6 citing the second ADR, 7-10, 11-12 citing the ninth, and 13.
      const spin = version.at("src/widget/spin.ts", 1, null).concat(
        [6, 7, 11, 13].flatMap((line) => version.at("src/widget/spin.ts", line, null)));
      assert.deepEqual(spin.map((p) => [p.start.line, p.end.line]), [[1, 4], [5, 6], [7, 10], [11, 12], [13, 13]]);
      assert.equal(spin[0]?.start.column, 1);
      // A one-line file is one position, covering the whole of its line.
      const line = "export const rate = 3;";
      assert.deepEqual(version.at("src/widget/rate.ts", 1, null).map((p) => [p.start, p.end]), [[{ line: 1, column: 1 }, { line: 1, column: line.length + 1 }]]);
      assert.ok(done.written.positions < done.written.links, `${String(done.written.positions)} positions, ${String(done.written.links)} links`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("names a source it could not read, and still writes the version", () => {
    const dir = where();
    try {
      const done = indexCommit({ repo: w.fixture.dir, symbols: dir, builds: [BUILD] });
      assert.equal(done.at.commit, w.broken.sha);
      assert.ok(done.unreadable.some((u) => u.path === "docs/architecture/broken.json"), JSON.stringify(done.unreadable));
      assert.equal(done.written.written, true);
      assert.ok(readSymbols(dir).version(BUILD).at("src/widget/spin.ts", 6, null).length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // [LRA]: the directory names the tree it describes, by where it sits in it.
  it("records the root of the tree, from where the symbols directory sits against the repository", () => {
    const inside = join(w.fixture.dir, "symbols");
    const outside = where();
    try {
      indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: inside, builds: [BUILD] });
      assert.equal(readSymbols(inside).root, "..");
      indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: outside, builds: [BUILD] });
      assert.equal(resolve(outside, readSymbols(outside).root), resolve(w.fixture.dir));
    } finally {
      for (const dir of [inside, outside]) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes a second version that records only the files that changed, and leaves the first answering as it did", () => {
    const dir = where();
    try {
      indexCommit({ repo: w.fixture.dir, at: w.plain.sha, symbols: dir, builds: [BUILD] });
      const second = indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: dir, builds: [OTHER_BUILD] });
      assert.equal(second.written.written, true);
      assert.equal(second.written.base, w.plain.sha);
      const symbols = readSymbols(dir);
      assert.equal(symbols.versions.length, 2);
      // Criterion 2's text changed at that commit, so every link to it, from the Tests row and from the commit's
      // message alike, is suspect at the second version and current at the first.
      const states = (build: string): string[] => {
        const links = symbols.version(build).at("src/widget/core/stop.test.ts", 1, null).flatMap((p) => p.links).filter((l) => l.artifact.label === "`widget` criterion 2");
        assert.ok(links.length > 0, build);
        return [...new Set(links.map((l) => l.state))];
      };
      assert.deepEqual(states(BUILD), ["current"]);
      assert.deepEqual(states(OTHER_BUILD), ["suspect"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // [QBm]: a symbols directory checked into the repository it describes is the index, not source.
  // Indexing it would change the tree that is indexed at every run, and never converge.
  it("never indexes the symbols directory's own files, so a repository that carries one converges", () => {
    const own = widgetRepository();
    const inside = join(own.fixture.dir, "symbols");
    try {
      const first = indexCommit({ repo: own.fixture.dir, symbols: inside, builds: [BUILD] });
      assert.equal(first.written.written, true);
      own.fixture.git("add", "symbols");
      // A real commit cites its artifacts, so every line it adds would carry that citation's links.
      const carried = own.fixture.commit("ADR-001: check the symbols in", {});
      const second = indexCommit({ repo: own.fixture.dir, at: carried.sha, symbols: inside, builds: [OTHER_BUILD] });
      assert.equal(second.files, first.files, "the symbols carry no positions of their own");
      assert.equal(second.written.written, false, "a commit that only adds the symbols changes nothing that is indexed");
      assert.equal(readSymbols(inside).versions.length, 1);
    } finally {
      own.fixture.remove();
    }
  });

  it("writes no second version when the commit changed nothing that is indexed, and the build joins the version that is there", () => {
    const dir = where();
    try {
      indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: dir, builds: [BUILD] });
      const again = indexCommit({ repo: w.fixture.dir, at: w.broken.sha, symbols: dir, builds: [OTHER_BUILD] });
      assert.equal(again.written.written, false);
      assert.deepEqual(again.written.builds, [BUILD, OTHER_BUILD]);
      const symbols = readSymbols(dir);
      assert.equal(symbols.versions.length, 1);
      assert.equal(symbols.version(OTHER_BUILD).commit, w.stops.sha);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
