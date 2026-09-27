// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The traceability piece reads the repository it is pointed at, and never writes to it.
//
// This held as a conformance check in Railyard, `code.traceability-git-readonly`, while the piece
// lived there. It moved with the code: a repository cannot hold a control over code it does not
// contain, and a check that inspects a dependency's build output is inspecting the wrong thing.
//
// It holds the same property by reading the one production file that runs a process. That is
// inspection rather than proof, and it is deliberately narrow about what it will accept: a form it
// does not recognise fails rather than passes, because the failure it guards against — a write to
// someone's repository, or a hook of theirs run on their behalf — is one nobody would notice
// happening.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const HERE = import.meta.dirname;
const GIT = readFileSync(join(HERE, "git.ts"), "utf8");

/** Production files: the source, without its tests or the tests' fixtures. */
const PRODUCTION = readdirSync(HERE).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"));

/** The string literals of a `const NAME = [ ... ] as const;` array, in order, or null where it is not one. */
function literalArray(source: string, name: string): string[] | null {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\] as const;`).exec(source);
  if (m === null) return null;
  return [...(m[1] ?? "").matchAll(/"([^"]*)"/g)].map((x) => x[1] ?? "");
}

describe("the traceability piece reads git and nothing else", () => {
  it("runs a process from one file only", () => {
    const running = PRODUCTION.filter((f) => /from "node:child_process"/.test(readFileSync(join(HERE, f), "utf8")));
    assert.deepEqual(running, ["git.ts"], "a second file that starts processes is a second place a write could come from");
  });

  it("runs only subcommands that read", () => {
    // Held to this list by its type, which the compiler checks; this holds the list itself. Adding a
    // subcommand here is a decision about someone's repository and should be made on purpose.
    assert.deepEqual(literalArray(GIT, "SUBCOMMANDS"), ["blame", "cat-file", "diff-tree", "grep", "log", "ls-tree", "rev-parse", "show"]);
  });

  it("runs nothing but the literal git, always with the hardened flags and its own environment", () => {
    const calls = [...GIT.matchAll(/spawnSync\(([^;]*?)\)\)/g)].map((m) => m[1] ?? "");
    assert.ok(calls.length > 0, "the calls were found, so the rest of this means something");
    for (const call of calls) {
      assert.match(call, /^"git", \[\.\.\.FLAGS,/, `every call runs the literal git with the hardened flags first:\n${call}`);
      assert.match(call, /env: ENVIRONMENT\b/, `every call carries git's own environment:\n${call}`);
      assert.doesNotMatch(call, /\.\.\.(?!FLAGS|args|textconv)\w/, `nothing else is spread into a call:\n${call}`);
    }
    // And no other way of running a process slipped in beside spawnSync.
    // A bare call, not a method: `PATTERN.exec(line)` is a regular expression, not a process.
    assert.doesNotMatch(GIT, /(?<![.\w])(exec|execSync|execFile|execFileSync|spawn|fork)\(/, "spawnSync is the only way git is run");
  });

  it("turns off everything in git that runs a program of the repository's owner", () => {
    const flags = literalArray(GIT, "FLAGS") ?? [];
    for (const off of ["core.hooksPath=/dev/null", "core.fsmonitor=false", "log.showSignature=false"]) {
      assert.ok(flags.includes(off), `${off} is among the hardened flags`);
    }
  });

  it("gives git an environment of its own, so the caller's GIT_* and configuration change nothing", () => {
    const env = /const ENVIRONMENT = \{([^}]*)\} as const;/.exec(GIT)?.[1] ?? "";
    assert.ok(env !== "", "the environment is one object literal");
    assert.doesNotMatch(env, /\.\.\./, "it spreads nothing, so nothing of the caller's arrives by accident");
    assert.match(env, /GIT_CONFIG_NOSYSTEM: "1"/);
    assert.match(env, /GIT_CONFIG_GLOBAL: "\/dev\/null"/);
    assert.doesNotMatch(env, /GIT_DIR|GIT_WORK_TREE/, "the caller's repository never becomes git's");
    assert.doesNotMatch(GIT, /ENVIRONMENT\s*\[|ENVIRONMENT\.\w+\s*=/, "nothing writes to it afterwards");
  });
});
