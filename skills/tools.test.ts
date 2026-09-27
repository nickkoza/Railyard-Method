// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [18E] — tier 2. Installing the skill is all it takes: its folder carries its tools, as one
// bundled file, and they run from a copy of that folder alone, in a repository with nothing
// installed. The copy in the repository is what its source builds, so the skill a person copies
// never falls behind the code.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleTools, TOOLS } from "../tools/bundle.ts";

const ROOT = join(import.meta.dirname, "..");
let base = "";
let tool = "";
let repo = "";

function run(...args: string[]): { out: string; err: string; status: number | null } {
  const r = spawnSync("node", [tool, ...args], { cwd: repo, encoding: "utf8" });
  return { out: r.stdout, err: r.stderr, status: r.status };
}

describe("[18E]: the skill carries its tools", () => {
  before(() => {
    base = mkdtempSync(join(tmpdir(), "skill-tools-"));
    // The skill, copied as a person installs it: its folder, and nothing else of this repository.
    cpSync(join(ROOT, "skills/spec-driven-change"), join(base, "skill"), { recursive: true });
    tool = join(base, "skill/tools/railyard.mjs");
    repo = join(base, "repo");
    mkdirSync(join(repo, "docs/specs"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: repo });
    writeFileSync(join(repo, "docs/specs/widget.md"), "# Widget\n\n**ID:** [Wa1]\n\n## Acceptance criteria\n\n1. [Wb2] It spins.\n\n## Tests\n\n| Criterion | Test | Status |\n|---|---|---|\n| [Wb2] | — | Planned |\n");
    mkdirSync(join(repo, ".railyard"));
    writeFileSync(join(repo, ".railyard/method.json"), JSON.stringify({ method: "0.1.0" }));
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "one"], { cwd: repo });
  });

  after(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it("carries what its source builds, byte for byte", () => {
    const fresh = join(base, "fresh.mjs");
    bundleTools(fresh);
    assert.ok(readFileSync(join(ROOT, TOOLS)).equals(readFileSync(fresh)), `${TOOLS} is not what its source builds: run npm run tools:build and commit it`);
  });

  it("tells a linter to leave the bundle alone, in its first lines ([4Ec])", () => {
    const head = readFileSync(join(ROOT, TOOLS), "utf8").split("\n").slice(0, 6).join("\n");
    assert.match(head, /\/\* eslint-disable \*\//);
  });

  it("takes and resolves identifiers from the copy alone", () => {
    const taken = run("ids-take", "2");
    assert.equal(taken.status, 0, taken.err);
    assert.equal(taken.out.trim().split("\n").length, 2);
    const resolved = run("ids-resolve", "Wb2");
    assert.equal(resolved.status, 0, resolved.err);
    assert.match(resolved.out, /\[Wb2\]  a criterion  \(docs\/specs\/widget\.md\)/);
  });

  it("checks the repository, and traces in it", () => {
    const checked = run("check");
    assert.equal(checked.status, 0, checked.out + checked.err);
    const traced = run("trace", "forward", "docs/specs/widget.md");
    assert.equal(traced.status, 0, traced.err);
  });

  it("upgrades the repository it is run in", () => {
    const upgraded = run("upgrade");
    assert.equal(upgraded.status, 0, upgraded.err);
    assert.match(upgraded.out, /0\.1\.0 → 1\.0\.0/);
  });

  it("carries a repository's Tests rows from numbers to IDs, from the copy alone ([R6P])", () => {
    const numbered = join(base, "numbered");
    mkdirSync(join(numbered, "docs/specs"), { recursive: true });
    const spec = "# Gear\n\n**ID:** [Ga1]\n\n## Acceptance criteria\n\n1. [Gb2] It turns.\n\n## Tests\n\n| Criterion | Test | Status |\n|---|---|---|\n| 1 | — | Planned |\n";
    writeFileSync(join(numbered, "docs/specs/gear.md"), spec);
    const dry = spawnSync("node", [tool, "tests-by-id", "--dry-run"], { cwd: numbered, encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /docs\/specs\/gear\.md: 1 row would be carried/);
    assert.equal(readFileSync(join(numbered, "docs/specs/gear.md"), "utf8"), spec);
    const done = spawnSync("node", [tool, "tests-by-id"], { cwd: numbered, encoding: "utf8" });
    assert.equal(done.status, 0, done.stderr);
    assert.match(readFileSync(join(numbered, "docs/specs/gear.md"), "utf8"), /\| \[Gb2\] \| — \| Planned \|/);
  });

  it("numbers a repository's decisions with IDs, from the copy alone ([RVv])", () => {
    const decided = join(base, "decided");
    mkdirSync(join(decided, "docs/specs"), { recursive: true });
    const spec = "# Gear\n\n**ID:** [Ga1]\n\n## Acceptance criteria\n\n1. [Gb2] It turns.\n\n## Decisions\n\n- **Steel.**\n\n## Tests\n\n| Criterion | Test | Status |\n|---|---|---|\n| [Gb2] | — | Planned |\n";
    writeFileSync(join(decided, "docs/specs/gear.md"), spec);
    execFileSync("git", ["init", "-q"], { cwd: decided });
    const dry = spawnSync("node", [tool, "decisions-by-id", "--dry-run"], { cwd: decided, encoding: "utf8" });
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /docs\/specs\/gear\.md: 1 decision would be numbered/);
    assert.equal(readFileSync(join(decided, "docs/specs/gear.md"), "utf8"), spec);
    const done = spawnSync("node", [tool, "decisions-by-id"], { cwd: decided, encoding: "utf8" });
    assert.equal(done.status, 0, done.stderr);
    assert.match(readFileSync(join(decided, "docs/specs/gear.md"), "utf8"), /\n1\. \[[A-Za-z0-9]{3}\] \*\*Steel\.\*\*\n/);
  });

  it("records the method in a repository it has not worked in", () => {
    const bare = join(base, "bare");
    mkdirSync(bare);
    execFileSync("git", ["init", "-q"], { cwd: bare });
    const r = spawnSync("node", [tool, "upgrade"], { cwd: bare, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /recorded it at \d+\.\d+\.\d+/);
    assert.match(readFileSync(join(bare, ".railyard/method.json"), "utf8"), /"method": "\d+\.\d+\.\d+"/);
  });

  it("installs itself into a project from wherever it is, and says so", () => {
    const fresh = join(base, "fresh-project");
    mkdirSync(fresh);
    execFileSync("git", ["init", "-q"], { cwd: fresh });
    const r = spawnSync("node", [tool, "install"], { cwd: fresh, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /copied into \.claude\/skills\/spec-driven-change/);
    assert.match(r.stdout, /\.claude\/skills\/ holds generated files.*linter/s);
    assert.ok(readFileSync(join(fresh, ".claude/skills/spec-driven-change/SKILL.md"), "utf8").startsWith("---"));
    assert.match(readFileSync(join(fresh, ".claude/settings.json"), "utf8"), /scan --hook/);
    const again = spawnSync("node", [tool, "install"], { cwd: fresh, encoding: "utf8" });
    assert.match(again.stdout, /Nothing changed/);
  });

  it("says how to use it when given no command or an unknown one", () => {
    for (const args of [[], ["nonsense"]]) {
      const r = run(...args);
      assert.equal(r.status, 2);
      assert.match(r.err, /check.*trace.*ids-take.*ids-resolve.*upgrade.*install.*tests-by-id.*decisions-by-id/s);
    }
  });

  it("prints usage and exits 0 for --help and -h, at the top level, rather than the no-command error", () => {
    for (const flag of ["--help", "-h"]) {
      const r = run(flag);
      assert.equal(r.status, 0, r.err);
      assert.match(r.out, /check.*trace.*ids-take.*ids-resolve.*upgrade.*install.*tests-by-id.*decisions-by-id/s);
    }
  });

  it("prints check's own usage for check --help, rather than running the check", () => {
    const r = run("check", "--help");
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /usage:.*check/is);
    assert.ok(!/No findings|^\d+ findings?/m.test(r.out), `check --help ran the check instead of printing help:\n${r.out}`);
  });

  it("stops quietly when its reader closes early, as `links <file> | head` does", async () => {
    // Enough output to outlast a pipe's buffer, so the command is still writing when the reader goes.
    writeFileSync(join(repo, "many.ts"), Array.from({ length: 3000 }, (_, i) => `export function thing${String(i)}(): number { return ${String(i)}; }\n`).join(""));
    const child = spawn("node", [tool, "links", "many.ts"], { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.setEncoding("utf8").on("data", (d: string) => { err += d; });
    child.stdout.once("data", () => { child.stdout.destroy(); });
    const status = await new Promise<number | null>((done) => { child.on("close", (code) => { done(code); }); });
    assert.doesNotMatch(err, /EPIPE|Error|at /, err);
    assert.equal(status, 0, err);
  });

  it("says nothing was linked, and fails, when unlink names nothing that was ever linked", () => {
    const r = run("unlink", "docs/specs/widget.md#nothere", "Zz9");
    assert.notEqual(r.status, 0, r.out);
    assert.match(r.err, /nothing (was )?linked/i);
  });
});
