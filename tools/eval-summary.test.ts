// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The evaluations' summary ([6HK]): every run is shown to have happened, with its scores, and none
// of its transcripts. A run is added once, however often the summary is made.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summarise } from "./eval-summary.ts";

let root = "";

function run(id: string, cases: { name: string; score: number; without: number }[]): void {
  mkdirSync(join(root, "evals/results", id), { recursive: true });
  writeFileSync(join(root, "evals/results", id, "aggregate-result.json"), JSON.stringify({
    claudeVersion: "2.1.280",
    startedAt: "2026-09-23T18:30:00.000Z",
    costUsd: 5.11,
    cases: cases.map((c) => ({
      name: c.name,
      runsPerCase: 3,
      promptMarkdown: "a prompt, with /home/someone/secret in it",
      aggregates: { score: c.score, scoreWithout: c.without, delta: c.score - c.without },
    })),
    aggregates: { casesTotal: cases.length, casesPassed: cases.length, meanDelta: 0.5 },
  }));
}

describe("the evaluations' summary", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "evals-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("records each run's date, version, cost and every case's scores, and nothing of its prompts", () => {
    run("2026-09-23T18-30-00-000Z", [{ name: "upgrading-first", score: 1, without: 0.4 }]);
    summarise(root);
    const text = readFileSync(join(root, "evals/RESULTS.md"), "utf8");
    assert.match(text, /2026-09-23T18-30-00-000Z/);
    assert.match(text, /2\.1\.280/);
    assert.match(text, /\$5\.11/);
    assert.match(text, /\| upgrading-first \| 1\.00 \| 0\.40 \| \+0\.60 \| 3 \|/);
    assert.doesNotMatch(text, /secret|prompt/);
  });

  it("adds a run once, however often it is made, and keeps runs in order", () => {
    run("2026-09-23T18-30-00-000Z", [{ name: "a", score: 1, without: 1 }]);
    summarise(root);
    summarise(root);
    run("2026-09-22T10-00-00-000Z", [{ name: "b", score: 0.5, without: 0 }]);
    summarise(root);
    const text = readFileSync(join(root, "evals/RESULTS.md"), "utf8");
    assert.equal(text.split("### 2026-09-23T18-30-00-000Z").length - 1, 1);
    assert.ok(text.indexOf("2026-09-22T10-00-00-000Z") < text.indexOf("2026-09-23T18-30-00-000Z"), "oldest first");
  });

  it("records the runs that happened, not the runs the case asks for, when the command asked for more", () => {
    mkdirSync(join(root, "evals/results/2026-09-27T18-14-05-182Z"), { recursive: true });
    const arm = (score: number): { score: number }[] => Array.from({ length: 10 }, () => ({ score }));
    writeFileSync(join(root, "evals/results/2026-09-27T18-14-05-182Z", "aggregate-result.json"), JSON.stringify({
      claudeVersion: "2.1.283",
      costUsd: 2.23,
      cases: [{
        name: "leaving-the-trail",
        runsPerCase: 5,
        arms: { with: arm(1), without: arm(0.2) },
        aggregates: { score: 1, scoreWithout: 0.2, delta: 0.8 },
      }],
      aggregates: { meanDelta: 0.8 },
    }));
    summarise(root);
    assert.match(readFileSync(join(root, "evals/RESULTS.md"), "utf8"), /\| leaving-the-trail \| 1\.00 \| 0\.20 \| \+0\.80 \| 10 \|/);
  });

  it("keeps what the summary already holds when the full results are gone", () => {
    run("2026-09-23T18-30-00-000Z", [{ name: "a", score: 1, without: 1 }]);
    summarise(root);
    rmSync(join(root, "evals/results"), { recursive: true });
    summarise(root);
    assert.match(readFileSync(join(root, "evals/RESULTS.md"), "utf8"), /2026-09-23T18-30-00-000Z/);
  });
});
