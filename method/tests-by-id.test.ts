// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Carrying a repository's Tests rows from criteria's numbers to their IDs ([R6P]).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { testsById } from "./tests-by-id.ts";

const CLI = [join(import.meta.dirname, "../bin/railyard.ts"), "tests-by-id"];

function repository(files: Readonly<Record<string, string>>, body: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "tests-by-id-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const SPEC = [
  "# Export",
  "",
  "**ID:** [Ex0]",
  "",
  "## Acceptance criteria",
  "",
  "1. [Ex1] Exports in the background. Criterion 2 is related.",
  "2. [Ex2] Emails the link.",
  "3. [Ex3] Expires the link.",
  "4. [Ex4] Says when it failed.",
  "",
  "## Non-functional requirements",
  "",
  "- Within 5 minutes.",
  "",
  "## Tests",
  "",
  "| Criterion | Test | Status |",
  "|---|---|---|",
  "| 1 (in the background) | `export.test.ts` [1] | Written |",
  "| 2, 3 against a real mail server | `mail.test.ts` [2] | Written |",
  "| 1–3 (every criterion so far) | `all.test.ts` | Passing |",
  "| criterion 4 | `fail.test.ts` | Written |",
  "| 3 and failure behaviour | `fail.test.ts` | Written |",
  "| NFR (within 5 minutes) | — | Measured |",
  "",
].join("\n");

const CARRIED = [
  "| [Ex1] (in the background) | `export.test.ts` [1] | Written |",
  "| [Ex2], [Ex3] against a real mail server | `mail.test.ts` [2] | Written |",
  "| [Ex1], [Ex2], [Ex3] (every criterion so far) | `all.test.ts` | Passing |",
  "| [Ex4] | `fail.test.ts` | Written |",
  "| [Ex3] and failure behaviour | `fail.test.ts` | Written |",
  "| NFR (within 5 minutes) | — | Measured |",
];

describe("carrying Tests rows from numbers to IDs ([R6P])", () => {
  it("rewrites the numbers and ranges a row opens with to the IDs they name, keeping the rest of the row", () => {
    repository({ "docs/specs/export.md": SPEC, "README.md": "| 1 (not a spec) | x | Written |\n" }, (root) => {
      const report = testsById(root, { write: true });
      assert.deepEqual(report.left, []);
      assert.deepEqual(report.changed, [{ file: "docs/specs/export.md", rows: 5 }]);
      const after = readFileSync(join(root, "docs/specs/export.md"), "utf8");
      const before = SPEC.split("\n");
      const lines = after.split("\n");
      assert.equal(lines.length, before.length, "one line for one line");
      assert.deepEqual(lines.slice(19, 25), CARRIED);
      assert.deepEqual(lines.slice(0, 19), before.slice(0, 19), "nothing above the table changes, the criteria's own words about each other among it");
      assert.equal(readFileSync(join(root, "README.md"), "utf8"), "| 1 (not a spec) | x | Written |\n", "only a spec's Tests table is carried");
    });
  });

  it("changes nothing the second time", () => {
    repository({ "docs/specs/export.md": SPEC }, (root) => {
      testsById(root, { write: true });
      const once = readFileSync(join(root, "docs/specs/export.md"), "utf8");
      const again = testsById(root, { write: true });
      assert.deepEqual(again.changed, []);
      assert.equal(readFileSync(join(root, "docs/specs/export.md"), "utf8"), once);
    });
  });

  it("leaves a row it cannot carry as it was, and names it with why", () => {
    const spec = [
      "# Import", "", "**ID:** [Im0]", "", "## Acceptance criteria", "",
      "1. [Im1] Imports.", "2. Has no ID.", "3. [Im3] One.", "3. [Im4] Two sharing a number.", "",
      "## Tests", "", "| Criterion | Test | Status |", "|---|---|---|",
      "| 1 | `a.test.ts` | Written |",
      "| 2 | `b.test.ts` | Written |",
      "| 3 | `c.test.ts` | Written |",
      "| 1, 9 | `d.test.ts` | Written |", "",
    ].join("\n");
    repository({ "docs/specs/import.md": spec }, (root) => {
      const report = testsById(root, { write: true });
      const lines = readFileSync(join(root, "docs/specs/import.md"), "utf8").split("\n");
      assert.equal(lines[15], "| [Im1] | `a.test.ts` | Written |");
      assert.deepEqual(lines.slice(16, 19), ["| 2 | `b.test.ts` | Written |", "| 3 | `c.test.ts` | Written |", "| 1, 9 | `d.test.ts` | Written |"]);
      assert.deepEqual(report.left.map((l) => l.where), ["docs/specs/import.md:17", "docs/specs/import.md:18", "docs/specs/import.md:19"]);
      assert.match(report.left[0]?.why ?? "", /criterion 2 carries no ID/);
      assert.match(report.left[1]?.why ?? "", /criteria share the number 3/);
      assert.match(report.left[2]?.why ?? "", /no criterion is numbered 9/);
    });
  });

  // Railyard's shapes, 2026-09-27: five rows named a criterion after a note, and were carried as their first alone.
  it("carries every number a row names, before, between and after its notes, and says which criterion a note described", () => {
    const spec = [
      "# Policy", "", "**ID:** [Po0]", "", "## Acceptance criteria", "",
      ...Array.from({ length: 19 }, (_, i) => `${String(i + 1)}. [P${String.fromCharCode(97 + i)}${String(i % 10)}] Criterion.`), "",
      "## Tests", "", "| Criterion | Test | Status |", "|---|---|---|",
      "| 7 (composition, and its precedence where base and overlay set the same property), 19 | `compose.test.ts` [1] | Passing |",
      "| 8 (pinned hook settings: every event (by IP literal)), 9 (the managed-policy directory) | `hooks.test.ts` [1] | Passing |",
      "| 4 (echoed fields are tokens), 12 | `decide.test.ts` [1] | Passing |",
      "| 5, 15, 17, 18, merged configuration (1, 3) | `merge.test.ts` [1] | Written |",
      "| 1–2 (the first two), and 3 | `first.test.ts` [1] | Written |", "",
    ].join("\n");
    repository({ "docs/specs/policy.md": spec }, (root) => {
      const report = testsById(root, { write: true });
      assert.deepEqual(report.left, []);
      const rows = readFileSync(join(root, "docs/specs/policy.md"), "utf8").split("\n").filter((l) => l.startsWith("| [P"));
      assert.deepEqual(rows, [
        "| [Pg6], [Ps8] ([Pg6]: composition, and its precedence where base and overlay set the same property) | `compose.test.ts` [1] | Passing |",
        "| [Ph7], [Pi8] ([Ph7]: pinned hook settings: every event (by IP literal); [Pi8]: the managed-policy directory) | `hooks.test.ts` [1] | Passing |",
        "| [Pd3], [Pl1] ([Pd3]: echoed fields are tokens) | `decide.test.ts` [1] | Passing |",
        "| [Pe4], [Po4], [Pq6], [Pr7], merged configuration (1, 3) | `merge.test.ts` [1] | Written |",
        "| [Pa0], [Pb1], [Pc2] ([Pa0], [Pb1]: the first two) | `first.test.ts` [1] | Written |",
      ]);
    });
  });

  it("leaves a row whole, and names it, where a number after its list may be another criterion", () => {
    const spec = SPEC.replace("| 3 and failure behaviour |", "| 3, failure behaviour, 4 |");
    repository({ "docs/specs/export.md": spec }, (root) => {
      const report = testsById(root, { write: true });
      assert.equal(report.left.length, 1, JSON.stringify(report.left));
      assert.match(report.left[0]?.why ?? "", /4.*may be a criterion/);
      assert.match(readFileSync(join(root, "docs/specs/export.md"), "utf8"), /\| 3, failure behaviour, 4 \|/);
    });
  });

  it("carries a criterion a row cites by number in its text to its ID, lists each, and names what it cannot carry", () => {
    const spec = SPEC.replace(/\n\| Criterion \|[\s\S]*$/, "\n").concat([
      "| Criterion | Test | Status |", "|---|---|---|",
      "| 1 (in the background — criterion 2) | `a.test.ts` [1] | Written, as criterion 3's row says |",
      "| [Ex4] (criteria 1, 3; 3 retries; 2026-09-27; `criterion 2`) | `b.test.ts` [1, 3] | Written |",
      "| [Ex2] (as mobile-desk criterion 4's, and M8 criterion 2) | `c.test.ts` [1] | Written |",
      "| [Ex3] (criterion 9) | `d.test.ts` [1] | Written |", "",
    ].join("\n"));
    repository({ "docs/specs/export.md": spec }, (root) => {
      const report = testsById(root, { write: true });
      const rows = readFileSync(join(root, "docs/specs/export.md"), "utf8").split("\n").filter((l) => /^\| \[/.test(l));
      assert.deepEqual(rows, [
        "| [Ex1] (in the background — [Ex2]) | `a.test.ts` [1] | Written, as [Ex3]'s row says |",
        "| [Ex4] ([Ex1], [Ex3]; 3 retries; 2026-09-27; `criterion 2`) | `b.test.ts` [1, 3] | Written |",
        "| [Ex2] (as mobile-desk criterion 4's, and M8 criterion 2) | `c.test.ts` [1] | Written |",
        "| [Ex3] (criterion 9) | `d.test.ts` [1] | Written |",
      ]);
      assert.deepEqual(report.cited.map((c) => `${c.written} → ${c.to}`), ["criterion 2 → [Ex2]", "criterion 3 → [Ex3]", "criteria 1, 3 → [Ex1], [Ex3]"]);
      assert.deepEqual(report.left.map((l) => l.where), ["docs/specs/export.md:23"]);
      assert.match(report.left[0]?.why ?? "", /no criterion is numbered 9/);
      assert.deepEqual(report.noted.map((n) => n.where), ["docs/specs/export.md:22", "docs/specs/export.md:22"]);
      assert.match(report.noted[0]?.why ?? "", /mobile-desk criterion 4/);
    });
  });

  it("says how many links name a spec it rewrote, and what lists them", () => {
    const links = (entries: readonly (readonly [string, string])[]): string => JSON.stringify({
      format: "railyard-links", formatVersion: "0.1.0", path: "src/a.ts",
      entries: entries.map(([name, id]) => ({ name, witness: "0123456789abcdef", links: [{ id, kind: "asserted", artifact: "0123456789abcdef", at: "2026-09-27" }] })),
    });
    const other = "# Other\n\n**ID:** [Ot0]\n\n## Acceptance criteria\n\n1. [Ot1] Other.\n\n## Tests\n\n| Criterion | Test | Status |\n|---|---|---|\n| [Ot1] | — | Planned |\n";
    repository({
      "docs/specs/export.md": SPEC, "docs/specs/other.md": other,
      "symbols/links/src/a.ts.json": links([["a", "Ex0"], ["b", "Ex0"], ["c", "Ex1"], ["d", "Ot0"]]),
    }, (root) => {
      assert.equal(testsById(root, { write: false }).specLinks, 2, "a link to a criterion, or to a spec it left alone, is not changed");
      const r = spawnSync("node", [...CLI, "--dry-run", root], { encoding: "utf8" });
      assert.match(r.stdout, /2 links name a spec it would rewrite.*`check` lists each/s);
    });
  });

  it("says what it would change on a dry run, and writes nothing", () => {
    repository({ "docs/specs/export.md": SPEC }, (root) => {
      const r = spawnSync("node", [...CLI, "--dry-run", root], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /docs\/specs\/export\.md: 5 rows/);
      assert.equal(readFileSync(join(root, "docs/specs/export.md"), "utf8"), SPEC);
    });
  });

  it("writes, and exits non-zero naming each row it left, from the command", () => {
    const spec = SPEC.replace("| criterion 4 |", "| 7 |");
    repository({ "docs/specs/export.md": spec }, (root) => {
      const r = spawnSync("node", [...CLI, root], { encoding: "utf8" });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /docs\/specs\/export\.md:23: .*no criterion is numbered 7/);
      assert.match(readFileSync(join(root, "docs/specs/export.md"), "utf8"), /\| \[Ex1\] \(in the background\)/);
    });
  });
});
