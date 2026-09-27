// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `npm run evals` runs every case as its own files say it must be run ([xCF]).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evalArgs, flagsFor } from "./evals.ts";

let root = "";

function aCase(name: string, allowed: string, caseYaml?: string): void {
  mkdirSync(join(root, "evals", name, "graders"), { recursive: true });
  writeFileSync(join(root, "evals", name, "prompt.md"), `---\nmax_turns: 4\nallowed_tools: ${allowed}\n---\n\nDo it.\n`);
  if (caseYaml !== undefined) writeFileSync(join(root, "evals", name, "case.yaml"), caseYaml);
}

describe("[xCF]: every case run as its files say", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "evals-args-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("adds nothing where no case needs a repository or a gated tool", () => {
    aCase("plain", "[Skill]");
    aCase("reads", "[Skill, Read, Glob]");
    assert.deepEqual(flagsFor(join(root, "evals")), []);
  });

  it("passes --scaffold where a case names a scaffold script, and grants each gated tool a case lists", () => {
    aCase("plain", "[Skill]");
    aCase("session", `[Skill, Read, Write, Edit, "Bash(python3:*)"]`, `schema_version: "1.0"\nname: session\ncontext:\n  scaffold_script: scaffold.sh\n`);
    aCase("fetches", "[Skill, WebFetch, mcp__docs__read, 'Bash(git log:*)']");
    assert.deepEqual(flagsFor(join(root, "evals")), ["--scaffold", "--allow-tools", "Bash(git log:*)", "Bash(python3:*)", "Edit", "WebFetch", "Write", "mcp__docs__read"]);
  });

  it("grants no tool a case does not list, and a commented scaffold is no scaffold", () => {
    aCase("reads", "[Skill, Read]", "# scaffold_script: scaffold.sh\nname: reads\n");
    assert.deepEqual(flagsFor(join(root, "evals")), []);
  });

  it("keeps the suite's own flags and what the person passes, after the cases' own", () => {
    aCase("session", "[Skill, Write]", "context:\n  scaffold_script: scaffold.sh\n");
    assert.deepEqual(evalArgs(join(root, "evals"), ["--case", "session", "--runs", "1"]), [
      "plugin", "eval", ".", "--ablation", "with-without", "--threshold", "0.8", "--judge-model", "sonnet",
      "--scaffold", "--allow-tools", "Write", "--case", "session", "--runs", "1",
    ]);
  });

  it("reads this repository's cases: the multi-step one gets its repository and its tools", () => {
    assert.deepEqual(flagsFor(join(import.meta.dirname, "../evals")), ["--scaffold", "--allow-tools", "Bash(python3 -m unittest:*)", "Bash(python3 sim/grasp.py:*)", "Edit", "Write"]);
  });
});
