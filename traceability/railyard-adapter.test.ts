// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Railyard's artifacts as the adapter reads them: an ADR citation with any leading
// zeros, as Railyard's own change's named-by search reads it, and a
// Tests row as Railyard's own library reads it. Tier 1: a snapshot in memory.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { railyardAdapter } from "./index.ts";
import type { Snapshot } from "./index.ts";

function snapshotOf(files: Readonly<Record<string, string>>): Snapshot {
  // Nothing here is a symbols directory, so every file is source ([QBm]).
  return { commit: "0".repeat(40), files: () => new Set(Object.keys(files)), sourceFiles: () => new Set(Object.keys(files)), isRecord: () => false, read: (path) => files[path] };
}

describe("railyardAdapter", () => {
  it("reads ADR-<n> with any leading zeros, after anything but a letter or a digit, as named-by does", () => {
    const at = snapshotOf({ "docs/waymarks/002-second.md": "# Second\n", "docs/waymarks/148-mit.md": "# MIT\n" });
    const cited = railyardAdapter.cite("ADR-0002, ADR-000000000000000000002, x_ADR-2, (-ADR-148), ADR-148a; not AADR-2, but ADR-1480", at);
    assert.deepEqual(cited.map((a) => `${a.label} ${a.path}`), [
      "ADR-002 docs/waymarks/002-second.md",
      "ADR-002 docs/waymarks/002-second.md",
      "ADR-002 docs/waymarks/002-second.md",
      "ADR-148 docs/waymarks/148-mit.md",
      "ADR-148 docs/waymarks/148-mit.md",
      "ADR-1480 docs/waymarks/1480",
    ]);
  });

  it("reads a Tests row as the library does: its numbered criteria; the spec whole where it names NFRs or failure behaviour; and otherwise names it unreadable", () => {
    const spec = [
      "# Gizmo",
      "",
      "## Acceptance criteria",
      "",
      "1. **One.** It is one.",
      "2. **Two.** It is two.",
      "",
      "## Tests",
      "",
      "| Criterion | Test | Status |",
      "|---|---|---|",
      "| 1 (one) | `src/one.test.ts` [1] | Written |",
      "| NFRs | `src/perf.test.ts` [1] | Written |",
      "| Failure behavior | `src/fail.test.ts` [2] | Written |",
      "| The whole thing | `src/other.test.ts` [2] | Written |",
      "",
    ].join("\n");
    const at = snapshotOf({
      "docs/specs/gizmo.md": spec,
      "src/one.test.ts": "",
      "src/perf.test.ts": "",
      "src/fail.test.ts": "",
      "src/other.test.ts": "",
    });
    const read = railyardAdapter.testsNamed(at);
    assert.deepEqual(read.entries.map((e) => `${e.name} ${e.artifact.label}`), [
      "src/one.test.ts `gizmo` criterion 1",
      "src/perf.test.ts docs/specs/gizmo.md",
      "src/fail.test.ts docs/specs/gizmo.md",
    ]);
    assert.equal(read.unreadable.length, 1, JSON.stringify(read.unreadable));
    const [row] = read.unreadable;
    assert.equal(row?.path, "docs/specs/gizmo.md");
    assert.match(row.reason, /line 15: a Tests row names no criterion: "The whole thing"/);
  });

  it("resolves a stable ID to the artifact carrying it, so a rename cannot break the link", () => {
    const at = snapshotOf({
      "docs/specs/widget.md": "# Widget\n\n**Type:** Capability spec \u00b7 **ID:** [aB1]\n\n## Acceptance criteria\n\n1. [cD2] One.\n7. [eF3] Seven.\n",
      "docs/waymarks/002-second.md": "# Second\n\n**Status:** Accepted \u00b7 **ID:** [gH4]\n",
    });
    assert.deepEqual(railyardAdapter.cite("see [aB1]", at).map((a) => `${a.kind} ${a.path}`), ["spec docs/specs/widget.md"]);
    assert.deepEqual(railyardAdapter.cite("see [gH4]", at).map((a) => a.kind), ["adr"]);
    assert.deepEqual(railyardAdapter.cite("see [eF3]", at).map((a) => `${a.kind} ${a.anchor ?? ""}`), ["criterion criterion-7"]);
    assert.deepEqual(railyardAdapter.cite("see [zZ9]", at), [], "an ID naming nothing resolves to nothing");
  });

  it("resolves a criterion's ID to wherever it now sits, so a renumber cannot break the link", () => {
    const spec = (items: string): Readonly<Record<string, string>> => ({
      "docs/specs/widget.md": `# Widget\n\n**ID:** [aB1]\n\n## Acceptance criteria\n\n${items}`,
    });
    const before = snapshotOf(spec("1. [cD2] One.\n"));
    const after = snapshotOf(spec("1. [xY8] Inserted above.\n2. [cD2] One.\n"));
    assert.deepEqual(railyardAdapter.cite("[cD2]", before).map((a) => a.anchor), ["criterion-1"]);
    assert.deepEqual(railyardAdapter.cite("[cD2]", after).map((a) => a.anchor), ["criterion-2"], "the same ID, one ordinal later");
  });
});

// The grep that finds candidates runs BEFORE `cite` confirms them, so a pattern that does
// not match the stable ID means `cite` never sees the line. A forward trace then reports
// nothing and looks healthy, which is the silent degradation the principles forbid.
describe("the search pattern reaches a citation written as a stable ID", () => {
  const at = snapshotOf({
    "docs/specs/widget.md": "# Widget\n\n**ID:** [aB1]\n\n## Acceptance criteria\n\n1. [cD2] It spins.\n",
    "docs/waymarks/002-second.md": "# ADR-002 — Second\n\n**ID:** [gH4]\n",
  });

  it("matches a criterion by its own ID", () => {
    const target = railyardAdapter.fromPath("docs/specs/widget.md", "criterion-1", at);
    assert.ok(target);
    assert.match("cited in a comment: [cD2] and more", new RegExp(railyardAdapter.pattern(target, at)));
  });

  it("matches a spec by its own ID", () => {
    const target = railyardAdapter.fromPath("docs/specs/widget.md", null, at);
    assert.ok(target);
    assert.match("cited in a comment: [aB1]", new RegExp(railyardAdapter.pattern(target, at)));
  });

  it("matches a record by its own ID", () => {
    const target = railyardAdapter.fromPath("docs/waymarks/002-second.md", null, at);
    assert.ok(target);
    assert.match("cited in a comment: [gH4]", new RegExp(railyardAdapter.pattern(target, at)));
  });

  it("still matches the older form, for a citation outside the migrated surface", () => {
    const target = railyardAdapter.fromPath("docs/specs/widget.md", "criterion-1", at);
    assert.ok(target);
    assert.match("cited as `widget` criterion 1", new RegExp(railyardAdapter.pattern(target, at)));
  });
});

// [EaR]: the ID is the reference a link holds. Every artifact this adapter hands out carries it,
// so the symbols file records the reference rather than the position.
describe("every artifact the adapter names carries its stable ID", () => {
  const at = snapshotOf({
    "docs/specs/widget.md": "# Widget\n\n**ID:** [aB1]\n\n## Acceptance criteria\n\n1. [cD2] It spins.\n\n## Tests\n\n| # | Test |\n| [cD2] | `widget.test.ts` |\n",
    "docs/waymarks/002-second.md": "# ADR-002 — Second\n\n**ID:** [gH4]\n",
    "widget.test.ts": "",
  });

  it("stamps one cited by the older grammar, so an unmigrated document still yields the reference", () => {
    assert.deepEqual(railyardAdapter.cite("see `widget` criterion 1", at).map((a) => a.id), ["cD2"]);
    assert.deepEqual(railyardAdapter.cite("see ADR-002", at).map((a) => a.id), ["gH4"]);
  });

  it("stamps one named by path and anchor", () => {
    assert.equal(railyardAdapter.fromPath("docs/specs/widget.md", "criterion-1", at)?.id, "cD2");
    assert.equal(railyardAdapter.fromPath("docs/specs/widget.md", null, at)?.id, "aB1");
    assert.equal(railyardAdapter.fromPath("docs/waymarks/002-second.md", null, at)?.id, "gH4");
  });

  it("stamps one a Tests row names", () => {
    assert.deepEqual(railyardAdapter.testsNamed(at).entries.map((e) => e.artifact.id), ["cD2"]);
  });

  it("leaves it absent for an artifact declaring none, rather than inventing one", () => {
    const bare = snapshotOf({ "docs/specs/plain.md": "# Plain\n\n## Acceptance criteria\n\n1. No ID here.\n" });
    assert.equal(railyardAdapter.fromPath("docs/specs/plain.md", null, bare)?.id, undefined);
  });
});
