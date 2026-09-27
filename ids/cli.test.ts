// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `npm run ids:take` end to end ([8g5], [9pu]): the command prints free IDs and
// writes nothing. The alphabet and the corpus live here, where `freeId` deliberately
// judges neither.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { takenIn } from "./cli.ts";

// The CLI sits beside this test, wherever this directory has been put, and the repository it is
// pointed AT is whichever one contains them. Both were built by counting directories up from here
// — `tools/ids/cli.ts`, and two levels to the root — which is true of Railyard and of nowhere
// else, so both broke the moment this directory was lifted out to travel on its own ([QBm]: the
// tools stand alone). Counting levels is the thing that does not survive a move; asking does.
const CLI = join(import.meta.dirname, "../bin/railyard-ids-take.ts");

/** The repository holding this test: the nearest directory at or above it that has a `.git`. */
function repositoryRoot(): string {
  let at = import.meta.dirname;
  for (;;) {
    if (existsSync(join(at, ".git"))) return at;
    const up = dirname(at);
    if (up === at) throw new Error(`no repository above ${import.meta.dirname}`);
    at = up;
  }
}

const ROOT = repositoryRoot();
const WELL_FORMED = /^[A-Za-z0-9]{3}$/;

function take(...args: readonly string[]): string[] {
  const out = execFileSync("node", [CLI, ...args], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((l) => l !== "");
}

/** Every tracked file's bytes, which is the corpus the rule searches — read as the command reads it. */
function corpus(): string {
  const listed = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const parts: string[] = [];
  for (const file of listed.split("\0").filter((f) => f !== "")) {
    try {
      parts.push(readFileSync(join(ROOT, file), "latin1"));
    } catch {
      // Unreadable here means unreadable for the command too.
    }
  }
  return parts.join("\n");
}

describe("npm run ids:take", () => {
  it("prints one well-formed ID by default", () => {
    const got = take();
    assert.equal(got.length, 1, JSON.stringify(got));
    assert.match(got[0] ?? "", WELL_FORMED);
  });

  it("prints as many as asked for, all different", () => {
    const got = take("5");
    assert.equal(got.length, 5, JSON.stringify(got));
    for (const id of got) assert.match(id, WELL_FORMED);
    assert.equal(new Set(got).size, 5, "an ID drawn earlier in the run is taken, though nothing is written yet");
  });

  it("gives an ID that appears nowhere in the repository", () => {
    const text = corpus();
    for (const id of take("3")) {
      assert.ok(!text.includes(id), `${id} already appears in the repository, so it is not free`);
    }
  });

  it("writes nothing: the repository is unchanged after taking", () => {
    const before = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
    take("2");
    const after = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(after, before, "taking an ID is the author's act; the command only says which are free");
  });

  it("refuses a count that is not a positive whole number, rather than guessing", () => {
    assert.throws(() => take("0"));
    assert.throws(() => take("-1"));
    assert.throws(() => take("many"));
  });
});

/** A scratch repository with real git, removed after `body` runs. */
async function scratch(body: (root: string, git: (...args: readonly string[]) => void) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "ids-take-"));
  const git = (...args: readonly string[]): void => {
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: root, stdio: "ignore" });
  };
  try {
    git("init", "-q");
    await body(root, git);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("an ID anything has ever mentioned is taken ([9pu])", () => {
  it("takes an ID that only a deleted file's history holds", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "gone.md"), "1. [Qz9] A criterion since deleted.\n");
      git("add", "gone.md");
      git("commit", "-q", "-m", "Add a spec");
      unlinkSync(join(root, "gone.md"));
      writeFileSync(join(root, "kept.md"), "nothing here\n");
      git("add", "-A");
      git("commit", "-q", "-m", "Remove it");
      const taken = await takenIn(root);
      assert.equal(taken("Qz9"), true, "a deleted file's ID is still cited wherever history cited it");
      assert.equal(taken("Wv7"), false, "an ID nothing ever mentioned is free");
    });
  });

  it("takes an ID that only a commit message holds", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "plain\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "Implements [Zq8]");
      assert.equal((await takenIn(root))("Zq8"), true, "the trace reads a commit's message as a citation");
    });
  });

  it("takes an ID in a tracked file's edit not yet committed, and one on another branch", async () => {
    await scratch(async (root, git) => {
      writeFileSync(join(root, "a.md"), "plain\n");
      git("add", "a.md");
      git("commit", "-q", "-m", "Start");
      git("checkout", "-q", "-b", "side");
      writeFileSync(join(root, "b.md"), "1. [Br4] On a branch only.\n");
      git("add", "b.md");
      git("commit", "-q", "-m", "Side");
      git("checkout", "-q", "-");
      writeFileSync(join(root, "a.md"), "1. [Ed5] Written, not committed.\n");
      const taken = await takenIn(root);
      assert.equal(taken("Br4"), true, "any ref's history counts");
      assert.equal(taken("Ed5"), true, "the tracked file as it stands counts");
    });
  });

  it("says in one line, and exits non-zero, when run outside a repository", () => {
    const outside = mkdtempSync(join(tmpdir(), "ids-take-outside-"));
    try {
      const r = spawnSync("node", [CLI, "2"], { cwd: outside, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(outside) } });
      assert.notEqual(r.status, 0, "an ID drawn without the search is one nobody checked");
      assert.equal(r.stdout, "", "nothing is offered");
      const lines = r.stderr.split("\n").filter((l) => l !== "");
      assert.equal(lines.length, 1, r.stderr);
      assert.doesNotMatch(r.stderr, /\bat .*\.ts:\d+|Error:/, "a sentence, not a stack trace");
      assert.match(r.stderr, /git repository/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
