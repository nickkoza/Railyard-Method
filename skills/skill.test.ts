// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The skill is held to its evaluations and to the conventional paths.
//
// A skill is prose, and prose has no compiler. Nothing about the document changes shape when a
// section stops being tested, or when it stops naming where artifacts live: it reads just as well
// either way. So these hold what the reader cannot see.
//
// - Every `## ` section is named by some case's `Covers:` line, and every `Covers:` line names a
//   section that still exists ([xCF]). A section with no case is a rule nothing measures, and a
//   case covering a renamed section tests something that is gone.
// - Every LLM grader states the facts of the situation it scores, and they are its prompt's facts.
//   A grader written for one version of a prompt keeps scoring for it after the prompt is
//   rewritten, and nothing fails: the judge simply grades against a situation the agent was never
//   given. It happened twice before this test existed (2026-09-20 and 2026-09-23), and both times it
//   passed and failed answers of the same substance.
// - The skill names every conventional path ([ZNz]). An agent following it would otherwise put
//   artifacts where no tool looks, and the repository would read as empty.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkArchitecture } from "../method/architecture.ts";
import { checkArtifacts } from "../method/artifacts.ts";
import { CONVENTIONAL_PATHS } from "../method/paths.ts";

const ROOT = join(import.meta.dirname, "..");
const SKILL = readFileSync(join(ROOT, "skills/spec-driven-change/SKILL.md"), "utf8");

/** Top-level sections only: a `### ` subsection is covered by whatever covers its `## `. */
// A heading inside a fenced block is an example the skill shows, not one of its sections.
let fenced = false;
const sections = SKILL.split("\n").flatMap((line) => {
  if (/^\s*```/.test(line)) fenced = !fenced;
  return fenced ? [] : /^##[ \t]+(.+?)\s*$/.exec(line)?.[1] ?? [];
});

/** Each case under `evals/`, and what its `Covers:` line names. */
const cases = readdirSync(join(ROOT, "evals"), { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(ROOT, "evals", e.name, "prompt.md")))
  .map((e) => ({
    dir: e.name,
    covers: /^Covers:[ \t]*(.+?)\s*$/m.exec(readFileSync(join(ROOT, "evals", e.name, "prompt.md"), "utf8"))?.[1],
  }));

describe("the skill", () => {
  it("has an eval case covering every section", () => {
    assert.ok(sections.length > 0 && cases.length > 0, "sections and cases were found, so the rest means something");
    const uncovered = sections.filter((s) => !cases.some((c) => c.covers?.toLowerCase() === s.toLowerCase()));
    assert.deepEqual(uncovered, [], "each of these sections needs a case whose prompt.md says `Covers: <section>`");
  });

  it("has no case covering a section that does not exist, or nothing at all", () => {
    const known = new Set(sections.map((s) => s.toLowerCase()));
    const stray = cases.filter((c) => c.covers === undefined || !known.has(c.covers.toLowerCase())).map((c) => `${c.dir}: ${c.covers ?? "(no Covers: line)"}`);
    assert.deepEqual(stray, []);
  });

  it("names every conventional path", () => {
    const unnamed = CONVENTIONAL_PATHS.filter((p) => !SKILL.includes(`${p}/`));
    assert.deepEqual(unnamed, [], "an agent following the skill would put these artifacts where no tool looks");
  });

  it("shows a model the checks read: its own ID, and a node owning code by its source-path ([obW], [C4P], [L7b])", () => {
    const block = [...SKILL.matchAll(/^```json\n([\s\S]*?)^```/gm)].map((m) => m[1] ?? "").find((b) => b.includes('"nodes"'));
    assert.ok(block !== undefined, "the skill shows a model, so an agent starting a repository knows its shape");
    const model = JSON.parse(block) as { metadata?: { id?: string }; nodes: { "source-path"?: string | string[] }[] };
    assert.match(model.metadata?.id ?? "", /^[A-Za-z0-9]{3}$/, "the model carries its own ID");
    const owned = model.nodes.flatMap((n) => n["source-path"] ?? []);
    assert.ok(owned.length > 0, "a node owns code by its source-path");
    const root = mkdtempSync(join(tmpdir(), "skill-model-"));
    try {
      const put = (path: string, text: string): void => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      };
      put("docs/architecture/shop.json", block);
      for (const p of owned) put(/\.[a-z]+$/.test(p) ? p : `${p}/index.ts`, "export const x = 1;\n");
      execFileSync("git", ["init", "-q"], { cwd: root });
      const found = checkArchitecture(root, { calm: join(ROOT, "node_modules/.bin/calm") }).filter((f) => f.rule !== "CLM");
      assert.deepEqual(found, [], "the example is a model the checks read, and calm validate accepts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("shows a spec the checks read: its Tests row names its criterion by ID ([obW], [Xtd])", () => {
    const block = [...SKILL.matchAll(/^```markdown\n([\s\S]*?)^```/gm)].map((m) => m[1] ?? "").find((b) => b.includes("## Tests"));
    assert.ok(block !== undefined, "the skill shows a spec, so an agent starting a repository knows its shape");
    const root = mkdtempSync(join(tmpdir(), "skill-spec-"));
    try {
      mkdirSync(join(root, "docs/specs"), { recursive: true });
      writeFileSync(join(root, "docs/specs/export.md"), block);
      execFileSync("git", ["init", "-q"], { cwd: root });
      assert.deepEqual(checkArtifacts(root).map((f) => `${f.rule}: ${f.message}`), [], "the example is a spec the checks accept");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is installed from the README as the skill says, and the README lists every command it carries ([4Ec])", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const part = (heading: string): string => readme.split(/\n(?=## )/).find((p) => p.startsWith(`## ${heading}\n`)) ?? "";
    const install = part("Install");
    assert.match(install, /railyard\.mjs install/, "a person installs with the tool's install, which also writes the scan and its permissions");
    assert.doesNotMatch(install, /cp -r/, "a copy made by hand installs no scan");
    const commands = [...readFileSync(join(ROOT, "bin/railyard.ts"), "utf8").matchAll(/^\s+"?([\w-]+)"?(?::\s|,$)/gm)].map((m) => m[1] ?? "");
    assert.ok(commands.length >= 10, commands.join(", "));
    const use = part("Use");
    const missing = commands.filter((c) => !new RegExp(`\\$T ${c}\\b`).test(use));
    assert.deepEqual(missing, [], "each command the tool carries is shown under Use");
  });

  it("has every LLM grader anchored to facts its prompt still states", () => {
    const body = (text: string): string => text.replace(/^---\n[\s\S]*?\n---\n/, "");
    const problems: string[] = [];
    let graders = 0;
    for (const c of cases) {
      const flat = (text: string): string => text.replace(/\s+/g, " ").toLowerCase();
      const prompt = flat(body(readFileSync(join(ROOT, "evals", c.dir, "prompt.md"), "utf8")));
      const dir = join(ROOT, "evals", c.dir, "graders");
      for (const name of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
        const text = readFileSync(join(dir, name), "utf8");
        if (!/^type:\s*llm\s*$/m.test(text)) continue;
        graders += 1;
        const declared = /<!--\s*anchors:\s*(.+?)\s*-->/.exec(text)?.[1];
        if (declared === undefined) {
          problems.push(`${c.dir}/${name}: no <!-- anchors: ... --> line`);
          continue;
        }
        const own = flat(body(text).replace(/<!--[\s\S]*?-->/g, ""));
        for (const anchor of declared.split(",").map((a) => a.trim().toLowerCase()).filter((a) => a !== "")) {
          if (!prompt.includes(anchor)) problems.push(`${c.dir}/${name}: "${anchor}" is not in the prompt`);
          if (!own.includes(anchor)) problems.push(`${c.dir}/${name}: "${anchor}" is not in the grader's own text`);
        }
      }
    }
    assert.ok(graders > 0, "LLM graders were found, so the rest means something");
    assert.deepEqual(problems, []);
  });
});
