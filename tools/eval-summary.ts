#!/usr/bin/env node
// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `npm run evals:summary`: folds each evaluation run in `evals/results/` into `evals/RESULTS.md`
// ([6HK]). The summary shows that the skill is evaluated and what it scored: each run's date, the
// Claude Code version, the cost, and every case's score with the skill and without it. The full
// reports, with the agents' transcripts, stay on the machine that ran them.
//
// A run is added once, and what the summary already holds is kept when the full results are gone:
// it is a record of what happened, not a view of what is on disk.
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/** Only what the summary reads, validated: the result file is another tool's. */
const Result = z.looseObject({
  claudeVersion: z.string().optional(),
  costUsd: z.number().optional(),
  cases: z.array(z.looseObject({
    name: z.string(),
    runsPerCase: z.number().optional(),
    // The runs each arm actually made: more than `runsPerCase` when the command asked for more.
    arms: z.looseObject({ with: z.array(z.unknown()).optional() }).optional(),
    aggregates: z.looseObject({ score: z.number(), scoreWithout: z.number().optional(), delta: z.number().optional() }),
  })),
  aggregates: z.looseObject({ meanDelta: z.number().optional() }).optional(),
});

const HEAD = [
  "# Evaluation results",
  "",
  "Every run of the skill's evaluations, oldest first: each case's score with the skill and",
  "without it, over the runs shown. Made by `npm run evals:summary` from the full reports,",
  "which stay on the machine that ran them. The bar is 0.8, with the skill.",
  "",
  "Runs before 2026-09-23T19-02 were judged by Haiku, the default, which passed weak answers",
  "and failed a correct one; later runs by Sonnet. Read the earlier deltas with that in mind.",
  "",
].join("\n");

const two = (n: number): string => n.toFixed(2);
const signed = (n: number): string => `${n >= 0 ? "+" : ""}${two(n)}`;

function section(id: string, raw: unknown): string | undefined {
  const parsed = Result.safeParse(raw);
  if (!parsed.success) return undefined;
  const r = parsed.data;
  const lines = [
    `### ${id}`,
    "",
    `Claude Code ${r.claudeVersion ?? "unknown"} · $${(r.costUsd ?? 0).toFixed(2)}${r.aggregates?.meanDelta === undefined ? "" : ` · mean delta ${signed(r.aggregates.meanDelta)}`}`,
    "",
    "| Case | With | Without | Delta | Runs |",
    "|---|---|---|---|---|",
    ...r.cases.map((c) => {
      const without = c.aggregates.scoreWithout;
      const delta = c.aggregates.delta ?? (without === undefined ? undefined : c.aggregates.score - without);
      return `| ${c.name} | ${two(c.aggregates.score)} | ${without === undefined ? "—" : two(without)} | ${delta === undefined ? "—" : signed(delta)} | ${String(c.arms?.with?.length ?? c.runsPerCase ?? "—")} |`;
    }),
    "",
  ];
  return lines.join("\n");
}

/** Adds each run in `evals/results/` that `evals/RESULTS.md` does not yet hold, oldest first. */
export function summarise(root: string): void {
  const path = join(root, "evals/RESULTS.md");
  const kept = existsSync(path) ? readFileSync(path, "utf8") : "";
  const sections = new Map<string, string>();
  for (const block of kept.split(/^(?=### )/m).filter((b) => b.startsWith("### "))) {
    sections.set(block.slice(4, block.indexOf("\n")).trim(), block.trimEnd() + "\n");
  }
  const dir = join(root, "evals/results");
  for (const id of existsSync(dir) ? readdirSync(dir) : []) {
    const file = join(dir, id, "aggregate-result.json");
    if (sections.has(id) || !existsSync(file)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const made = section(id, raw);
    if (made !== undefined) sections.set(id, made);
  }
  const ordered = [...sections.keys()].sort().map((id) => sections.get(id) ?? "");
  writeFileSync(path, `${HEAD}\n${ordered.join("\n")}`);
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

if (isTheProgram()) summarise(process.cwd());
