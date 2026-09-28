// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [o7Y], the upgrades themselves — tier 1, over a temp root. A repository laid out under an older
// version is carried forward: what the method owns is moved, what the repository owns is reported.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { MARKER, METHOD_VERSION, readMethodVersion } from "./version.ts";
import { STEPS, upgrade } from "./upgrade.ts";

let root = "";

function file(path: string, body: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

function marker(fields: Record<string, unknown>): void {
  file(MARKER, `${JSON.stringify(fields, null, 2)}\n`);
}

/** A repository as 0.1.0 laid it out. */
function laidOutAt010(): void {
  marker({ method: "0.1.0", dated: ["docs/reviews/"] });
  file("architecture/model.json", "{}\n");
  file("architecture/controls/a.json", "{}\n");
  file("docs/adr/001-first.md", "# First\n");
  file("docs/specs/x.md", "# X\n");
}

describe("[o7Y]: carrying a repository from 0.1.0 to 0.2.0", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "upgrade-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("works to 1.0.1, the version the skill is", async () => {
    assert.equal(METHOD_VERSION, "1.0.1");
  });

  it("moves the architecture models and the waymarks under docs/, and everything inside them", async () => {
    laidOutAt010();
    const done = await upgrade(root);
    assert.equal(done.done, "upgraded", JSON.stringify(done));
    assert.ok(existsSync(join(root, "docs/architecture/model.json")));
    assert.ok(existsSync(join(root, "docs/architecture/controls/a.json")));
    assert.ok(existsSync(join(root, "docs/waymarks/001-first.md")));
    assert.ok(!existsSync(join(root, "architecture")));
    assert.ok(!existsSync(join(root, "docs/adr")));
    assert.ok(existsSync(join(root, "docs/specs/x.md")), "what did not move is left where it was");
  });

  it("records the new version and keeps every other field of the marker", async () => {
    laidOutAt010();
    await upgrade(root);
    assert.equal(readMethodVersion(root), METHOD_VERSION);
    const kept = JSON.parse(readFileSync(join(root, MARKER), "utf8")) as { dated?: unknown };
    assert.deepEqual(kept.dated, ["docs/reviews/"]);
  });

  it("lists the repository's files that still name an old path, and rewrites none of them", async () => {
    laidOutAt010();
    const script = "calm validate -a architecture/model.json\n";
    const prose = "Decisions live in `docs/adr/`. Good architecture matters; see docs/adr-numbers.md.\n";
    file("package.json", script);
    file("CLAUDE.md", prose);
    const done = await upgrade(root);
    assert.equal(done.done, "upgraded");
    if (done.done !== "upgraded") return;
    assert.deepEqual(done.stillNaming.map((s) => s.file).sort(), ["CLAUDE.md", "package.json"]);
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), script, "listed, not rewritten");
    assert.equal(readFileSync(join(root, "CLAUDE.md"), "utf8"), prose);
  });

  it("leaves out documents the repository says record a moment, and what git ignores", async () => {
    laidOutAt010();
    marker({ method: "0.1.0", dated: ["docs/reviews/"] });
    file("docs/reviews/2026-09-01.md", "Reviewed docs/adr/ that day.\n");
    file(".gitignore", "dist/\n");
    file("dist/built.js", "// see architecture/model.json\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    const done = await upgrade(root);
    assert.ok(done.done === "upgraded" && done.stillNaming.length === 0, JSON.stringify(done));
  });

  it("does not take the word, a new path or a sibling file for an old path", async () => {
    laidOutAt010();
    file("README.md", "The architecture is in docs/architecture/. The register is docs/adr-numbers.md.\n");
    const done = await upgrade(root);
    assert.ok(done.done === "upgraded" && done.stillNaming.length === 0, JSON.stringify(done));
  });

  it("refuses when a destination already exists, and changes nothing", async () => {
    laidOutAt010();
    file("docs/waymarks/002-other.md", "# Other\n");
    const done = await upgrade(root);
    assert.equal(done.done, "refused");
    assert.ok(existsSync(join(root, "architecture/model.json")), "the first move was not made either");
    assert.ok(existsSync(join(root, "docs/adr/001-first.md")));
    assert.equal(readMethodVersion(root), "0.1.0");
  });

  it("upgrades a repository that never had one of the old directories", async () => {
    marker({ method: "0.1.0" });
    file("docs/adr/001-first.md", "# First\n");
    const done = await upgrade(root);
    assert.equal(done.done, "upgraded");
    assert.ok(existsSync(join(root, "docs/waymarks/001-first.md")));
  });

  it("writes the marker at its own version where there is none, and says so", async () => {
    file("src/a.py", "x = 1\n");
    const done = await upgrade(root);
    assert.deepEqual(done, { done: "recorded", version: METHOD_VERSION });
    assert.equal(readMethodVersion(root), METHOD_VERSION);
  });

  it("does nothing to a repository already at this version, and refuses one from the future", async () => {
    marker({ method: METHOD_VERSION });
    assert.equal((await upgrade(root)).done, "nothing");
    marker({ method: "9.0.0" });
    assert.equal((await upgrade(root)).done, "refused");
  });
});

// The 1.0.0 upgrade is built before the release bumps METHOD_VERSION to it, so it is tested with the
// version injected, as the release will set it.
describe("[o7Y]: carrying a repository to 1.0.0, its Tests rows to IDs", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "upgrade-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const spec = (row: string): string => [
    "# Gear", "", "**ID:** [Ga0]", "", "## Acceptance criteria", "", "1. [Ga1] It turns.", "2. [Ga2] It stops.", "",
    "## Tests", "", "| Criterion | Test | Status |", "|---|---|---|", row, "",
  ].join("\n");

  it("carries every Tests row to IDs, and records 1.0.0", async () => {
    marker({ method: "0.2.0" });
    file("docs/specs/gear.md", spec("| 1 (turns — criterion 2), 2 | `gear.test.ts` | Passing |"));
    const done = await upgrade(root, "1.0.0");
    assert.equal(done.done, "upgraded", JSON.stringify(done));
    if (done.done !== "upgraded") return;
    assert.match(readFileSync(join(root, "docs/specs/gear.md"), "utf8"), /\| \[Ga1\], \[Ga2\] \(\[Ga1\]: turns — \[Ga2\]\) \| `gear\.test\.ts` \| Passing \|/);
    assert.deepEqual(done.carried?.changed, [{ file: "docs/specs/gear.md", rows: 1 }]);
    assert.equal(readMethodVersion(root), "1.0.0");
  });

  it("refuses, naming each row it cannot carry, and changes nothing, a move among them", async () => {
    marker({ method: "0.1.0" });
    file("architecture/model.json", "{}\n");
    const before = spec("| 3 | `gear.test.ts` | Passing |");
    file("docs/specs/gear.md", before);
    const done = await upgrade(root, "1.0.0");
    assert.equal(done.done, "refused");
    if (done.done !== "refused") return;
    assert.match(done.why, /docs\/specs\/gear\.md:14.*no criterion is numbered 3/s);
    assert.equal(readFileSync(join(root, "docs/specs/gear.md"), "utf8"), before);
    assert.ok(existsSync(join(root, "architecture/model.json")), "no move was made either");
    assert.equal(readMethodVersion(root), "0.1.0");
  });

  it("leaves the rows alone while the method is below 1.0.0", async () => {
    marker({ method: "0.1.0" });
    const before = spec("| 1 | `gear.test.ts` | Passing |");
    file("docs/specs/gear.md", before);
    assert.equal((await upgrade(root, "0.2.0")).done, "upgraded");
    assert.equal(readFileSync(join(root, "docs/specs/gear.md"), "utf8"), before);
  });
});

describe("[o7Y], [RVv]: carrying a repository to 1.0.0, its decisions to numbered decisions with IDs", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "upgrade-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const spec = (decisions: readonly string[]): string => [
    "# Gear", "", "**ID:** [Ga0]", "", "## Acceptance criteria", "", "1. [Ga1] It turns.", "",
    "## Decisions", "", ...decisions, "",
    "## Tests", "", "| Criterion | Test | Status |", "|---|---|---|", "| [Ga1] | `gear.test.ts` | Passing |", "",
  ].join("\n");
  const commit = (): void => {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "laid out"], { cwd: root });
  };

  it("numbers every decision with a fresh ID, a waymark's that moves among them, and says so", async () => {
    marker({ method: "0.1.0" });
    file("docs/specs/gear.md", spec(["- **Steel.** Forced."]));
    file("docs/adr/001-oil.md", "# Oil\n\n**ID:** [Oi0]\n\n## Decisions\n\n**Synthetic.** Hard-won.\n");
    commit();
    const done = await upgrade(root, "1.0.0");
    assert.equal(done.done, "upgraded", JSON.stringify(done));
    if (done.done !== "upgraded") return;
    assert.match(readFileSync(join(root, "docs/specs/gear.md"), "utf8"), /\n1\. \[[A-Za-z0-9]{3}\] \*\*Steel\.\*\* Forced\./);
    assert.match(readFileSync(join(root, "docs/waymarks/001-oil.md"), "utf8"), /\n1\. \[[A-Za-z0-9]{3}\] \*\*Synthetic\.\*\* Hard-won\./);
    assert.deepEqual(done.decisions?.changed, [{ file: "docs/specs/gear.md", decisions: 1 }, { file: "docs/waymarks/001-oil.md", decisions: 1 }]);
    assert.equal(readMethodVersion(root), "1.0.0");
  });

  it("refuses, naming each section it cannot carry, and changes nothing, a move among them", async () => {
    marker({ method: "0.1.0" });
    file("architecture/model.json", "{}\n");
    const before = spec(["**Parent.**", "", "- **Detail, or a decision?**"]);
    file("docs/specs/gear.md", before);
    commit();
    const done = await upgrade(root, "1.0.0");
    assert.equal(done.done, "refused");
    if (done.done !== "refused") return;
    assert.match(done.why, /decisions.*docs\/specs\/gear\.md:\d+.*list/s);
    assert.equal(readFileSync(join(root, "docs/specs/gear.md"), "utf8"), before);
    assert.ok(existsSync(join(root, "architecture/model.json")), "no move was made either");
    assert.equal(readMethodVersion(root), "0.1.0");
  });

  it("refuses where decisions need IDs and no ID can be taken, outside git, and changes nothing", async () => {
    marker({ method: "0.2.0" });
    const before = spec(["- **Steel.**"]);
    file("docs/specs/gear.md", before);
    const done = await upgrade(root, "1.0.0");
    assert.equal(done.done, "refused");
    if (done.done !== "refused") return;
    assert.match(done.why, /no ID/);
    assert.equal(readFileSync(join(root, "docs/specs/gear.md"), "utf8"), before);
    assert.equal(readMethodVersion(root), "0.2.0");
  });

  it("leaves the decisions alone while the method is below 1.0.0", async () => {
    marker({ method: "0.1.0" });
    const before = spec(["- **Steel.**"]);
    file("docs/specs/gear.md", before);
    assert.equal((await upgrade(root, "0.2.0")).done, "upgraded");
    assert.equal(readFileSync(join(root, "docs/specs/gear.md"), "utf8"), before);
  });
});

describe("[o7Y]: the version a skill works to", () => {
  it("is never older than the newest upgrade it carries, or that upgrade never runs", () => {
    const newest = STEPS.at(-1)?.to ?? "0.0.0";
    const [mine, theirs] = [METHOD_VERSION, newest].map((v) => v.split(".").map(Number));
    const order = [0, 1, 2].map((i) => (mine?.[i] ?? 0) - (theirs?.[i] ?? 0)).find((d) => d !== 0) ?? 0;
    assert.ok(order >= 0, `the skill works to ${METHOD_VERSION} and carries an upgrade to ${newest}: a repository at ${METHOD_VERSION} reads as current, and the upgrade never runs`);
  });
});
