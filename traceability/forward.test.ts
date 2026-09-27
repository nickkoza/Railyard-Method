// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Forward: from an artifact to every source position that traces to it
// ([63N], [QzV], [EaR]; [QBm]). Tier 2: real
// git, in a fixture repository.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { ForwardAnswer, TraceRefusal, traceAll, traceBackward, traceForward } from "./index.ts";
import type { Source } from "./index.ts";
import { damagedRepository, fixtureRepository, renamedSpecRepository, STOP_ROW, widgetRepository } from "./testing/fixture.ts";
import type { Damaged, Renamed, Widget } from "./testing/fixture.ts";

let w: Widget;

type Entry = ForwardAnswer["positions"][number];

function forward(reference: string, at?: string): ForwardAnswer {
  return traceForward({ repo: w.fixture.dir, at: at ?? w.stops.sha, reference });
}

function at(answer: ForwardAnswer, source: Source, path: string, start: number | null, end: number | null): Entry {
  const found = answer.positions.filter((p) => p.link.source === source && p.position.path === path && p.position.start === start && p.position.end === end);
  assert.equal(found.length, 1, `${source} ${path}:${String(start)}-${String(end)} in ${JSON.stringify(answer.positions.map((p) => `${p.link.source} ${p.position.path}:${String(p.position.start)}-${String(p.position.end)}`))}`);
  const [entry] = found;
  if (entry === undefined) throw new Error("unreachable");
  return entry;
}

describe("traceForward", () => {
  before(() => {
    w = widgetRepository();
  });
  after(() => {
    w.fixture.remove();
  });

  it("lists every position that cites an ADR, in the code and in commits, each with how it is known", () => {
    const answer = forward("ADR-002");
    ForwardAnswer.parse(answer);
    assert.deepEqual(answer.at, { commit: w.stops.sha, date: w.stops.date });
    assert.deepEqual(answer.artifact, { kind: "adr", path: "docs/waymarks/002-second.md", anchor: null, label: "ADR-002" });
    assert.deepEqual([answer.current?.commit, answer.current?.date], [w.docs.sha, w.docs.date]);
    assert.equal(answer.traced, true);
    const cited = at(answer, "code-citation", "src/widget/spin.ts", 5, 6);
    assert.equal(cited.link.kind, "cited");
    assert.equal(cited.link.state, "current");
    assert.deepEqual(cited.link.madeBy, { commit: w.code.sha, path: "src/widget/spin.ts", line: 5 });
    const trailer = at(answer, "commit-trailer", "src/widget/spin.ts", 1, 13);
    assert.deepEqual(trailer.link.madeBy, { commit: w.code.sha, path: null, line: null });
    at(answer, "commit-trailer", "src/widget/rate.ts", 1, 1);
    at(answer, "commit-trailer", "src/widget/core/stop.test.ts", 1, 2);
    assert.equal(answer.positions.filter((p) => p.link.source === "commit-message").length, 0);
    for (const p of answer.positions) assert.equal(p.link.kind, "cited");
    // The ADR's own heading cites it, but an artifact's documents are not built from it.
    assert.ok(!answer.positions.some((p) => p.position.path.startsWith("docs/")), JSON.stringify(answer.positions));
  });

  it("lists a criterion's positions: the commits citing it, and the tests its Tests table names; suspect once it changed", () => {
    const answer = forward("`widget` criterion 2");
    assert.deepEqual(answer.artifact, { kind: "criterion", path: "docs/specs/widget.md", anchor: "criterion-2", label: "`widget` criterion 2" });
    const test = at(answer, "tests-table", "src/widget/core/stop.test.ts", null, null);
    assert.equal(test.link.kind, "cited");
    assert.equal(test.link.state, "suspect");
    assert.deepEqual(test.link.madeBy, { commit: w.docs.sha, path: "docs/specs/widget.md", line: STOP_ROW });
    assert.equal(at(answer, "commit-message", "src/widget/spin.ts", 1, 13).link.state, "suspect");
    assert.equal(answer.positions.filter((p) => p.link.source === "code-citation").length, 0);
    assert.deepEqual(forward("docs/specs/widget.md#criterion-2").positions, answer.positions);
    const earlier = forward("`widget` criterion 2", w.plain.sha);
    assert.equal(at(earlier, "tests-table", "src/widget/core/stop.test.ts", null, null).link.state, "current");
  });

  // [EaR].
  it("gives a criterion's own current version, not its spec's", () => {
    const one = forward("`widget` criterion 1").current;
    const two = forward("`widget` criterion 2").current;
    assert.deepEqual([one?.commit, one?.date], [w.docs.sha, w.docs.date]);
    assert.deepEqual([two?.commit, two?.date], [w.stops.sha, w.stops.date]);
    // [EaR]: each version also carries the witness, and two criteria of one spec have their own.
    assert.match(one?.content ?? "", /^[0-9a-f]{64}$/);
    assert.notEqual(one?.content, two?.content, "a criterion's witness is its own text, not its spec's");
  });

  it("gives a spec every position of each of its criteria", () => {
    const answer = forward("docs/specs/widget.md");
    assert.equal(answer.artifact.kind, "spec");
    assert.equal(at(answer, "code-citation", "src/widget/spin.ts", 1, 13).link.artifact.anchor, "criterion-1");
    assert.equal(at(answer, "code-citation", "src/widget/spin.test.ts", 1, 3).link.artifact.anchor, "criterion-1");
    assert.equal(at(answer, "tests-table", "src/widget/core/stop.test.ts", null, null).link.artifact.anchor, "criterion-2");
    assert.equal(at(answer, "tests-table", "src/widget/spin.test.ts", null, null).link.artifact.anchor, "criterion-1");
  });

  it("gives an architecture node the files under its source path that no nested node claims, as recorded", () => {
    const answer = forward("CALM node `widget`");
    assert.deepEqual(answer.artifact, { kind: "architecture-node", path: "docs/architecture/model.json", anchor: "widget", label: "CALM node `widget`" });
    for (const path of ["src/widget/rate.ts", "src/widget/spin.ts", "src/widget/spin.test.ts"]) {
      assert.equal(at(answer, "architecture-source-path", path, null, null).link.kind, "recorded");
    }
    assert.ok(!answer.positions.some((p) => p.position.path === "src/widget/core/stop.test.ts"), JSON.stringify(answer.positions));
    at(forward("docs/architecture/model.json#widget-core"), "architecture-source-path", "src/widget/core/stop.test.ts", null, null);
  });

  it("runs both ways: a backward query of each position it lists names the same artifact", () => {
    for (const reference of ["ADR-002", "`widget` criterion 1", "`widget` criterion 2", "CALM node `widget`", "docs/specs/widget.md"]) {
      const answer = forward(reference);
      assert.ok(answer.positions.length > 0, reference);
      for (const { position, link } of answer.positions) {
        const back = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: position.path, line: position.start ?? 1 });
        assert.ok(
          back.links.some((l) => l.source === link.source && l.artifact.path === link.artifact.path && l.artifact.anchor === link.artifact.anchor),
          `${reference}: ${position.path}:${String(position.start)} by ${link.source}`,
        );
      }
    }
  });

  it("still lists what cites an artifact no file carries, and says it is missing", () => {
    const answer = forward("ADR-009");
    assert.equal(answer.current, null);
    const cited = at(answer, "code-citation", "src/widget/spin.ts", 11, 12);
    assert.equal(cited.link.state, "missing");
  });

  it("says untraced when no position traces to an artifact", () => {
    const answer = forward("ADR-002", w.docs.sha);
    assert.equal(answer.traced, false);
    assert.deepEqual(answer.positions, []);
  });

  it("names a source it cannot read, and still answers", () => {
    const answer = traceForward({ repo: w.fixture.dir, reference: "CALM node `widget`" });
    assert.ok(answer.unreadable.some((u) => u.path === "docs/architecture/broken.json"), JSON.stringify(answer.unreadable));
    at(answer, "architecture-source-path", "src/widget/spin.ts", null, null);
  });

  it("refuses, in words, a reference no adapter recognises, and one that names several artifacts", () => {
    assert.throws(() => forward("nothing like an artifact"), (e: unknown) => e instanceof TraceRefusal && e.message.includes("nothing like an artifact"));
    assert.throws(() => forward("docs/unknown/thing.md"), TraceRefusal);
    assert.throws(() => forward("`widget` criteria 1–2"), (e: unknown) => e instanceof TraceRefusal && e.message.includes("`widget` criterion 2"));
  });
});

// The failure behavior's "a source that cannot be read"; traceability's Decisions.
describe("traceForward, where git cannot read part of the repository", () => {
  let d: Damaged;
  before(() => {
    d = damagedRepository();
  });
  after(() => {
    d.fixture.remove();
  });

  it("names a file it could not read, even one git's own search passed over, and still lists what it could; a submodule is no file", () => {
    const answer = traceForward({ repo: d.fixture.dir, reference: "ADR-001" });
    assert.ok(answer.unreadable.some((u) => u.path === "docs/architecture/model.json" && u.reason.includes("code-citation")), JSON.stringify(answer.unreadable));
    assert.ok(answer.positions.some((p) => p.link.source === "code-citation" && p.position.path === "src/a.ts"), JSON.stringify(answer.positions));
    assert.ok(answer.positions.some((p) => p.link.source === "commit-message" && p.position.path === "src/a.ts"), JSON.stringify(answer.positions));
    assert.ok(!answer.positions.some((p) => p.position.path === "vendor/sub"), JSON.stringify(answer.positions));
  });

  it("names a search of the history it could not run as the repository's, and still lists the code's citations", () => {
    const cut = damagedRepository({ cutHistory: true });
    try {
      const answer = traceForward({ repo: cut.fixture.dir, reference: "ADR-001" });
      assert.ok(answer.unreadable.some((u) => u.path === "." && u.reason.includes("commit-message")), JSON.stringify(answer.unreadable));
      assert.ok(answer.positions.some((p) => p.link.source === "code-citation" && p.position.path === "src/a.ts"), JSON.stringify(answer.positions));
    } finally {
      cut.fixture.remove();
    }
  });
});

describe("traceForward, after a cited spec is renamed", () => {
  let r: Renamed;
  before(() => {
    r = renamedSpecRepository();
  });
  after(() => {
    r.fixture.remove();
  });

  it("still lists what cites the renamed spec's criterion, and says it is missing; current at the citing commit", () => {
    const now = traceForward({ repo: r.fixture.dir, reference: "`widget` criterion 2" });
    assert.deepEqual(now.artifact, { kind: "criterion", path: "docs/specs/widget.md", anchor: "criterion-2", label: "`widget` criterion 2" });
    assert.equal(now.current, null);
    const missing = now.positions.find((p) => p.link.source === "code-citation" && p.position.path === "src/cite.ts");
    assert.ok(missing !== undefined, JSON.stringify(now.positions));
    assert.deepEqual(missing.position, { path: "src/cite.ts", start: 1, end: 2 });
    assert.equal(missing.link.state, "missing");
    const then = traceForward({ repo: r.fixture.dir, at: r.cited.sha, reference: "`widget` criterion 2" });
    assert.deepEqual([then.current?.commit, then.current?.date], [r.cited.sha, r.cited.date]);
    assert.equal(then.positions.find((p) => p.position.path === "src/cite.ts")?.link.state, "current");
  });
});

// [ei5].
describe("traceForward, where a line names an artifact in code rather than a comment", () => {
  it("reaches the comments that cite it and never the string that names it", () => {
    const f = fixtureRepository();
    try {
      f.commit("A decision, and a test that names it in a fixture", { "docs/waymarks/001-first.md": "# ADR-001 — First\n", "src/uses.test.ts": [
        "// Built as the first decision says (ADR-001).",
        "export const a = 1;",
        "const fixture = \"see ADR-001 and docs/specs/gizmo.md\";",
        "const b = 2; // ADR-001, trailing",
        "",
      ].join("\n") });
      const answer = traceForward({ repo: f.dir, reference: "ADR-001" });
      const made = answer.positions.filter((p) => p.link.source === "code-citation").map((p) => p.link.madeBy.line);
      assert.ok(made.includes(1) && made.includes(4), `the opening comment and the trailing one cite it: ${JSON.stringify(made)}`);
      assert.ok(!made.includes(3), "the string on line 3 does not");
    } finally {
      f.remove();
    }
  });
});

// A node's source-path may be a list ([C4P]).
describe("traceForward, from a node whose source-path is a list", () => {
  it("reaches the files under every path in the list", () => {
    const f = fixtureRepository();
    try {
      const model = { nodes: [{ "unique-id": "pair", "node-type": "service", name: "Pair", description: "Two places.", "source-path": ["src/one", "src/two"] }], relationships: [] };
      f.commit("A component in two places", {
        "docs/architecture/model.json": JSON.stringify(model, null, 2),
        "src/one/a.ts": "export const a = 1;\n",
        "src/two/b.ts": "export const b = 2;\n",
      });
      const answer = traceForward({ repo: f.dir, reference: "CALM node `pair`" });
      const reached = new Set(answer.positions.filter((p) => p.link.source === "architecture-source-path").map((p) => p.position.path));
      assert.deepEqual([...reached].sort(), ["src/one/a.ts", "src/two/b.ts"]);
      assert.deepEqual(answer.unreadable, []);
    } finally {
      f.remove();
    }
  });
});

// A commit's message links the code it changed, and nothing else it touched (traceability's Decisions).
describe("a commit's message, cited, links only the code the commit changed", () => {
  it("gives no link to a manifest, the agent's configuration, the symbols directory or a document", () => {
    const f = fixtureRepository();
    try {
      const spec = "# Grasp\n\n**ID:** [Ga1]\n\n## Acceptance criteria\n\n1. [Gb2] A trial ends.\n";
      f.commit("The spec", { "docs/specs/grasp.md": spec });
      f.commit("A trial ends [Gb2]", {
        "src/trial.ts": "export function trial() {\n  return 1;\n}\n",
        "src/trial.test.ts": "trial();\n",
        "package.json": "{\n  \"name\": \"x\"\n}\n",
        ".claude/settings.json": "{}\n",
        ".claude/skills/x/tool.mjs": "export {};\n",
        "symbols/links/src/trial.ts.json": "{}\n",
        "NOTES.md": "Trials end.\n",
      });
      const answer = traceForward({ repo: f.dir, reference: "Gb2" });
      const linked = [...new Set(answer.positions.filter((p) => p.link.source === "commit-message").map((p) => p.position.path))].sort();
      assert.deepEqual(linked, ["src/trial.test.ts", "src/trial.ts"]);
      const all = [...new Set(traceAll({ repo: f.dir }).entries.filter((e) => e.links.some((l) => l.source === "commit-message")).map((e) => e.path))].sort();
      assert.deepEqual(all, ["src/trial.test.ts", "src/trial.ts"]);
      assert.deepEqual(traceBackward({ repo: f.dir, path: "package.json", line: 2 }).links.filter((l) => l.source === "commit-message"), []);
    } finally {
      f.remove();
    }
  });
});

// A Tests row whose test is not written yet names a file that is not there yet ([98I]).
describe("a Tests row for a test not written yet", () => {
  it("is passed over quietly when it names a file not there yet, and still named when a written test is missing", () => {
    const f = fixtureRepository();
    try {
      const spec = [
        "# Grasp", "", "**ID:** [Ga1]", "", "## Acceptance criteria", "",
        "1. [Gb2] A trial ends.", "2. [Gc3] A trial is timed.", "3. [Gd4] A trial is logged.", "",
        "## Tests", "", "| Criterion | Test | Status |", "|---|---|---|",
        "| [Gb2] | `test/ends.test.ts` | Planned |",
        "| [Gc3] | `test/timed.test.ts` | Not yet written |",
        "| [Gd4] | `test/logged.test.ts` | Written |", "",
      ].join("\n");
      f.commit("The spec, before its tests", { "docs/specs/grasp.md": spec, "src/trial.ts": "export const trial = 1;\n" });
      for (const id of ["Gb2", "Gc3"]) assert.deepEqual(traceForward({ repo: f.dir, reference: id }).unreadable, [], id);
      assert.ok(traceForward({ repo: f.dir, reference: "Gd4" }).unreadable.some((u) => u.reason.includes("test/logged.test.ts")));
      assert.ok(!traceBackward({ repo: f.dir, path: "src/trial.ts", line: 1 }).unreadable.some((u) => /ends|timed/.test(u.reason)));
    } finally {
      f.remove();
    }
  });
});

// [MHU]: a Tests row names its criteria by ID, so reordering them moves no test. Found 2026-09-27:
// with rows by number, swapping two criteria moved `trace forward` of the first onto the other's test.
describe("a Tests row read by the IDs it names", () => {
  const spec = (criteria: readonly string[], rows: readonly string[]): string => [
    "# Transfer", "", "**ID:** [Tr0]", "", "## Acceptance criteria", "",
    ...criteria.map((c, i) => `${String(i + 1)}. ${c}`), "",
    "## Tests", "", "| Criterion | Test | Status |", "|---|---|---|", ...rows, "",
  ].join("\n");
  const tested = (dir: string, id: string): string[] =>
    traceForward({ repo: dir, reference: id }).positions.filter((p) => p.link.source === "tests-table").map((p) => p.position.path).sort();

  it("keeps each test on its own criterion when the criteria are swapped", () => {
    const f = fixtureRepository();
    try {
      const rows = ["| [Aa1] (exports) | `export.test.js` | Written |", "| [Bb2] (imports) | `import.test.js` | Written |"];
      f.commit("Two criteria and their tests", { "docs/specs/transfer.md": spec(["[Aa1] It exports.", "[Bb2] It imports."], rows), "export.test.js": "", "import.test.js": "" });
      assert.deepEqual(tested(f.dir, "Aa1"), ["export.test.js"]);
      f.commit("Imports first", { "docs/specs/transfer.md": spec(["[Bb2] It imports.", "[Aa1] It exports."], rows) });
      assert.deepEqual(tested(f.dir, "Aa1"), ["export.test.js"], "reordering the criteria moves no test");
      assert.deepEqual(tested(f.dir, "Bb2"), ["import.test.js"]);
    } finally {
      f.remove();
    }
  });

  it("keeps a test on a criterion moved to another spec", () => {
    const f = fixtureRepository();
    try {
      f.commit("Imports moved to their own spec", {
        "docs/specs/transfer.md": spec(["[Aa1] It exports."], ["| [Aa1] | `export.test.js` | Written |", "| [Bb2] | `import.test.js` | Written |"]),
        "docs/specs/intake.md": "# Intake\n\n**ID:** [In0]\n\n## Acceptance criteria\n\n1. [Bb2] It imports.\n",
        "export.test.js": "", "import.test.js": "",
      });
      assert.deepEqual(tested(f.dir, "Bb2"), ["import.test.js"]);
    } finally {
      f.remove();
    }
  });

  it("reads a row by number as nothing, and says so, where the criteria it names carry IDs", () => {
    const f = fixtureRepository();
    try {
      f.commit("Rows by number", { "docs/specs/transfer.md": spec(["[Bb2] It imports.", "[Aa1] It exports."], ["| 1 | `export.test.js` | Written |", "| 2 | `import.test.js` | Written |"]), "export.test.js": "", "import.test.js": "" });
      const answer = traceForward({ repo: f.dir, reference: "Aa1" });
      assert.deepEqual(answer.positions.filter((p) => p.link.source === "tests-table"), [], "a number is never read as whichever criterion sits there now");
      assert.ok(answer.unreadable.some((u) => u.path === "docs/specs/transfer.md" && u.reason.includes("by number") && u.reason.includes("[Aa1]")), JSON.stringify(answer.unreadable));
    } finally {
      f.remove();
    }
  });
});
