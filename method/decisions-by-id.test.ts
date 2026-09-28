// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Carrying a repository's decisions from bullets and bold paragraphs to numbered decisions with IDs ([RVv]).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { carryDecisions, decisionsById } from "./decisions-by-id.ts";
import { unnumberedDecisions } from "./spec-shape.ts";

const CLI = [join(import.meta.dirname, "../bin/railyard.ts"), "decisions-by-id"];

function repository(files: Readonly<Record<string, string>>, body: (root: string) => Promise<void> | void, git = false): Promise<void> | void {
  const root = mkdtempSync(join(tmpdir(), "decisions-by-id-"));
  const done = (): void => { rmSync(root, { recursive: true, force: true }); };
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    if (git) {
      execFileSync("git", ["init", "-q"], { cwd: root });
      execFileSync("git", ["add", "-A"], { cwd: root });
      execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "specs"], { cwd: root });
    }
    const r = body(root);
    if (r instanceof Promise) return r.finally(done);
    done();
  } catch (e) {
    done();
    throw e;
  }
  return undefined;
}

const HEAD = ["# Export", "", "**ID:** [Ex0]", "", "## Acceptance criteria", "", "1. [Ex1] Exports.", ""];
const TAIL = ["## Tests", "", "| Criterion | Test | Status |", "|---|---|---|", "| [Ex1] | `a.test.ts` | Written |", ""];
const spec = (decisions: readonly string[]): string => [...HEAD, "## Decisions", "", ...decisions, "", ...TAIL].join("\n");

const IDS = ["Aa1", "Bb2", "Cc3", "Dd4", "Ee5", "Ff6", "Gg7", "Hh8", "Ii9", "Jj0", "Kk1", "Ll2"];

describe("carrying decisions to numbered decisions with IDs ([RVv])", () => {
  it("numbers a bullet, a bold paragraph and a numbered decision with no ID, keeping an ID already carried", () => {
    const text = spec([
      "Each is pinned here.",
      "",
      "- **The link expires after a day.** Forced: the provider keeps",
      "  nothing longer.",
      "- **The file is zipped.**",
      "",
      "**Retries are three.** Hard-won:",
      "a fourth never succeeded.",
      "",
      "4. [Kp1] **Kept.** Already numbered.",
      "",
      "7. **Numbered, no ID.**",
    ]);
    const carried = carryDecisions("docs/specs/export.md", text, IDS);
    assert.deepEqual(carried.left, []);
    assert.equal(carried.count, 4);
    const lines = carried.text.split("\n");
    const at = lines.indexOf("## Decisions");
    assert.deepEqual(lines.slice(at, at + 15), [
      "## Decisions",
      "",
      "Each is pinned here.",
      "",
      "1. [Aa1] **The link expires after a day.** Forced: the provider keeps",
      "   nothing longer.",
      "2. [Bb2] **The file is zipped.**",
      "",
      "3. [Cc3] **Retries are three.** Hard-won:",
      "   a fourth never succeeded.",
      "",
      "4. [Kp1] **Kept.** Already numbered.",
      "",
      "5. [Dd4] **Numbered, no ID.**",
      "",
    ]);
    assert.deepEqual(unnumberedDecisions(carried.text), [], "the check finds nothing left to number");
    assert.equal(carried.text.split("\n").slice(0, at).join("\n"), text.split("\n").slice(0, at).join("\n"), "nothing above Decisions changes");
    assert.ok(carried.text.endsWith(TAIL.join("\n")), "nothing below Decisions changes");
  });

  it("keeps an already-ID'd decision's continuation lines at their own indent, alongside one still to number", () => {
    const text = spec([
      "- **New one.**",
      "",
      "1. [Kp1] **Kept.** Forced: the provider explains",
      "   why over more than one line.",
    ]);
    const carried = carryDecisions("docs/specs/export.md", text, IDS);
    assert.deepEqual(carried.left, []);
    assert.equal(carried.count, 1);
    const lines = carried.text.split("\n");
    const at = lines.indexOf("## Decisions");
    assert.deepEqual(lines.slice(at + 2, at + 6), [
      "1. [Aa1] **New one.**",
      "",
      "2. [Kp1] **Kept.** Forced: the provider explains",
      "   why over more than one line.",
    ]);
  });

  it("indents what follows a decision inside it, a table and a view among it, so a view is still read", () => {
    const text = spec([
      "**The layout.** Pinned because two readers read it.",
      "",
      "It is not a published format.",
      "",
      "| Section | Holds |",
      "|---|---|",
      "| Header | magic |",
      "",
      "```mermaid",
      "%% view-of: docs/architecture/m.json",
      "flowchart LR",
      "  a --> b",
      "```",
      "",
      "**Next.**",
    ]);
    const carried = carryDecisions("docs/specs/export.md", text, IDS);
    assert.deepEqual(carried.left, []);
    const lines = carried.text.split("\n");
    const at = lines.indexOf("## Decisions");
    assert.deepEqual(lines.slice(at + 2, at + 17), [
      "1. [Aa1] **The layout.** Pinned because two readers read it.",
      "",
      "   It is not a published format.",
      "",
      "   | Section | Holds |",
      "   |---|---|",
      "   | Header | magic |",
      "",
      "   ```mermaid",
      "   %% view-of: docs/architecture/m.json",
      "   flowchart LR",
      "     a --> b",
      "   ```",
      "",
      "2. [Bb2] **Next.**",
    ]);
    // The check reads a view as a fence opened and closed at the same indent, which this keeps.
    assert.equal([...carried.text.matchAll(/^([ \t]*)```mermaid\n([\s\S]*?)^\1```/gm)].length, 1, "the view is still read as a view");
  });

  it("indents by the width of the number once there are ten", () => {
    const text = spec(Array.from({ length: 10 }, (_, i) => `- **D${String(i + 1)}.**\n  more.`));
    const carried = carryDecisions("docs/specs/export.md", text, IDS);
    assert.deepEqual(carried.left, []);
    assert.match(carried.text, /\n9\. \[Ii9\] \*\*D9\.\*\*\n {3}more\.\n10\. \[Jj0\] \*\*D10\.\*\*\n {4}more\./);
  });

  it("carries a waymark's decisions as a spec's", () => {
    const waymark = "# Zip\n\n**Date:** 2026-09-24 · **ID:** [Zp0]\n\n## Context\n\n- a context bullet\n\n## Decisions\n\n- **Zip it.**\n";
    repository({ "docs/waymarks/001-zip.md": waymark }, (root) => {
      const plan = decisionsById(root, { write: false });
      return plan.then((report) => {
        assert.deepEqual(report.changed, [{ file: "docs/waymarks/001-zip.md", decisions: 1 }]);
        assert.equal(readFileSync(join(root, "docs/waymarks/001-zip.md"), "utf8"), waymark, "a dry run writes nothing");
      });
    });
  });

  it("refuses a section it cannot be sure of, names it, and changes nothing in it", () => {
    const cases: readonly (readonly [string, readonly string[], RegExp])[] = [
      ["a list after a bold decision", ["**How it is resolved.** Fetched.", "", "- **All branches.** Forced.", "- **Hooks off.**"], /list.*follows the decision at .*:\d+/],
      ["a list after a numbered one", ["1. [Nu1] **Kept.**", "", "- **Another?**"], /list.*follows the decision/],
      ["a paragraph ending in a colon", ["- **One.**", "", "The rest are hard-won:", "", "**Two.** More."], /ends in a colon/],
      ["a bold introducer ending in a colon", ["**Hard-won, each paid for once:**", "", "**Two.** More."], /ends in a colon/],
      ["an open fence", ["- **One.**", "", "```", "never closed"], /fenced block.*never closed/],
    ];
    for (const [name, decisions, why] of cases) {
      const text = spec(decisions);
      const carried = carryDecisions("docs/specs/export.md", text, IDS);
      assert.equal(carried.text, text, `${name}: nothing changed`);
      assert.equal(carried.count, 0, name);
      assert.ok(carried.left.length >= 1, `${name}: ${JSON.stringify(carried.left)}`);
      assert.match(carried.left[0]?.where ?? "", /^docs\/specs\/export\.md:\d+$/, name);
      assert.match(carried.left[0]?.why ?? "", why, name);
    }
  });

  it("names every place in a section it cannot be sure of, not only the first", () => {
    const carried = carryDecisions("docs/specs/export.md", spec(["**One.**", "", "- **A?**", "", "**Two.**", "", "- **B?**"]), IDS);
    assert.equal(carried.left.length, 2, JSON.stringify(carried.left));
  });

  it("takes an intro list's items as the decisions, since nothing above them is one", () => {
    const text = spec(["The decisions so far:", "", "- **One.**", "- **Two.**"]);
    const carried = carryDecisions("docs/specs/export.md", text, IDS);
    assert.deepEqual(carried.left, []);
    assert.equal(carried.count, 2);
  });

  it("leaves a section whose decisions all carry IDs exactly as it is, its numbering among it", () => {
    const text = spec(["1. [Kp1] **One.**", "", "Hard-won, the rest:", "", "5. [Kp2] **Two.**"]);
    const carried = carryDecisions("docs/specs/export.md", text, IDS);
    assert.equal(carried.text, text);
    assert.equal(carried.count, 0);
    assert.deepEqual(carried.left, []);
  });

  it("writes with IDs taken by the minting rule, none the repository mentions, and changes nothing the second time", async () => {
    const text = spec(["- **One.**", "- **Two.**"]);
    await repository({ "docs/specs/export.md": text }, async (root) => {
      const report = await decisionsById(root, { write: true });
      assert.deepEqual(report.left, []);
      assert.deepEqual(report.changed, [{ file: "docs/specs/export.md", decisions: 2 }]);
      const after = readFileSync(join(root, "docs/specs/export.md"), "utf8");
      const ids = [...after.matchAll(/^\d+\. \[([A-Za-z0-9]{3})\]/gm)].map((m) => m[1] ?? "");
      assert.equal(ids.length, 3, "the criterion and two decisions");
      const minted = ids.slice(1);
      assert.notEqual(minted[0], minted[1]);
      for (const id of minted) assert.ok(!text.includes(id), `${id} was mentioned before`);
      const again = await decisionsById(root, { write: true });
      assert.deepEqual(again.changed, []);
      assert.equal(readFileSync(join(root, "docs/specs/export.md"), "utf8"), after);
    }, true);
  });

  it("says how many links name an artifact it would rewrite", async () => {
    const links = JSON.stringify({
      format: "railyard-links", formatVersion: "0.1.0", path: "src/a.ts",
      entries: [{ name: "a", witness: "0123456789abcdef", links: [{ id: "Ex0", kind: "asserted", artifact: "0123456789abcdef", at: "2026-09-27" }] }],
    });
    await repository({ "docs/specs/export.md": spec(["- **One.**"]), "symbols/links/src/a.ts.json": links }, async (root) => {
      assert.equal((await decisionsById(root, { write: false })).specLinks, 1);
    });
  });

  it("from the command: a dry run says what it would change and writes nothing; a run writes and exits non-zero naming what it left", async () => {
    const good = spec(["- **One.**"]);
    const bad = spec(["**Parent.**", "", "- **Child?**"]).replace("[Ex0]", "[Ey0]").replace("[Ex1]", "[Ey1]");
    await repository({ "docs/specs/export.md": good, "docs/specs/other.md": bad }, (root) => {
      const dry = spawnSync("node", [...CLI, "--dry-run", root], { encoding: "utf8" });
      assert.equal(dry.status, 1, dry.stdout + dry.stderr);
      assert.match(dry.stdout, /docs\/specs\/export\.md: 1 decision would be numbered/);
      assert.match(dry.stderr, /docs\/specs\/other\.md:\d+: left as it was, .*list/);
      assert.equal(readFileSync(join(root, "docs/specs/export.md"), "utf8"), good);
      const run = spawnSync("node", [...CLI, root], { encoding: "utf8" });
      assert.equal(run.status, 1, run.stdout + run.stderr);
      assert.match(readFileSync(join(root, "docs/specs/export.md"), "utf8"), /\n1\. \[[A-Za-z0-9]{3}\] \*\*One\.\*\*/);
      assert.equal(readFileSync(join(root, "docs/specs/other.md"), "utf8"), bad);
    }, true);
  });

  it("refuses to write outside a git repository, since no ID can be taken there, and changes nothing", () => {
    const text = spec(["- **One.**"]);
    repository({ "docs/specs/export.md": text }, (root) => {
      const r = spawnSync("node", [...CLI, root], { encoding: "utf8" });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /no ID/);
      assert.equal(readFileSync(join(root, "docs/specs/export.md"), "utf8"), text);
    });
  });
});
