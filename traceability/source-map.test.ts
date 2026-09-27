// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Source maps ([BKY]): a position in
// what was built maps to its source position through the map the build already
// makes. Only the standard is read. Tier 1: maps as text, no build and no
// files.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readSourceMap, TraceRefusal } from "./index.ts";

/**
 * Generated line 1 has two segments: column 1 to source line 1 column 1, and column 5 to source line 1 column 7.
 * Generated line 2 has one: column 1 to source line 2 column 1. Line 3 has none.
 */
const MAPPINGS = "AAAA,IAAM;AACN;";

function map(fields: Readonly<Record<string, unknown>> = {}): string {
  return JSON.stringify({ version: 3, file: "app.js", sources: ["../src/app.ts"], names: [], mappings: MAPPINGS, ...fields });
}

describe("a source map", () => {
  it("gives the source position a generated position maps to, by lines and columns that start at one", () => {
    const read = readSourceMap("app.js.map", map());
    assert.deepEqual(read.at(1, 1), { source: "../src/app.ts", line: 1, column: 1 });
    assert.deepEqual(read.at(1, 5), { source: "../src/app.ts", line: 1, column: 7 });
    assert.deepEqual(read.at(2, 1), { source: "../src/app.ts", line: 2, column: 1 });
  });

  it("takes the mapping at or before the column asked about, and gives none where the line has none", () => {
    const read = readSourceMap("app.js.map", map());
    assert.deepEqual(read.at(1, 3), { source: "../src/app.ts", line: 1, column: 1 });
    assert.deepEqual(read.at(1, 40), { source: "../src/app.ts", line: 1, column: 7 });
    assert.equal(read.at(3, 1), null);
    assert.equal(read.at(9, 1), null);
  });

  it("puts sourceRoot before each source, as the standard has it", () => {
    const read = readSourceMap("app.js.map", map({ sourceRoot: "https://example.test/src/" }));
    assert.equal(read.at(1, 1)?.source, "https://example.test/src/../src/app.ts");
    assert.equal(readSourceMap("app.js.map", map({ sourceRoot: "dist" })).at(1, 1)?.source, "dist/../src/app.ts");
  });

  it("refuses an index map in words, rather than half-reading it", () => {
    const inner: unknown = JSON.parse(map());
    const sections = JSON.stringify({ version: 3, file: "app.js", sections: [{ offset: { line: 0, column: 0 }, map: inner }] });
    assert.throws(() => readSourceMap("app.js.map", sections), (e: unknown) => e instanceof TraceRefusal && e.message.includes("app.js.map") && /index map|sections/i.test(e.message));
  });

  it("refuses what is not a source map, naming the file and why", () => {
    assert.throws(() => readSourceMap("app.js.map", "{ not json"), (e: unknown) => e instanceof TraceRefusal && e.message.includes("app.js.map"));
    assert.throws(() => readSourceMap("app.js.map", JSON.stringify({ version: 3, sources: [] })), (e: unknown) => e instanceof TraceRefusal && e.message.includes("app.js.map"));
    assert.throws(() => readSourceMap("app.js.map", map({ version: 9 })), (e: unknown) => e instanceof TraceRefusal && e.message.includes("9"));
  });

  it("says which source a segment names, even where the map lists several", () => {
    const two = map({ sources: ["../src/a.ts", "../src/b.ts"], mappings: "AAAA;ACAA" });
    const read = readSourceMap("app.js.map", two);
    assert.equal(read.at(1, 1)?.source, "../src/a.ts");
    assert.equal(read.at(2, 1)?.source, "../src/b.ts");
  });

  it("gives none for a segment that names no source, which is a generated position with no origin", () => {
    assert.equal(readSourceMap("app.js.map", map({ mappings: "A" })).at(1, 1), null);
  });
});
