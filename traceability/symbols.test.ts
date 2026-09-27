// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The symbols file itself ([LRA], [LdF], [QBm] and the failure
// behavior of symbols files): a shared index, one delta
// file per version, and positions read back with no repository. Tier 1: files
// in a temporary directory, no git.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FORMAT, FORMAT_VERSION, readSymbols, TraceRefusal, writeVersion } from "./index.ts";
import type { SymbolLink, SymbolPosition } from "./index.ts";

const SHA = "1".repeat(40);
const LATER = "2".repeat(40);
const BUILD = "a".repeat(64);
const OTHER_BUILD = "b".repeat(64);

function link(label: string, source = "code-citation"): SymbolLink {
  return {
    artifact: { kind: "adr", path: "docs/waymarks/171-a.md", anchor: null, label },
    kind: "cited",
    source,
    state: "current",
    linked: { commit: "3".repeat(40), date: "2026-09-15T10:00:00+00:00" },
    current: { commit: "3".repeat(40), date: "2026-09-15T10:00:00+00:00" },
    madeBy: { commit: "4".repeat(40), path: "src/a.ts", line: 3 },
  };
}

function position(path: string, start: [number, number], end: [number, number], links: readonly SymbolLink[]): SymbolPosition {
  return { path, start: { line: start[0], column: start[1] }, end: { line: end[0], column: end[1] }, links };
}

function where(): string {
  return mkdtempSync(join(tmpdir(), "symbols-"));
}

/** A JSON document read back as a plain record, so a test can add a field to it. */
function parsedJson(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return { ...value };
}

/** One field of a document read back, without assuming its shape. */
function field(document: unknown, key: string): unknown {
  assert.ok(document !== null && typeof document === "object", `${key} of ${JSON.stringify(document)}`);
  const record: Record<string, unknown> = { ...document };
  return record[key];
}

const ONE = position("src/a.ts", [1, 1], [3, 21], [link("ADR-171")]);
const TWO = position("src/b.ts", [7, 5], [7, 9], [link("ADR-148"), link("ADR-155", "commit-message")]);

describe("a symbols directory", () => {
  it("writes an index and one file per version, in the published format", () => {
    const dir = where();
    try {
      const written = writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [BUILD], "..");
      assert.equal(written.written, true);
      const index: unknown = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
      assert.ok(index !== null && typeof index === "object");
      assert.deepEqual(Object.fromEntries(Object.entries(index).filter(([k]) => k === "format" || k === "formatVersion")), {
        format: FORMAT,
        formatVersion: FORMAT_VERSION,
      });
      const version: unknown = JSON.parse(readFileSync(join(dir, "versions", `${SHA}.json`), "utf8"));
      assert.ok(version !== null && typeof version === "object" && "files" in version);
      // Each distinct link is written once, in the index's shared table, and a position names its links by index (FORMAT.md's shared `links` table).
      const links = field(index, "links");
      assert.ok(Array.isArray(links) && links.length > 0, JSON.stringify(links));
      const byFile = field(version, "files");
      assert.ok(byFile !== null && typeof byFile === "object", JSON.stringify(byFile));
      const rows: unknown = Object.values({ ...byFile })[0];
      assert.ok(Array.isArray(rows), JSON.stringify(rows));
      const named = field(rows[0], "links");
      assert.ok(Array.isArray(named) && named.length > 0 && named.every((n) => typeof n === "number"), JSON.stringify(named));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads every position back, whole, with its links", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [BUILD], "..");
      const symbols = readSymbols(dir);
      const version = symbols.version(BUILD);
      assert.equal(version.commit, SHA);
      assert.deepEqual(version.builds, [BUILD]);
      assert.deepEqual(version.at("src/a.ts", 2, null), [ONE]);
      assert.deepEqual(version.at("src/b.ts", 7, 6), [TWO]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says nothing of a position it records nothing for, and guesses nothing", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [], "..");
      const version = readSymbols(dir).version(null);
      assert.deepEqual(version.at("src/a.ts", 9, null), []);
      assert.deepEqual(version.at("src/nothing.ts", 1, null), []);
      assert.deepEqual(version.at("src/b.ts", 7, 2), []);
      assert.deepEqual(version.at("src/b.ts", 7, 9), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("covers a range whose start is its end at that one position, as an empty line is covered", () => {
    const dir = where();
    try {
      const empty = position("src/c.ts", [4, 1], [4, 1], [link("ADR-171")]);
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [empty], [], "..");
      const version = readSymbols(dir).version(null);
      assert.deepEqual(version.at("src/c.ts", 4, 1), [empty]);
      assert.deepEqual(version.at("src/c.ts", 4, null), [empty]);
      assert.deepEqual(version.at("src/c.ts", 4, 2), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records only the files that changed since the base, and resolves the chain", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [BUILD], "..");
      const changed = position("src/b.ts", [7, 5], [9, 3], [link("ADR-166")]);
      const added = position("src/c.ts", [1, 1], [1, 5], [link("ADR-171")]);
      const second = writeVersion(dir, { commit: LATER, date: "2026-09-15T11:00:00+00:00" }, [ONE, changed, added], [OTHER_BUILD], "..");
      assert.equal(second.written, true);
      const file: unknown = JSON.parse(readFileSync(join(dir, "versions", `${LATER}.json`), "utf8"));
      assert.ok(file !== null && typeof file === "object" && "files" in file && file.files !== null && typeof file.files === "object");
      // Only the two files that changed are restated; src/a.ts comes from the base.
      assert.equal(Object.keys(file.files).length, 2);
      const version = readSymbols(dir).version(OTHER_BUILD);
      assert.equal(version.commit, LATER);
      assert.deepEqual(version.at("src/a.ts", 2, null), [ONE]);
      assert.deepEqual(version.at("src/b.ts", 8, 1), [changed]);
      assert.deepEqual(version.at("src/c.ts", 1, null), [added]);
      // The first version still answers as it did.
      assert.deepEqual(readSymbols(dir).version(BUILD).at("src/b.ts", 7, 6), [TWO]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("drops a file whose positions are gone, and says so in the version", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [BUILD], "..");
      writeVersion(dir, { commit: LATER, date: "2026-09-15T11:00:00+00:00" }, [ONE], [OTHER_BUILD], "..");
      const version = readSymbols(dir).version(OTHER_BUILD);
      assert.deepEqual(version.at("src/b.ts", 7, 6), []);
      assert.deepEqual(version.at("src/a.ts", 2, null), [ONE]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a build joins the newest version and leaves the older one, even when nothing changed", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [BUILD], "..");
      const changed = position("src/b.ts", [7, 5], [9, 3], [link("ADR-166")]);
      writeVersion(dir, { commit: LATER, date: "2026-09-15T11:00:00+00:00" }, [ONE, changed], [OTHER_BUILD], "..");
      // The same positions again, under the build the first version claims: the hash joins the newest version
      // ([LPv]) and must leave the first, or two versions answer for one build
      // ([LRA]).
      const again = writeVersion(dir, { commit: LATER, date: "2026-09-15T11:00:00+00:00" }, [ONE, changed], [BUILD], "..");
      assert.equal(again.written, false, "nothing changed, so no version is written");
      const version = readSymbols(dir).version(BUILD);
      assert.equal(version.commit, LATER, "the newest version answers for the build");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a build hash is answered by the newest version indexed for it, never by two", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [BUILD], "..");
      // The same build indexed again at a later commit whose positions differ: what the desk serves did not change,
      // so its hash is the same, but a spec's rows did, so the links moved. Found live on the owner's machine
      // (2026-09-15): both versions claimed the build, and the reader refused to guess between them.
      const changed = position("src/b.ts", [7, 5], [9, 3], [link("ADR-166")]);
      const second = writeVersion(dir, { commit: LATER, date: "2026-09-15T11:00:00+00:00" }, [ONE, changed], [BUILD], "..");
      assert.equal(second.written, true, "the positions differ, so a version is written");
      const version = readSymbols(dir).version(BUILD);
      assert.equal(version.commit, LATER, "the newest version indexed for the build answers for it");
      assert.deepEqual(version.at("src/b.ts", 8, 1), [changed]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes no version when nothing changed, and joins a new build hash to the version that is there", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [BUILD], "..");
      const again = writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [OTHER_BUILD], "..");
      assert.equal(again.written, false);
      assert.deepEqual(again.builds, [BUILD, OTHER_BUILD]);
      const symbols = readSymbols(dir);
      assert.equal(symbols.versions.length, 1);
      assert.equal(symbols.version(OTHER_BUILD).commit, SHA);
      assert.deepEqual(symbols.version(BUILD).at("src/a.ts", 2, null), [ONE]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // [LdF].
  it("holds a position in a file of any language, naming no language, framework or build tool", () => {
    const dir = where();
    try {
      const python = position("app/views.py", [12, 1], [12, 40], [link("ADR-171")]);
      const go = position("cmd/serve/main.go", [3, 2], [3, 9], [link("ADR-171")]);
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [python, go], [], "..");
      const version = readSymbols(dir).version(null);
      assert.deepEqual(version.at("app/views.py", 12, 3), [python]);
      assert.deepEqual(version.at("cmd/serve/main.go", 3, 2), [go]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // [QBm]: the compatibility rule readers are held to.
  it("ignores a field it does not know, in the index and in a version", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
      for (const path of [join(dir, "index.json"), join(dir, "versions", `${SHA}.json`)]) {
        const document: unknown = JSON.parse(readFileSync(path, "utf8"));
        assert.ok(document !== null && typeof document === "object");
        writeFileSync(path, JSON.stringify({ ...document, somethingLater: { kept: true } }));
      }
      assert.deepEqual(readSymbols(dir).version(BUILD).at("src/a.ts", 2, null), [ONE]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// [LRA]: a directory names the tree its paths are
// relative to, so that a directory read from anywhere describes the same tree.
describe("a symbols directory's root", () => {
  it("records the root of the tree it describes, and reads it back", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
      const index: unknown = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
      assert.equal(field(index, "root"), "..");
      assert.equal(readSymbols(dir).root, "..");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a version whose root would differ from the one the directory records, naming both", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
      assert.throws(
        () => writeVersion(dir, { commit: LATER, date: "2026-09-15T11:00:00+00:00" }, [TWO], [OTHER_BUILD], "../.."),
        (e: unknown) => e instanceof TraceRefusal && e.message.includes("../..") && e.message.includes(".."),
      );
      // Nothing was written for it: the directory still answers as it did.
      assert.equal(readSymbols(dir).versions.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a document of a minor version it does not know, by its version", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
      const file = join(dir, "index.json");
      const document: unknown = JSON.parse(readFileSync(file, "utf8"));
      assert.ok(document !== null && typeof document === "object");
      writeFileSync(file, JSON.stringify({ ...document, formatVersion: "0.2.0" }));
      assert.throws(
        () => readSymbols(dir),
        (e: unknown) => e instanceof TraceRefusal && e.message.includes("0.2.0") && e.message.includes(FORMAT_VERSION),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The failure behavior: a symbols file missing, belonging to another version, or unreadable.
describe("a symbols directory that cannot answer", () => {
  it("says a directory or an index that is missing, naming it", () => {
    const dir = where();
    try {
      assert.throws(() => readSymbols(join(dir, "nowhere")), (e: unknown) => e instanceof TraceRefusal && e.message.includes("nowhere"));
      assert.throws(() => readSymbols(dir), (e: unknown) => e instanceof TraceRefusal && e.message.includes("index.json"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says a build hash it does not carry, naming the hash and the directory, and answers from no other version", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
      const symbols = readSymbols(dir);
      assert.throws(() => symbols.version(OTHER_BUILD), (e: unknown) => e instanceof TraceRefusal && e.message.includes(OTHER_BUILD) && e.message.includes(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("says a file it cannot read, or that is not the format, naming the file and why", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
      const versionFile = join(dir, "versions", `${SHA}.json`);
      writeFileSync(versionFile, "{ not json");
      assert.throws(() => readSymbols(dir).version(BUILD).at("src/a.ts", 2, null), (e: unknown) => e instanceof TraceRefusal && e.message.includes(`${SHA}.json`));
      writeFileSync(versionFile, JSON.stringify({ format: "something-else", formatVersion: FORMAT_VERSION }));
      assert.throws(() => readSymbols(dir).version(BUILD).at("src/a.ts", 2, null), (e: unknown) => e instanceof TraceRefusal && e.message.includes("something-else"));
      writeFileSync(join(dir, "index.json"), JSON.stringify({ format: FORMAT, formatVersion: "9.0.0", files: [], artifacts: [], commits: [], versions: [] }));
      assert.throws(() => readSymbols(dir), (e: unknown) => e instanceof TraceRefusal && e.message.includes("9.0.0"));
      // While the format's major version is zero, its minor version is the compatibility unit (FORMAT.md, Compatibility).
      writeFileSync(join(dir, "index.json"), JSON.stringify({ format: FORMAT, formatVersion: "0.9.0", files: [], artifacts: [], commits: [], versions: [] }));
      assert.throws(() => readSymbols(dir), (e: unknown) => e instanceof TraceRefusal && e.message.includes("0.9.0"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a version whose own commit is not the one the index names for it", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
      const versionFile = join(dir, "versions", `${SHA}.json`);
      const document: unknown = JSON.parse(readFileSync(versionFile, "utf8"));
      assert.ok(document !== null && typeof document === "object");
      writeFileSync(versionFile, JSON.stringify({ ...document, commit: LATER }));
      assert.throws(() => readSymbols(dir).version(BUILD).at("src/a.ts", 2, null), (e: unknown) => e instanceof TraceRefusal && e.message.includes(LATER));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses when two versions carry one build hash, rather than guessing which", () => {
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
      writeVersion(dir, { commit: LATER, date: "2026-09-15T11:00:00+00:00" }, [TWO], [], "..");
      const index: unknown = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
      assert.ok(index !== null && typeof index === "object" && "versions" in index && Array.isArray(index.versions));
      const versions: unknown[] = index.versions.map((v: unknown) => (v !== null && typeof v === "object" ? { ...v, builds: [BUILD] } : v));
      writeFileSync(join(dir, "index.json"), JSON.stringify({ ...index, versions }));
      assert.throws(() => readSymbols(dir).version(BUILD), (e: unknown) => e instanceof TraceRefusal && e.message.includes(BUILD));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("answers from a directory holding no version at all by saying so", () => {
    const dir = where();
    try {
      mkdirSync(join(dir, "versions"), { recursive: true });
      writeFileSync(join(dir, "index.json"), JSON.stringify({ format: FORMAT, formatVersion: FORMAT_VERSION, root: "..", files: [], artifacts: [], commits: [], links: [], versions: [] }));
      const symbols = readSymbols(dir);
      assert.deepEqual(symbols.versions, []);
      assert.throws(() => symbols.version(null), (e: unknown) => e instanceof TraceRefusal && e.message.includes(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// [QBm]: the format is published, versioned and documented.
describe("the published schema", () => {
  it("is versioned with the format, and names every field a version and an index carry", () => {
    const schema: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "symbols.schema.json"), "utf8"));
    assert.equal(FORMAT_VERSION, "0.3.3");
    assert.ok(schema !== null && typeof schema === "object" && "$id" in schema && typeof schema.$id === "string");
    assert.ok(schema.$id.includes(`/${FORMAT}/${FORMAT_VERSION}/`), schema.$id);
    assert.ok(!/^https?:\/\//.test(schema.$id), `${schema.$id} looks like a live URL; nothing is served there, so it should not read as one`);
    const doc = readFileSync(join(import.meta.dirname, "FORMAT.md"), "utf8");
    assert.ok(doc.startsWith(`# ${FORMAT} ${FORMAT_VERSION} `), `FORMAT.md's title names the format's own version (${FORMAT_VERSION})`);
    assert.match(doc, new RegExp(`\\| \`formatVersion\` \\| \`${FORMAT_VERSION.replace(/\./g, "\\.")}\` \\|`), "FORMAT.md's field table names the format's own version");
    const dir = where();
    try {
      writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE, TWO], [BUILD], "..");
      assert.ok("$defs" in schema && schema.$defs !== null && typeof schema.$defs === "object");
      const defs: Record<string, unknown> = { ...schema.$defs };
      for (const [name, file] of [["index", join(dir, "index.json")], ["version", join(dir, "versions", `${SHA}.json`)]]) {
        const def = defs[name ?? ""];
        assert.ok(def !== null && typeof def === "object" && "required" in def && Array.isArray(def.required));
        const document: unknown = JSON.parse(readFileSync(file ?? "", "utf8"));
        assert.ok(document !== null && typeof document === "object");
        for (const field of def.required) assert.ok(typeof field === "string" && field in document, `${String(name)} carries ${String(field)}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// [EaR]: the ID is what the link holds, so renaming an artifact or renumbering a criterion
// leaves every link to it intact. A symbols file that stored only a path and a label was
// storing the position and the name as the reference, which is what that criterion forbids.
describe("an artifact reference in a symbols file is its stable ID", () => {
  it("round-trips the ID through a version and back", () => {
    const dir = where();
    const cited: SymbolLink = { ...link("`tower` criterion 3"), artifact: { kind: "criterion", path: "docs/specs/tower.md", anchor: "criterion-3", label: "`tower` criterion 3", id: "1uQ" } };
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [position("src/a.ts", [1, 1], [2, 2], [cited])], [BUILD], "..");
    const found = readSymbols(dir).version(BUILD).at("src/a.ts", 1, null)[0]?.links[0]?.artifact;
    assert.ok(found, "the link is there to carry an ID");
    assert.equal(found.id, "1uQ", JSON.stringify(found));
    assert.equal(found.label, "`tower` criterion 3", "the name is still carried, for a reader to display");
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves the ID absent for an artifact that declares none, rather than inventing one", () => {
    const dir = where();
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
    assert.equal(readSymbols(dir).version(BUILD).at("src/a.ts", 1, null)[0]?.links[0]?.artifact.id, undefined);
    rmSync(dir, { recursive: true, force: true });
  });
});

// FORMAT.md, Compatibility: "A reader ignores a field it does not know. New fields may be
// added within a minor version; a reader that refuses an unknown field is not conformant."
describe("the reader is conformant about fields it does not know", () => {
  it("reads a document carrying a field from a later writer, rather than refusing it", () => {
    const dir = where();
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
    const file = join(dir, "index.json");
    const document = parsedJson(readFileSync(file, "utf8"));
    const artifacts: unknown = document["artifacts"];
    assert.ok(Array.isArray(artifacts));
    const rows: unknown[] = artifacts;
    const first = rows[0];
    assert.ok(first !== null && typeof first === "object");
    rows[0] = { ...first, somethingLater: "a field this reader has never heard of" };
    writeFileSync(file, JSON.stringify(document));
    assert.deepEqual(readSymbols(dir).version(BUILD).at("src/a.ts", 1, null), [ONE], "an unknown field is ignored, not refused");
    rmSync(dir, { recursive: true, force: true });
  });
});

// A writer writes the version it writes. An index is loaded and added to rather than rebuilt, so
// a document written by a newer writer kept whatever `formatVersion` it was created with — and
// then declared a version that did not describe its own contents. That is the one claim in the
// file every other reader trusts before reading anything else.
describe("an index declares the format version of the writer that last wrote it", () => {
  it("re-stamps a document created by an earlier writer of the same minor", () => {
    const dir = where();
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
    const file = join(dir, "index.json");
    const document = parsedJson(readFileSync(file, "utf8"));
    document["formatVersion"] = "0.3.0";
    writeFileSync(file, JSON.stringify(document));

    writeVersion(dir, { commit: LATER, date: "2026-09-16T10:05:00+00:00" }, [TWO], [OTHER_BUILD], "..");
    assert.equal(parsedJson(readFileSync(file, "utf8"))["formatVersion"], FORMAT_VERSION);
    rmSync(dir, { recursive: true, force: true });
  });
});

// [EaR], [5jT]: a reference carries a hash of the artifact's own content, so whether a link
// is suspect is one comparison at each end and needs no repository, network or history walk.
// That is what makes the question askable of a deployed build, and askable of every link at
// once rather than one at a time.
describe("an artifact version is witnessed by a content hash", () => {
  function linkWith(linked: string, current: string): SymbolLink {
    return {
      ...link("`tower` criterion 3"),
      linked: { commit: "3".repeat(40), date: "2026-09-15T10:00:00+00:00", content: linked },
      current: { commit: "4".repeat(40), date: "2026-09-16T10:00:00+00:00", content: current },
    };
  }

  it("round-trips the hash on both ends of a link", () => {
    const dir = where();
    const same = "c".repeat(64);
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [position("src/a.ts", [1, 1], [2, 2], [linkWith(same, same)])], [BUILD], "..");
    const found = readSymbols(dir).version(BUILD).at("src/a.ts", 1, null)[0]?.links[0];
    assert.ok(found);
    assert.equal(found.linked?.content, same);
    assert.equal(found.current?.content, same);
    rmSync(dir, { recursive: true, force: true });
  });

  it("says whether a link is suspect by comparing the two, with no repository in reach", () => {
    const dir = where();
    const moved = linkWith("c".repeat(64), "d".repeat(64));
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [position("src/a.ts", [1, 1], [2, 2], [moved])], [BUILD], "..");
    const found = readSymbols(dir).version(BUILD).at("src/a.ts", 1, null)[0]?.links[0];
    assert.ok(found);
    assert.notEqual(found.linked?.content, found.current?.content, "the artifact changed after the link was made, and the file alone says so");
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves the hash absent for a version written before it was carried, rather than inventing one", () => {
    const dir = where();
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
    const found = readSymbols(dir).version(BUILD).at("src/a.ts", 1, null)[0]?.links[0];
    assert.ok(found);
    assert.equal(found.linked?.content, undefined);
    rmSync(dir, { recursive: true, force: true });
  });
});

// [LdF]: a position records what it names, not only where it sits. A link held by a file and a
// line is destroyed by an edit anywhere above it; one that names the thing it falls inside is not.
describe("a position records the thing it names", () => {
  it("round-trips an anchor through a version and back", () => {
    const dir = where();
    const named: SymbolPosition = { ...position("src/a.ts", [4, 1], [6, 20], [link("ADR-171")]), anchor: { kind: "name", name: "stampInto" } };
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [named], [BUILD], "..");
    assert.deepEqual(readSymbols(dir).version(BUILD).at("src/a.ts", 5, null)[0]?.anchor, { kind: "name", name: "stampInto" });
    rmSync(dir, { recursive: true, force: true });
  });

  it("leaves it absent where nothing names the position, rather than inventing a name", () => {
    const dir = where();
    writeVersion(dir, { commit: SHA, date: "2026-09-15T10:05:00+00:00" }, [ONE], [BUILD], "..");
    assert.equal(readSymbols(dir).version(BUILD).at("src/a.ts", 1, null)[0]?.anchor, undefined);
    rmSync(dir, { recursive: true, force: true });
  });
});
