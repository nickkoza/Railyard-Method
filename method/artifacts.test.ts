// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The artifacts spec's criteria, each over a small repository built to break it, and then over
// this repository itself.
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkArtifacts, checkRepository } from "./artifacts.ts";

const ROOT = join(import.meta.dirname, "..");
let root = "";

function file(path: string, body: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

/** A spec with its ID, its criteria and a Tests table naming every one. */
function spec(name: string, id: string, criteria: string[], rows = criteria.map((c) => `| ${/^\[\w{3}\]/.exec(c)?.[0] ?? ""} (x) | \`t.test.ts\` [1] | Written |`)): void {
  file(`docs/specs/${name}.md`, [
    `# ${name}`, "", `**Type:** Capability spec · **ID:** [${id}]`, "", "## Acceptance criteria", "",
    ...criteria.map((c, i) => `${String(i + 1)}. ${c}`), "", "## Tests", "", "Every criterion has a test.", "",
    "| Criterion | Test | Status |", "|---|---|---|", ...rows, "",
  ].join("\n"));
}

/** A repository that meets every rule. */
function clean(): void {
  spec("widget", "Wa1", ["[Wb2] The widget spins.", "[Wc3] It stops."]);
  file("docs/waymarks/002-second.md", "# ADR-002 — Second\n\n**Status:** Accepted · **ID:** [Wd4]\n\n## Decisions\n\n1. [We5] **Keep it small.**\n");
  file("docs/principles/principles.md", "# Principles\n\n**ID:** [Wf6]\n\n1. [Wg7] **Be plain.** Always.\n");
}

function run(): string[] {
  execFileSync("git", ["init", "-q"], { cwd: root });
  return checkArtifacts(root).map((f) => `${f.rule}: ${f.message}`);
}

describe("the artifact checks, over repositories built to break each rule", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "artifacts-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("finds nothing in a repository that meets every rule", () => {
    clean();
    file("docs/specs/other.md", "# Other\n\n**ID:** [Wh8]\n\nIt builds on [Wb2] and [We5], and [Wg7].\n");
    assert.deepEqual(run(), []);
  });

  describe("[8g5]: every artifact and numbered item carries a stable ID", () => {
    it("reports an artifact with none, and one with a malformed one, apart", () => {
      clean();
      file("docs/specs/bare.md", "# Bare\n\n## Acceptance criteria\n");
      file("docs/specs/odd.md", "# Odd\n\n**ID:** [toolong]\n");
      const found = run().filter((f) => f.startsWith("8g5"));
      assert.ok(found.some((f) => f.includes("docs/specs/bare.md") && f.includes("no ID")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("docs/specs/odd.md") && f.includes("[toolong]")), found.join("\n"));
    });

    it("reports a criterion, a waymark decision and a principle with none", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] The widget spins.", "It stops, with no ID."]);
      file("docs/waymarks/003-third.md", "# ADR-003 — Third\n\n**ID:** [Wi9]\n\n## Decision\n\n1. **No ID here.**\n");
      file("docs/principles/principles.md", "# Principles\n\n**ID:** [Wf6]\n\n1. [Wg7] **Be plain.**\n2. **Be brief.**\n");
      const found = run().filter((f) => f.startsWith("8g5"));
      assert.ok(found.some((f) => f.includes("docs/specs/widget.md") && f.includes("criterion 2")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("docs/waymarks/003-third.md") && f.includes("decision 1")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("docs/principles/principles.md") && f.includes("principle 2")), found.join("\n"));
    });

    it("reports two things carrying the same ID", () => {
      clean();
      file("docs/waymarks/004-copy.md", "# ADR-004 — Copy\n\n**ID:** [Wb2]\n");
      assert.ok(run().some((f) => f.startsWith("8g5") && f.includes("[Wb2]") && f.includes("docs/waymarks/004-copy.md")));
    });
  });

  describe("[BNb]: a cited ID names something that exists", () => {
    it("reports a cited ID nothing carries, in prose and in a code comment", () => {
      clean();
      file("docs/specs/other.md", "# Other\n\n**ID:** [Wh8]\n\nIt builds on [zZ9].\n");
      file("src/a.ts", "// Implements [yY8].\nexport const a = 1;\n");
      const found = run().filter((f) => f.startsWith("BNb"));
      assert.ok(found.some((f) => f.includes("docs/specs/other.md") && f.includes("[zZ9]")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("src/a.ts") && f.includes("[yY8]")), found.join("\n"));
    });

    it("leaves a string, a code span, a dated document and a cross-repository citation alone", () => {
      clean();
      file("src/a.ts", 'export const a = "[zZ9]";\n');
      file("docs/specs/other.md", "# Other\n\n**ID:** [Wh8]\n\nAn ID looks like `[zZ9]`; Railyard's is [railyard@f3885:zZ9].\n");
      file(".railyard/method.json", JSON.stringify({ method: "0.2.0", dated: ["docs/reviews/"] }));
      file("docs/reviews/2026-01-01.md", "It cited [zZ9] then.\n");
      assert.deepEqual(run().filter((f) => f.startsWith("BNb")), []);
    });
  });

  describe("[pY5]: a citation of something with an ID is the ID", () => {
    it("reports each old form where what it names exists, with the ID to write", () => {
      clean();
      file("docs/specs/other.md", [
        "# Other", "", "**ID:** [Wh8]", "",
        "As `widget` criterion 2 says, and docs/specs/widget.md, and ADR-002, and principle 1.", "",
      ].join("\n"));
      const found = run().filter((f) => f.startsWith("pY5"));
      for (const [form, id] of [["`widget` criterion 2", "Wc3"], ["docs/specs/widget.md", "Wa1"], ["ADR-002", "Wd4"], ["principle 1", "Wg7"]]) {
        assert.ok(found.some((f) => f.includes(form ?? "") && f.includes(`[${id ?? ""}]`)), `${form ?? ""}:\n${found.join("\n")}`);
      }
    });

    it("reports a spec and a criterion named without backticks, with or without the word spec", () => {
      clean();
      file("docs/specs/other.md", [
        "# Other", "", "**ID:** [Wh8]", "",
        "As widget criterion 2 says (and the widget spec criterion 2, and the widget spec's criterion 2).", "",
        "A gadget criterion 2 names no spec, and neither does the second criterion 2 here.", "",
      ].join("\n"));
      const found = run().filter((f) => f.startsWith("pY5"));
      for (const form of ["widget criterion 2", "widget spec criterion 2", "widget spec's criterion 2"]) {
        assert.ok(found.some((f) => f.includes(`"${form}"`) && f.includes("[Wc3]")), `${form}:\n${found.join("\n")}`);
      }
      assert.equal(found.length, 3, found.join("\n"));
    });

    it("reports a spec naming itself and its criterion once, not twice", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] The widget spins.", "[Wc3] It stops, after widget criterion 1."]);
      const found = run().filter((f) => f.startsWith("pY5") && f.includes("[Wb2]"));
      assert.equal(found.length, 1, found.join("\n"));
    });

    it("reports a waymark's decision cited by its number, however the waymark is named", () => {
      clean();
      file("docs/specs/other.md", "# Other\n\n**ID:** [Wh8]\n\nAs [Wd4] decision 1 says, and ADR-002 decision 1 again.\n");
      const found = run().filter((f) => f.startsWith("pY5") && f.includes("[We5]"));
      assert.equal(found.length, 2, found.join("\n"));
    });

    it("reads an architecture model's descriptions, where a model's prose lives", () => {
      clean();
      file("docs/architecture/m.json", JSON.stringify({ nodes: [{ "unique-id": "a", "node-type": "service", name: "A", description: "Holds `widget` criterion 2, and [zZ9]." }], relationships: [], metadata: { id: "Wm1" } }));
      const found = run();
      assert.ok(found.some((f) => f.startsWith("pY5") && f.includes("docs/architecture/m.json") && f.includes("[Wc3]")), found.join("\n"));
      assert.ok(found.some((f) => f.startsWith("BNb") && f.includes("docs/architecture/m.json") && f.includes("[zZ9]")), found.join("\n"));
    });

    it("reports a spec naming its own criterion by number, outside its Tests table", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] The widget spins.", "[Wc3] It stops, after criterion 1."]);
      assert.ok(run().some((f) => f.startsWith("pY5") && f.includes("criterion 1") && f.includes("[Wb2]")));
    });

    it("leaves a dead form, a quoted form, and a form in a string alone", () => {
      clean();
      file("docs/specs/other.md", "# Other\n\n**ID:** [Wh8]\n\n`gizmo` criterion 3 is gone. The form is ``` `widget` criterion 2 ```, quoted.\n");
      file("src/a.ts", 'export const a = "`widget` criterion 2";\n');
      assert.deepEqual(run().filter((f) => f.startsWith("pY5")), []);
    });

    it("reports an old form in a code comment", () => {
      clean();
      file("src/a.ts", "// As ADR-002 decides.\nexport const a = 1;\n");
      assert.ok(run().some((f) => f.startsWith("pY5") && f.includes("src/a.ts") && f.includes("[Wd4]")));
    });
  });

  describe("[8g5], [BNb], [pY5]: a decision in a spec's own Decisions", () => {
    it("carries its own ID, which a citation resolves, and one with none is reported", () => {
      clean();
      file("docs/specs/widget.md", "# widget\n\n**ID:** [Wa1]\n\n## Acceptance criteria\n\n1. [Wb2] Spins.\n\n## Decisions\n\n1. [Wk4] **Clockwise.** Conventional.\n2. **Fast.** No ID.\n\n## Tests\n\n| Criterion | Test | Status |\n|---|---|---|\n| [Wb2] (x) | `t.test.ts` [1] | Written |\n");
      file("docs/specs/other.md", "# Other\n\n**ID:** [Wh8]\n\nAs [Wk4] decides, and as [Wa1] decision 1 says.\n");
      const found = run();
      assert.deepEqual(found.filter((f) => f.startsWith("BNb")), [], found.join("\n"));
      assert.ok(found.some((f) => f.startsWith("8g5") && f.includes("docs/specs/widget.md") && f.includes("decision 2")), found.join("\n"));
      assert.ok(found.some((f) => f.startsWith("pY5") && f.includes("[Wa1] decision 1") && f.includes("[Wk4]")), found.join("\n"));
      assert.ok(!found.some((f) => f.startsWith("Xtd")), "a decision is not a criterion, and needs no Tests row");
    });

    it("reports a decision written as a bullet or a bold paragraph, in a spec and in a waymark, and leaves prose and what a numbered one holds alone", () => {
      clean();
      file("docs/specs/widget.md", [
        "# widget", "", "**ID:** [Wa1]", "", "## Acceptance criteria", "", "1. [Wb2] Spins.", "",
        "## Decisions", "",
        "Each of these was settled by the owner.", "",
        "1. [Wk4] **Clockwise.** Conventional:",
        "   - held inside the numbered decision,",
        "   **and so is this.**", "",
        "- **A bullet.** Forced.",
        "* **Another bullet.**", "",
        "**A bold paragraph.** Hard-won,",
        "**its second line** is not another.", "",
        "```", "- not a decision, but quoted", "```", "",
        "## Tests", "", "| Criterion | Test | Status |", "|---|---|---|", "| [Wb2] (x) | `t.test.ts` [1] | Written |", "",
      ].join("\n"));
      file("docs/waymarks/005-pick.md", "# Pick\n\n**ID:** [Wm5]\n\n## Decisions\n\n1. [Wn6] **One.**\n\n- **Two.** No ID.\n");
      const found = run().filter((f) => f.startsWith("8g5"));
      for (const [where, what] of [["docs/specs/widget.md:17", "A bullet"], ["docs/specs/widget.md:18", "Another bullet"], ["docs/specs/widget.md:20", "A bold paragraph"], ["docs/waymarks/005-pick.md:9", "Two"]]) {
        assert.ok(found.some((f) => f.includes(`${where ?? ""} `) && f.includes(what ?? "")), `${where ?? ""}\n${found.join("\n")}`);
      }
      assert.equal(found.length, 4, found.join("\n"));
    });
  });

  describe("[98I]: a Tests row's status is one of the method's words", () => {
    it("reports a status in other words, naming the words, and reads what follows a word as a note", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops.", "[Wj1] Rests."], [
        "| [Wb2] (x) | `t.test.ts` [1] | Not met: 30-50% so far |",
        "| [Wc3] (y) | — | Not started |",
        "| [Wj1] (z) | `t.test.ts` [1] | **Failing** — under 1 s |",
      ]);
      const found = run().filter((f) => f.startsWith("98I"));
      assert.equal(found.length, 2, found.join("\n"));
      assert.ok(found.some((f) => f.includes("Not met") && f.includes("Not yet written") && f.includes("Passing")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("Not started")), found.join("\n"));
    });

    it("takes every one of the words, with or without a note", () => {
      clean();
      const words = ["Passing", "Written, for the broker", "Failing", "Partial: standing not measured", "Planned", "Not yet written — Phase 6", "Measured", "Withdrawn 2026-09-15"];
      spec("widget", "Wa1", words.map((_, i) => `[W${String.fromCharCode(97 + i)}9] Item.`), words.map((w, i) => `| [W${String.fromCharCode(97 + i)}9] (x) | — | ${w} |`));
      assert.deepEqual(run().filter((f) => f.startsWith("98I")), []);
    });
  });

  describe("[Xtd]: a spec's Tests table accounts for every criterion, by its ID", () => {
    it("reports a criterion no row names, by its ID", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops.", "[Wj1] Rests."], ["| [Wb2], [Wc3] (x) | `t.test.ts` [1] | Written |"]);
      const found = run().filter((f) => f.startsWith("Xtd"));
      assert.equal(found.length, 1, found.join("\n"));
      assert.ok(found[0]?.includes("[Wj1]"), found.join("\n"));
    });

    it("counts several IDs, joined by commas or and, and a row with a note after them, as naming criteria", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops.", "[Wj1] Rests."], ["| [Wb2] and [Wc3] (x) | `t.test.ts` [1] | Written |", "| [Wj1], on its own (y) | — | Planned |", "| NFRs (under a second) | — | Measured |"]);
      assert.deepEqual(run().filter((f) => f.startsWith("Xtd")), []);
    });

    it("reports a row that names criteria by number, once, with the IDs to write instead", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops.", "[Wj1] Rests."], ["| 1–2 (x) | `t.test.ts` [1] | Written |", "| criterion 3 | — | Planned |"]);
      const found = run().filter((f) => f.startsWith("Xtd"));
      assert.equal(found.length, 2, found.join("\n"));
      assert.ok(found.some((f) => f.includes("widget.md:17") && f.includes("by number") && f.includes("write [Wb2], [Wc3] instead")), found.join("\n"));
      assert.ok(found.every((f) => f.includes("or run `tests-by-id` to carry every such row")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("widget.md:18") && f.includes("write [Wj1] instead")), found.join("\n"));
    });

    it("reports every number of a row by number, those after a note among them, and leaves none unnamed", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops.", "[Wj1] Rests."], ["| 1 (spins, and (nested) more), 3 | `t.test.ts` [1] | Passing |", "| [Wc3] | — | Planned |"]);
      const found = run().filter((f) => f.startsWith("Xtd"));
      assert.equal(found.length, 1, found.join("\n"));
      assert.ok(found[0]?.includes("write [Wb2], [Wj1] instead"), found.join("\n"));
    });

    it("reports a criterion cited by number anywhere in a row, with the ID it names today", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops.", "[Wj1] Rests."], [
        "| [Wb2] (spins — criterion 2) | `t.test.ts` [1] | Written, as criterion 3's row says |",
        "| [Wc3], [Wj1] (criteria 1, 3; and criterion 9) | `t.test.ts` [1] | Written |",
      ]);
      const found = run().filter((f) => f.startsWith("Xtd"));
      assert.equal(found.length, 4, found.join("\n"));
      assert.ok(found.some((f) => f.includes("widget.md:17") && f.includes('"criterion 2"') && f.includes("[Wc3]")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("widget.md:17") && f.includes('"criterion 3"') && f.includes("[Wj1]")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("widget.md:18") && f.includes('"criteria 1, 3"') && f.includes("[Wb2], [Wj1]")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("widget.md:18") && f.includes('"criterion 9"') && f.includes("no criterion is numbered 9")), found.join("\n"));
    });

    it("leaves a count, a tier, a date, a quoted form and another spec's criterion in a row alone", () => {
      clean();
      spec("gadget", "Wm3", ["[Wn4] Hums."]);
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops."], [
        "| [Wb2], [Wc3] (3 retries, 2 of them slow; 2026-09-27; `criterion 2`; M8 criterion 2; mobile-desk criterion 1) | `t.test.ts` [1, 3] | Written, 12 runs |",
      ]);
      assert.deepEqual(run().filter((f) => f.startsWith("Xtd")), []);
    });

    it("keeps every row on its criterion when the criteria are reordered", () => {
      clean();
      spec("widget", "Wa1", ["[Wj1] Rests.", "[Wc3] Stops.", "[Wb2] Spins."], ["| [Wb2] (spins) | `spin.test.ts` [1] | Written |", "| [Wc3] (stops) | `stop.test.ts` [1] | Written |", "| [Wj1] (rests) | — | Planned |"]);
      assert.deepEqual(run().filter((f) => f.startsWith("Xtd")), []);
    });

    it("reports a row naming an ID that is no criterion of its own spec, saying whose it is", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops."], ["| [Wb2], [Wc3] (x) | `t.test.ts` [1] | Written |", "| [Wd4] | `t.test.ts` [1] | Written |"]);
      const found = run().filter((f) => f.startsWith("Xtd"));
      assert.equal(found.length, 1, found.join("\n"));
      assert.ok(found[0]?.includes("[Wd4]") && found[0].includes("docs/waymarks/002-second.md"), found.join("\n"));
    });

    it("reports a criterion both done and not yet written, and a claim with no rows", () => {
      clean();
      spec("widget", "Wa1", ["[Wb2] Spins.", "[Wc3] Stops."], ["| [Wb2], [Wc3] (x) | `t.test.ts` [1] | Written |", "| [Wc3] | — | Not yet written |"]);
      file("docs/specs/empty.md", "# Empty\n\n**ID:** [Wk2]\n\n## Tests\n\nEvery criterion has a test.\n");
      const found = run().filter((f) => f.startsWith("Xtd"));
      assert.ok(found.some((f) => f.includes("widget.md") && f.includes("[Wc3]") && f.includes("Not yet written")), found.join("\n"));
      assert.ok(found.some((f) => f.includes("empty.md") && f.includes("no rows")), found.join("\n"));
    });
  });
});

describe("[v0F]: a citation of another repository resolves where it says it does", () => {
  let base = "";
  let first = "";
  before(() => {
    base = mkdtempSync(join(tmpdir(), "artifacts-elsewhere-"));
    process.env["XDG_CACHE_HOME"] = join(base, "cache");
    const other = join(base, "other");
    mkdirSync(other);
    const g = (...args: string[]): string => execFileSync("git", args, { cwd: other, encoding: "utf8" }).trim();
    g("init", "-q", "-b", "main");
    mkdirSync(join(other, "docs/specs"), { recursive: true });
    const write = (t: string): void => writeFileSync(join(other, "docs/specs/widget.md"), `# Widget\n\n**ID:** [Oa0]\n\n## Acceptance criteria\n\n1. [Oa1] ${t}\n`);
    write("It spins.");
    g("add", "-A");
    g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "one");
    first = g("rev-parse", "HEAD").slice(0, 7);
    write("It spins, fast.");
    g("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-am", "two");
    root = join(base, "here");
    mkdirSync(root);
    clean();
    file(".railyard/method.json", JSON.stringify({ method: "0.2.0", repositories: { other, away: join(base, "nowhere") } }));
  });
  after(() => {
    delete process.env["XDG_CACHE_HOME"];
    rmSync(base, { recursive: true, force: true });
  });

  it("reports a gone ID and an undeclared repository as findings, and a changed citation as a notice", () => {
    file("docs/specs/other.md", `# Other\n\n**ID:** [Wh8]\n\nIt builds on [other@${first}:Oa1], [other@${first}:Zz9] and [nobody@${first}:Oa1].\n`);
    execFileSync("git", ["init", "-q"], { cwd: root });
    const found = checkArtifacts(root).filter((f) => f.rule === "v0F");
    const say = found.map((f) => `${f.notice === true ? "notice" : "finding"}: ${f.message}`).join("\n");
    assert.ok(found.some((f) => f.notice !== true && f.message.includes("Zz9") && f.message.includes("missing")), say);
    assert.ok(found.some((f) => f.notice !== true && f.message.includes("nobody")), say);
    assert.ok(found.some((f) => f.notice === true && f.message.includes(`other@${first}:Oa1`) && f.message.includes("changed since")), say);
  });

  it("reports a citation of a repository it cannot reach as a notice naming what was not checked, never as a finding", () => {
    file("docs/specs/other.md", "# Other\n\n**ID:** [Wh8]\n\nIt builds on [away@abc1234:Oa1].\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    const found = checkArtifacts(root).filter((f) => f.rule === "v0F");
    const say = found.map((f) => `${f.notice === true ? "notice" : "finding"}: ${f.message}`).join("\n");
    assert.equal(found.length, 1, say);
    assert.equal(found[0]?.notice, true, say);
    assert.match(found[0]?.message ?? "", /away@abc1234:Oa1.*could not be checked/, say);
  });

  it("names each line a citation is written on, when it is written on more than one", () => {
    file("docs/specs/other.md", "# Other\n\n**ID:** [Wh8]\n\nIt builds on [away@abc1234:Oa1].\n\nAnd again, [away@abc1234:Oa1].\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    const lines = checkArtifacts(root).filter((f) => f.rule === "v0F").map((f) => /other\.md:(\d+)/.exec(f.message)?.[1]);
    assert.deepEqual(lines, ["5", "7"]);
  });
});

describe("[f4v]: every check, over a repository", () => {
  it("brings the architecture checks and these together, and this repository passes them all", () => {
    // A notice is not this repository's defect ([v0F]): another repository moved on, or cannot be reached from here.
    assert.deepEqual(checkRepository(ROOT).filter((f) => f.notice !== true).map((f) => `${f.rule}: ${f.message}`), []);
  });
});
