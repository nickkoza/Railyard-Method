#!/usr/bin/env node
// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `npm run evals`: runs the skill's evaluations, each case as its own files say it must be run
// ([xCF]). `claude plugin eval` takes `--scaffold` and `--allow-tools` for the whole suite, not per
// case, so they are read from the cases here rather than remembered by whoever runs it: a case that
// names a `scaffold_script` needs `--scaffold`, and one that lists a gated tool in its
// `allowed_tools` needs that tool granted. Both reach only the cases that ask (the skill spec's
// Decisions), so no other case is given anything.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** What every run of the suite passes: the ablation, the bar and the judge (the skill spec's Decisions). */
const SUITE = ["--ablation", "with-without", "--threshold", "0.8", "--judge-model", "sonnet"];

/** The tools `claude plugin eval` gates behind `--allow-tools` (its help, Claude Code 2.1.283). */
const GATED = /^(?:Bash(?:\(.*\))?|Write|Edit|WebFetch|mcp__.+)$/;

/** The tools a case's prompt frontmatter lists in `allowed_tools`, as written. */
function allowedTools(prompt: string): string[] {
  const front = /^---\n([\s\S]*?)\n---/.exec(prompt)?.[1] ?? "";
  const list = /^allowed_tools:\s*\[(.*)\]\s*$/m.exec(front)?.[1] ?? "";
  return list.split(",").map((t) => t.trim().replace(/^(["'])(.*)\1$/, "$2")).filter((t) => t !== "");
}

/** Whether a case's `case.yaml` names a scaffold script, outside a comment. */
function scaffolds(caseYaml: string): boolean {
  return caseYaml.split("\n").some((l) => /^\s*scaffold_script:\s*\S/.test(l));
}

/** The flags the cases under `evalsDir` need between them: `--scaffold`, and `--allow-tools` with each gated tool a case lists. */
export function flagsFor(evalsDir: string): string[] {
  let scaffold = false;
  const tools = new Set<string>();
  for (const entry of readdirSync(evalsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(evalsDir, entry.name);
    const caseYaml = join(dir, "case.yaml");
    if (existsSync(caseYaml) && scaffolds(readFileSync(caseYaml, "utf8"))) scaffold = true;
    const prompt = join(dir, "prompt.md");
    if (existsSync(prompt)) for (const t of allowedTools(readFileSync(prompt, "utf8"))) if (GATED.test(t)) tools.add(t);
  }
  const flags: string[] = scaffold ? ["--scaffold"] : [];
  if (tools.size > 0) flags.push("--allow-tools", ...[...tools].sort());
  return flags;
}

/** The arguments to `claude`: the suite's, the cases', then whatever the person passed. */
export function evalArgs(evalsDir: string, passed: readonly string[]): string[] {
  return ["plugin", "eval", ".", ...SUITE, ...flagsFor(evalsDir), ...passed];
}

function isTheProgram(): boolean {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  try {
    return realpathSync(invoked) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isTheProgram()) {
  const run = spawnSync("claude", evalArgs(join(process.cwd(), "evals"), process.argv.slice(2)), { stdio: "inherit" });
  process.exitCode = run.status ?? 1;
}
