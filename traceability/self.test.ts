// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [ei5], held on this repository's own history: the method's trace of itself links only to
// artifacts that exist here.
//
// The rule's own tests hold what counts as a citation. This holds what the rule is for. Before
// [ei5], indexing this repository linked every one of 38 artifacts to something that exists
// nowhere: paths inside test fixtures, a Markdown `**bold**` read as a comment, examples of
// citation syntax in doc comments. Each was a different way to be wrong, and none failed a test.
// A symbols file is only worth publishing if what it links to is there.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { indexCommit } from "./index.ts";

/** The two parts of the published index this reads, validated rather than trusted. */
const Index = z.looseObject({
  artifacts: z.array(z.looseObject({ path: z.string(), label: z.string() })),
  links: z.array(z.looseObject({ artifact: z.number().int().nonnegative(), source: z.string() })),
});

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: import.meta.dirname, encoding: "utf8" }).trim();

/**
 * Citations of artifacts this repository does not have yet, each with why it is allowed. The
 * test fails when one is no longer needed, so this cannot outlive its reason.
 */
const NOT_HERE_YET: Readonly<Record<string, string>> = {};

describe("[ei5]: the method's trace of itself", () => {
  it("links, from its own comments, only to artifacts this repository has", () => {
    const dir = mkdtempSync(join(tmpdir(), "method-self-"));
    try {
      indexCommit({ repo: ROOT, symbols: dir });
      const index = Index.parse(JSON.parse(readFileSync(join(dir, "index.json"), "utf8")));
      const files = new Set(execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { cwd: ROOT, encoding: "utf8" }).split("\n"));
      const cited = new Set(index.links.filter((l) => l.source === "code-citation").map((l) => l.artifact));
      const nowhere = [...cited].flatMap((i) => index.artifacts[i] ?? []).filter((a) => !files.has(a.path.split("#")[0] ?? "")).map((a) => a.label);
      assert.deepEqual(nowhere.filter((label) => NOT_HERE_YET[label] === undefined), [], "each of these is cited in a comment and exists nowhere here");
      for (const label of Object.keys(NOT_HERE_YET)) {
        assert.ok(nowhere.includes(label), `${label} is no longer needed in NOT_HERE_YET: remove it`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps a symbols directory that reads, whose newest version is a commit of this repository", () => {
    const index = Index.extend({ versions: z.array(z.looseObject({ commit: z.number().int().nonnegative() })).min(1), commits: z.array(z.looseObject({ sha: z.string().min(1) })) })
      .parse(JSON.parse(readFileSync(join(ROOT, "symbols/index.json"), "utf8")));
    const newest = index.commits[index.versions[index.versions.length - 1]?.commit ?? -1]?.sha;
    assert.ok(newest !== undefined, "the newest version names a commit");
    execFileSync("git", ["merge-base", "--is-ancestor", newest, "HEAD"], { cwd: ROOT });
  });
});
