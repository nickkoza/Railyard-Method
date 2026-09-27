// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Backward: from a line to the artifacts that caused it, from what the
// repository already records ([63N], [LPv], [EaR] and failure
// behavior; [QBm]). Tier 2: real git, in a fixture repository.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { BackwardAnswer, renderBackward, TraceRefusal, traceBackward } from "./index.ts";
import type { Link, Source } from "./index.ts";
import { damagedRepository, fixtureRepository, renamedSpecRepository, STOP_ROW, widgetRepository } from "./testing/fixture.ts";
import type { Damaged, Renamed, Widget } from "./testing/fixture.ts";

let w: Widget;

function linksFrom(answer: BackwardAnswer, source: Source, label: string): Link[] {
  return answer.links.filter((l) => l.source === source && l.artifact.label === label);
}

function only(answer: BackwardAnswer, source: Source, label: string): Link {
  const found = linksFrom(answer, source, label);
  assert.equal(found.length, 1, `${source} ${label} in ${JSON.stringify(answer.links.map((l) => `${l.source} ${l.artifact.label}`))}`);
  const [link] = found;
  if (link === undefined) throw new Error("unreachable");
  return link;
}

describe("traceBackward", () => {
  before(() => {
    w = widgetRepository();
  });
  after(() => {
    w.fixture.remove();
  });

  it("names the commit it read and the line, with the commit that last changed the line", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.ts", line: 6 });
    assert.deepEqual(answer.at, { commit: w.stops.sha, date: w.stops.date });
    assert.deepEqual(answer.position, { path: "src/widget/spin.ts", line: 6 });
    assert.equal(answer.text, "  const turns = rate;");
    assert.equal(answer.lineCommit.commit, w.code.sha);
    assert.equal(answer.lineCommit.date, w.code.date);
    assert.equal(answer.lineCommit.author, "Fixture Author");
    assert.equal(answer.lineCommit.subject, "Spin the widget (ADR-001)");
    assert.deepEqual(answer.lineCommit.trailers, [
      { key: "Refs", value: "ADR-002" },
      { key: "Co-Authored-By", value: "Someone <someone@example.com>" },
    ]);
    assert.equal(answer.traced, true);
    BackwardAnswer.parse(answer);
  });

  it("reads every source, and says of each link how it is known: only an architecture source path is recorded", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.ts", line: 6 });
    const node = only(answer, "architecture-source-path", "CALM node `widget`");
    assert.equal(node.kind, "recorded");
    assert.deepEqual(node.artifact, { kind: "architecture-node", path: "docs/architecture/model.json", anchor: "widget", label: "CALM node `widget`" });
    assert.equal(only(answer, "code-citation", "ADR-002").madeBy.line, 5);
    assert.equal(only(answer, "code-citation", "`widget` criterion 1").madeBy.line, 1);
    only(answer, "commit-message", "ADR-001");
    only(answer, "commit-message", "`widget` criterion 1");
    only(answer, "commit-message", "`widget` criterion 2");
    assert.deepEqual(only(answer, "commit-trailer", "ADR-002").madeBy, { commit: w.code.sha, path: null, line: null });
    for (const link of answer.links) {
      assert.equal(link.kind, link.source === "architecture-source-path" ? "recorded" : "cited", `${link.source} ${link.artifact.label}`);
    }
  });

  it("lists the links in order of trust: source path, Tests table, the code, the commit's message, its trailers", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.ts", line: 6 });
    const order: readonly Source[] = ["architecture-source-path", "tests-table", "code-citation", "commit-message", "commit-trailer"];
    const ranks = answer.links.map((l) => order.indexOf(l.source));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  });

  it("takes code citations only from the lines in scope: the line's own block, its enclosing lines' blocks, and the file's opening block", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.ts", line: 12 });
    assert.deepEqual(linksFrom(answer, "code-citation", "ADR-002"), []);
    only(answer, "code-citation", "`widget` criterion 1");
    only(answer, "code-citation", "ADR-009");
  });

  it("refers to each artifact by its path and the commit of the version linked, with that commit's date and time", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.ts", line: 6 });
    const adr = only(answer, "code-citation", "ADR-002");
    assert.deepEqual(adr.artifact, { kind: "adr", path: "docs/waymarks/002-second.md", anchor: null, label: "ADR-002" });
    assert.deepEqual([adr.linked?.commit, adr.linked?.date], [w.docs.sha, w.docs.date]);
    assert.deepEqual([adr.current?.commit, adr.current?.date], [w.docs.sha, w.docs.date]);
    assert.equal(adr.state, "current");
    assert.deepEqual(adr.madeBy, { commit: w.code.sha, path: "src/widget/spin.ts", line: 5 });
  });

  // [EaR].
  it("gives a criterion's own version, not its spec's: the last commit that changed its text", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.ts", line: 6 });
    const one = only(answer, "commit-message", "`widget` criterion 1");
    assert.equal(one.state, "current");
    assert.deepEqual([one.linked?.commit, one.linked?.date], [w.docs.sha, w.docs.date]);
    assert.deepEqual([one.current?.commit, one.current?.date], [w.docs.sha, w.docs.date]);
    assert.deepEqual([only(answer, "commit-message", "`widget` criterion 2").current?.commit, only(answer, "commit-message", "`widget` criterion 2").current?.date], [w.stops.sha, w.stops.date]);
  });

  it("marks a link suspect once the artifact's own text changed after the link was made, and only that one", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.ts", line: 6 });
    const stops = only(answer, "commit-message", "`widget` criterion 2");
    assert.equal(stops.state, "suspect");
    assert.deepEqual([stops.linked?.commit, stops.linked?.date], [w.docs.sha, w.docs.date]);
    assert.deepEqual([stops.current?.commit, stops.current?.date], [w.stops.sha, w.stops.date]);
    assert.deepEqual(stops.artifact, { kind: "criterion", path: "docs/specs/widget.md", anchor: "criterion-2", label: "`widget` criterion 2" });
    assert.equal(only(answer, "commit-message", "`widget` criterion 1").state, "current");
    const before = traceBackward({ repo: w.fixture.dir, at: w.plain.sha, path: "src/widget/spin.ts", line: 6 });
    assert.equal(only(before, "commit-message", "`widget` criterion 2").state, "current");
  });

  it("says a cited artifact that does not exist is missing, rather than dropping it", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.ts", line: 12 });
    const missing = only(answer, "code-citation", "ADR-009");
    assert.equal(missing.state, "missing");
    assert.equal(missing.current, null);
  });

  it("links a test file to the criteria a spec's Tests table names it for, a bare name included, and the nested node to it", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/core/stop.test.ts", line: 1 });
    const row = only(answer, "tests-table", "`widget` criterion 2");
    assert.equal(row.kind, "cited");
    assert.deepEqual(row.madeBy, { commit: w.docs.sha, path: "docs/specs/widget.md", line: STOP_ROW });
    assert.equal(row.state, "suspect");
    only(answer, "architecture-source-path", "CALM node `widget-core`");
    assert.deepEqual(linksFrom(answer, "architecture-source-path", "CALM node `widget`"), []);
    const byPath = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/widget/spin.test.ts", line: 3 });
    assert.equal(only(byPath, "tests-table", "`widget` criterion 1").state, "current");
  });

  it("never guesses which of several files a bare test name means, and says so", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "src/a/twin.test.ts", line: 1 });
    assert.equal(answer.links.filter((l) => l.source === "tests-table").length, 0);
    assert.ok(answer.unreadable.some((u) => u.path === "docs/specs/widget.md" && u.reason.includes("twin.test.ts")), JSON.stringify(answer.unreadable));
  });

  it("says a line that traces to nothing is untraced, and guesses nothing", () => {
    const answer = traceBackward({ repo: w.fixture.dir, at: w.stops.sha, path: "other/plain.txt", line: 1 });
    assert.equal(answer.traced, false);
    assert.deepEqual(answer.links, []);
    assert.deepEqual(answer.unreadable, []);
    assert.equal(answer.lineCommit.commit, w.plain.sha);
    assert.equal(answer.lineCommit.author, "Other Author");
  });

  it("names a source it cannot read, and why, and still answers from the rest; HEAD by default", () => {
    const answer = traceBackward({ repo: w.fixture.dir, path: "src/widget/spin.ts", line: 6 });
    assert.equal(answer.at.commit, w.broken.sha);
    const broken = answer.unreadable.find((u) => u.path === "docs/architecture/broken.json");
    assert.ok(broken !== undefined && broken.reason.length > 0, JSON.stringify(answer.unreadable));
    only(answer, "architecture-source-path", "CALM node `widget`");
    only(answer, "code-citation", "ADR-002");
  });

  it("refuses, in words, a file absent at the commit, a line out of range, an unknown commit, and a directory that is no repository", () => {
    assert.throws(() => traceBackward({ repo: w.fixture.dir, at: w.docs.sha, path: "src/widget/spin.ts", line: 1 }), (e: unknown) => e instanceof TraceRefusal && e.message.includes("src/widget/spin.ts"));
    assert.throws(() => traceBackward({ repo: w.fixture.dir, path: "src/widget/spin.ts", line: 99 }), (e: unknown) => e instanceof TraceRefusal && e.message.includes("99"));
    assert.throws(() => traceBackward({ repo: w.fixture.dir, path: "src/widget/spin.ts", line: 0 }), TraceRefusal);
    assert.throws(() => traceBackward({ repo: w.fixture.dir, at: "no-such-commit", path: "src/widget/spin.ts", line: 1 }), (e: unknown) => e instanceof TraceRefusal && e.message.includes("no-such-commit"));
    assert.throws(() => traceBackward({ repo: "/", path: "x", line: 1 }), TraceRefusal);
  });
});

// The failure behavior's "a source that cannot be read"; traceability's Decisions.
describe("traceBackward, where git cannot read part of the repository", () => {
  let d: Damaged;
  before(() => {
    d = damagedRepository();
  });
  after(() => {
    d.fixture.remove();
  });

  it("names a file git cannot read, in git's words, and still answers from the rest", () => {
    const answer = traceBackward({ repo: d.fixture.dir, path: "src/a.ts", line: 2 });
    const model = answer.unreadable.find((u) => u.path === "docs/architecture/model.json");
    assert.ok(model !== undefined && model.reason.length > 0, JSON.stringify(answer.unreadable));
    only(answer, "code-citation", "ADR-001");
    only(answer, "commit-message", "ADR-001");
  });

  it("refuses a submodule in words, since it is no file", () => {
    assert.throws(() => traceBackward({ repo: d.fixture.dir, path: "vendor/sub", line: 1 }), (e: unknown) => e instanceof TraceRefusal && e.message.includes("vendor/sub"));
  });
});

// [EaR].
describe("traceBackward, where a link was made before its artifact existed", () => {
  it("shows the link as suspect, with no version linked, and says why", () => {
    const f = fixtureRepository();
    try {
      const spec = (n: number): string => ["# Gizmo", "", "## Acceptance criteria", "", ...Array.from({ length: n }, (_, i) => `${String(i + 1)}. **Item.** Item ${String(i + 1)}.`), ""].join("\n");
      f.commit("The gizmo, and code for what it will do", { "docs/specs/gizmo.md": spec(2), "src/b.ts": "// `gizmo` criterion 3: not written yet.\nexport const b = 1;\n" });
      const added = f.commit("The gizmo's third criterion", { "docs/specs/gizmo.md": spec(3) });
      const answer = traceBackward({ repo: f.dir, path: "src/b.ts", line: 2 });
      const link = only(answer, "code-citation", "`gizmo` criterion 3");
      assert.equal(link.state, "suspect");
      assert.equal(link.linked, null);
      assert.deepEqual([link.current?.commit, link.current?.date], [added.sha, added.date]);
      assert.match(renderBackward(answer), /suspect: it did not exist when the link was made, now /);
    } finally {
      f.remove();
    }
  });
});

// [ei5].
describe("traceBackward, where a line names an artifact in code rather than a comment", () => {
  it("makes no link from a string, and still links a comment, trailing or above", () => {
    const f = fixtureRepository();
    try {
      f.commit("A decision, and a test that names it in a fixture", { "docs/waymarks/001-first.md": "# ADR-001 — First\n", "src/uses.test.ts": [
        "// Built as the first decision says (ADR-001).",
        "export const a = 1;",
        "const fixture = \"see ADR-001 and docs/specs/gizmo.md\";",
        "const b = 2; // ADR-001, trailing",
        "",
      ].join("\n") });
      const made = (line: number): readonly (number | null)[] =>
        traceBackward({ repo: f.dir, path: "src/uses.test.ts", line }).links.filter((l) => l.source === "code-citation").map((l) => l.madeBy.line);
      assert.ok(!made(3).includes(3), "the string on line 3 cites nothing");
      assert.ok(made(3).includes(1), "line 3 is still in scope of the file's opening comment");
      assert.ok(made(4).includes(4), "a trailing comment still cites");
      assert.ok(!traceBackward({ repo: f.dir, path: "src/uses.test.ts", line: 3 }).links.some((l) => l.artifact.path === "docs/specs/gizmo.md"), "a path in a string is not a citation");
    } finally {
      f.remove();
    }
  });
});

describe("traceBackward, after a cited spec is renamed", () => {
  let r: Renamed;
  before(() => {
    r = renamedSpecRepository();
  });
  after(() => {
    r.fixture.remove();
  });

  it("still lists a criterion citation of the spec, and says it is missing, rather than dropping it", () => {
    const now = only(traceBackward({ repo: r.fixture.dir, path: "src/cite.ts", line: 2 }), "code-citation", "`widget` criterion 2");
    assert.deepEqual(now.artifact, { kind: "criterion", path: "docs/specs/widget.md", anchor: "criterion-2", label: "`widget` criterion 2" });
    assert.equal(now.state, "missing");
    assert.equal(now.current, null);
    const then = only(traceBackward({ repo: r.fixture.dir, at: r.cited.sha, path: "src/cite.ts", line: 2 }), "code-citation", "`widget` criterion 2");
    assert.equal(then.state, "current");
    assert.deepEqual([then.current?.commit, then.current?.date], [r.cited.sha, r.cited.date]);
  });

  it("recognises a backticked name by a spec name's shape: an M-name is one, a camel-cased name is not", () => {
    const answer = traceBackward({ repo: r.fixture.dir, path: "src/cite.ts", line: 2 });
    assert.equal(only(answer, "code-citation", "`M1-gate` criterion 1").state, "missing");
    assert.ok(!answer.links.some((l) => l.artifact.label.includes("notASpec")), JSON.stringify(answer.links));
  });
});
