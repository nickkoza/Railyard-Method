// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Answering from the symbols file ([BKY]'s data half and
// the failure behavior of symbols files): a position is
// answered from a symbols directory rather than by reading the repository
// again, and the answer says so and names the version it read. Tier 2: a
// fixture repository is indexed with real git, and then answered from without
// it.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexCommit, lookUp, TraceRefusal } from "./index.ts";
import type { SymbolsAnswer } from "./index.ts";
import { widgetRepository } from "./testing/fixture.ts";
import type { Widget } from "./testing/fixture.ts";

const BUILD = "e".repeat(64);
const OTHER_BUILD = "f".repeat(64);

let w: Widget;
let dir: string;

function labels(answer: SymbolsAnswer, source: string): string[] {
  return answer.positions.flatMap((p) => p.links).filter((l) => l.source === source).map((l) => l.artifact.label).sort();
}

describe("railyard-trace backward, from a symbols file", () => {
  before(() => {
    w = widgetRepository();
    dir = mkdtempSync(join(tmpdir(), "looked-up-"));
    indexCommit({ repo: w.fixture.dir, at: w.plain.sha, symbols: dir, builds: [BUILD] });
    indexCommit({ repo: w.fixture.dir, at: w.stops.sha, symbols: dir, builds: [OTHER_BUILD] });
  });
  after(() => {
    w.fixture.remove();
    rmSync(dir, { recursive: true, force: true });
  });

  it("answers the position from the symbols file, says so, and names the version it read", () => {
    const answer = lookUp({ symbols: dir, build: OTHER_BUILD, path: "src/widget/spin.ts", line: 6 });
    assert.equal(answer.from, "symbols");
    assert.equal(answer.symbols, dir);
    assert.equal(answer.version.commit, w.stops.sha);
    assert.deepEqual(answer.version.builds, [OTHER_BUILD]);
    assert.deepEqual(answer.position, { path: "src/widget/spin.ts", line: 6, column: null });
    assert.equal(answer.traced, true);
    assert.deepEqual(labels(answer, "code-citation"), ["ADR-002", "`widget` criterion 1"]);
    assert.deepEqual(labels(answer, "architecture-source-path"), ["CALM node `widget`"]);
    assert.ok(answer.positions.every((p) => p.start.line <= 6 && p.end.line >= 6), JSON.stringify(answer.positions));
  });

  it("answers the build it is given, and never a link from another version", () => {
    const first = lookUp({ symbols: dir, build: BUILD, path: "src/widget/core/stop.test.ts", line: 1 });
    const second = lookUp({ symbols: dir, build: OTHER_BUILD, path: "src/widget/core/stop.test.ts", line: 1 });
    assert.equal(first.version.commit, w.plain.sha);
    assert.equal(second.version.commit, w.stops.sha);
    const state = (answer: SymbolsAnswer): string[] =>
      [...new Set(answer.positions.flatMap((p) => p.links).filter((l) => l.artifact.label === "`widget` criterion 2").map((l) => l.state))];
    assert.deepEqual(state(first), ["current"]);
    assert.deepEqual(state(second), ["suspect"]);
  });

  it("answers the newest version when no build is given", () => {
    assert.equal(lookUp({ symbols: dir, path: "src/widget/spin.ts", line: 6 }).version.commit, w.stops.sha);
  });

  it("answers at a column, and says untraced where the position traces to nothing", () => {
    const column = lookUp({ symbols: dir, build: OTHER_BUILD, path: "src/widget/spin.ts", line: 6, column: 3 });
    assert.equal(column.position?.column, 3);
    assert.equal(column.traced, true);
    const plain = lookUp({ symbols: dir, build: OTHER_BUILD, path: "other/plain.txt", line: 1 });
    assert.equal(plain.traced, false);
    assert.deepEqual(plain.positions, []);
    const past = lookUp({ symbols: dir, build: OTHER_BUILD, path: "src/widget/spin.ts", line: 99 });
    assert.equal(past.traced, false);
  });

  it("refuses a build the directory does not carry, naming it, and a symbols directory that is not there", () => {
    const unknown = "9".repeat(64);
    assert.throws(() => lookUp({ symbols: dir, build: unknown, path: "src/widget/spin.ts", line: 6 }), (e: unknown) => e instanceof TraceRefusal && e.message.includes(unknown));
    assert.throws(() => lookUp({ symbols: join(dir, "nowhere"), path: "src/widget/spin.ts", line: 6 }), (e: unknown) => e instanceof TraceRefusal && e.message.includes("nowhere"));
  });
});

// [BKY].
describe("railyard-trace backward, from a position in what was built", () => {
  let widget: Widget;
  let symbols: string;
  let tree: string;

  /** A built file, its map, and the source tree the map's sources are relative to: <tree>/dist/app.js beside <tree>/src. */
  before(() => {
    widget = widgetRepository();
    symbols = mkdtempSync(join(tmpdir(), "built-symbols-"));
    indexCommit({ repo: widget.fixture.dir, at: widget.stops.sha, symbols, builds: [BUILD] });
    tree = mkdtempSync(join(tmpdir(), "built-"));
    mkdirSync(join(tree, "dist"), { recursive: true });
    // One segment: generated line 1, column 1, to source line 6, column 1 of the widget's spin.ts.
    writeFileSync(join(tree, "dist", "app.js.map"), JSON.stringify({ version: 3, file: "app.js", sources: ["../src/widget/spin.ts"], names: [], mappings: "AAKA" }));
    writeFileSync(join(tree, "dist", "app.js"), "const turns=3;\n//# sourceMappingURL=app.js.map\n");
    writeFileSync(join(tree, "dist", "plain.js"), "const nothing=1;\n");
  });
  after(() => {
    widget.fixture.remove();
    for (const dir of [symbols, tree]) rmSync(dir, { recursive: true, force: true });
  });

  it("maps the built position to its source through the map, and from there to the artifacts", () => {
    const answer = lookUp({ symbols, build: BUILD, path: "app.js", line: 1, column: 1, built: join(tree, "dist"), root: tree });
    assert.ok(answer.mapped !== null, JSON.stringify(answer));
    assert.ok(answer.mapped.through.endsWith("app.js.map"), answer.mapped.through);
    assert.deepEqual(answer.mapped.built, { path: "app.js", line: 1, column: 1 });
    assert.deepEqual(answer.mapped.to, { path: "src/widget/spin.ts", line: 6, column: 1 });
    assert.deepEqual(answer.position, { path: "src/widget/spin.ts", line: 6, column: 1 });
    assert.equal(answer.traced, true);
    assert.deepEqual(labels(answer, "code-citation"), ["ADR-002", "`widget` criterion 1"]);
  });

  it("traces code with no source map at its own position", () => {
    const answer = lookUp({ symbols, build: BUILD, path: "plain.js", line: 1, column: 1, built: join(tree, "dist"), root: tree });
    assert.equal(answer.mapped, null);
    assert.deepEqual(answer.position, { path: "plain.js", line: 1, column: 1 });
    assert.equal(answer.traced, false);
  });

  it("says a source that lies outside the root, and a built file that is not there", () => {
    const outside = lookUp({ symbols, build: BUILD, path: "app.js", line: 1, column: 1, built: join(tree, "dist"), root: join(tree, "dist") });
    assert.ok(outside.mapped !== null);
    assert.equal(outside.mapped.to, null);
    assert.match(outside.mapped.why ?? "", /outside/);
    assert.equal(outside.position, null);
    assert.equal(outside.traced, false);
    assert.throws(
      () => lookUp({ symbols, build: BUILD, path: "nowhere.js", line: 1, built: join(tree, "dist"), root: tree }),
      (e: unknown) => e instanceof TraceRefusal && e.message.includes("nowhere.js"),
    );
  });

  it("says where the map itself gives no source position for the built position", () => {
    const answer = lookUp({ symbols, build: BUILD, path: "app.js", line: 9, column: 1, built: join(tree, "dist"), root: tree });
    assert.ok(answer.mapped !== null);
    assert.equal(answer.mapped.to, null);
    assert.match(answer.mapped.why ?? "", /maps nothing/);
    assert.equal(answer.traced, false);
  });
});

// [LRA]: a reader given no root of its own resolves against the one the directory records.
describe("railyard-trace backward, with no root given", () => {
  it("resolves a mapped source against the root the symbols directory records", () => {
    const w2 = widgetRepository();
    const inside = join(w2.fixture.dir, "symbols");
    try {
      indexCommit({ repo: w2.fixture.dir, at: w2.stops.sha, symbols: inside, builds: [BUILD] });
      const built = join(w2.fixture.dir, "dist");
      mkdirSync(built, { recursive: true });
      writeFileSync(join(built, "app.js.map"), JSON.stringify({ version: 3, file: "app.js", sources: ["../src/widget/spin.ts"], names: [], mappings: "AAKA" }));
      writeFileSync(join(built, "app.js"), "const turns=3;\n//# sourceMappingURL=app.js.map\n");
      const answer = lookUp({ symbols: inside, build: BUILD, path: "app.js", line: 1, column: 1, built });
      assert.deepEqual(answer.mapped?.to, { path: "src/widget/spin.ts", line: 6, column: 1 });
      assert.equal(answer.traced, true);
    } finally {
      w2.fixture.remove();
    }
  });
});

describe("railyard-trace backward, where the repository is gone", () => {
  it("answers from the symbols file alone, with no repository to read", () => {
    const gone = widgetRepository();
    const symbols = mkdtempSync(join(tmpdir(), "no-repo-"));
    try {
      indexCommit({ repo: gone.fixture.dir, at: gone.stops.sha, symbols, builds: [BUILD] });
      gone.fixture.remove();
      const answer = lookUp({ symbols, build: BUILD, path: "src/widget/spin.ts", line: 6 });
      assert.equal(answer.version.commit, gone.stops.sha);
      assert.deepEqual(labels(answer, "commit-message"), ["ADR-001", "`widget` criterion 1", "`widget` criterion 2"]);
    } finally {
      gone.fixture.remove();
      rmSync(symbols, { recursive: true, force: true });
    }
  });
});
