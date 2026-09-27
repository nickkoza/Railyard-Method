// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [Bvq], [v0F] — tier 2, against two fixture repositories with real git. A citation of another
// repository is resolved at the commit it names: current, suspect when changed since, missing
// when the ID is gone, unresolvable when what it names is not so, unreachable when nothing could
// be checked.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { chooseCommit, crossCitationsIn, resolveElsewhere } from "./elsewhere.ts";
import type { Resolution } from "./elsewhere.ts";

const HERE = import.meta.dirname;
let base = "";
let other = "";
let here = "";
let first = "";
let second = "";

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function commit(dir: string, message: string): string {
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

const widget = (first: string): string =>
  ["# Widget", "", "**ID:** [Oa0]", "", "## Acceptance criteria", "", `1. [Oa1] ${first}`, "2. [Ob2] It stops.", ""].join("\n");

function resolve(...cites: string[]): Resolution[] {
  return resolveElsewhere(here, cites.flatMap((c) => crossCitationsIn(c)));
}

describe("[Bvq]: a citation of another repository, resolved at the commit it names", () => {
  before(() => {
    base = mkdtempSync(join(tmpdir(), "elsewhere-"));
    process.env["XDG_CACHE_HOME"] = join(base, "cache");
    other = join(base, "other");
    mkdirSync(other);
    git(other, "init", "-q", "-b", "main");
    write(other, "docs/specs/widget.md", widget("It spins."));
    first = commit(other, "The widget");
    write(other, "docs/specs/widget.md", widget("It spins, and fast."));
    second = commit(other, "Faster");
    here = join(base, "here");
    mkdirSync(here);
    git(here, "init", "-q");
    write(here, ".railyard/method.json", JSON.stringify({ method: "0.2.0", repositories: { other, gone: join(base, "nowhere") } }));
  });

  after(() => {
    delete process.env["XDG_CACHE_HOME"];
    rmSync(base, { recursive: true, force: true });
  });

  it("finds each citation in text, and only the cross-repository form", () => {
    assert.deepEqual(crossCitationsIn("See [other@abc1234:Oa1] and [Oa1] and `[x]`."), [{ name: "other", commit: "abc1234", id: "Oa1", written: "[other@abc1234:Oa1]", index: 4 }]);
  });

  it("takes a commit of five hex characters or more, and not four", () => {
    assert.equal(crossCitationsIn("[other@abc12:Oa1]").length, 1);
    assert.equal(crossCitationsIn("[other@abc1:Oa1]").length, 0);
  });

  it("resolves a prefix that has become ambiguous by where the ID exists, and refuses to guess past that", () => {
    const holds = new Set(["abc12aaa", "abc12ccc"]);
    assert.deepEqual(chooseCommit("abc12", ["abc12aaa", "abc12bbb"], (c) => holds.has(c)), { commit: "abc12aaa" });
    const both = chooseCommit("abc12", ["abc12aaa", "abc12ccc"], (c) => holds.has(c));
    assert.ok("why" in both && both.why.includes("abc12aaa") && both.why.includes("abc12ccc"), JSON.stringify(both));
    assert.ok("why" in chooseCommit("abc12", [], () => true));
    assert.deepEqual(chooseCommit("abc12", ["abc12bbb"], () => false), { commit: "abc12bbb" }, "one candidate is the commit, whether or not the ID is there");
  });

  it("is current when the cited text has not changed since", () => {
    const [a, b] = resolve(`[other@${second.slice(0, 5)}:Oa1]`, `[other@${first.slice(0, 5)}:Ob2]`);
    assert.equal(a?.state, "current", JSON.stringify(a));
    assert.equal(a?.label, "a criterion");
    assert.equal(b?.state, "current", "a criterion that did not change stays current at an older commit");
  });

  it("is suspect when the cited text has changed since, and says at which tip", () => {
    const [r] = resolve(`[other@${first.slice(0, 5)}:Oa1]`);
    assert.equal(r?.state, "suspect", JSON.stringify(r));
    assert.equal(r?.tip, second);
  });

  it("is missing when the ID names nothing at that commit", () => {
    assert.equal(resolve(`[other@${first.slice(0, 5)}:Zz9]`)[0]?.state, "missing");
  });

  it("is unresolvable, saying why, for an undeclared name or a commit the repository does not have", () => {
    const [undeclared, unknown] = resolve(`[nobody@${first.slice(0, 5)}:Oa1]`, "[other@deadbee:Oa1]");
    assert.equal(undeclared?.state, "unresolvable");
    assert.match(undeclared?.why ?? "", /nobody.*not declared/);
    assert.equal(unknown?.state, "unresolvable");
    assert.match(unknown?.why ?? "", /deadbee/);
  });

  it("is unreachable, saying why, for a repository it cannot fetch and has never fetched", () => {
    const [r] = resolve("[gone@abc1234:Oa1]");
    assert.equal(r?.state, "unreachable", JSON.stringify(r));
    assert.match(r?.why ?? "", /cannot be fetched/);
  });

  it("is unreachable, not unresolvable, for a commit its cache lacks while the repository cannot be fetched", () => {
    renameSync(other, `${other}-away`);
    try {
      const [r] = resolve("[other@deadbee:Oa1]");
      assert.equal(r?.state, "unreachable", JSON.stringify(r));
      assert.match(r?.why ?? "", /could not be fetched/);
    } finally {
      renameSync(`${other}-away`, other);
    }
  });

  it("never lets ssh stop to ask, and passes the caller's agent through", () => {
    const bin = join(base, "fake-bin");
    const said = join(base, "ssh-args");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "ssh"), `#!/bin/sh\necho "$@ agent=$SSH_AUTH_SOCK" > ${JSON.stringify(said)}\nprintf "Host key verification failed.\\r\\n" >&2\nexit 255\n`, { mode: 0o755 });
    write(here, ".railyard/method.json", JSON.stringify({ method: "0.2.0", repositories: { other, gone: join(base, "nowhere"), private: "git@example.invalid:someone/private.git" } }));
    const path = process.env["PATH"];
    const sock = process.env["SSH_AUTH_SOCK"];
    process.env["PATH"] = `${bin}:${path ?? ""}`;
    process.env["SSH_AUTH_SOCK"] = "/tmp/agent.sock";
    try {
      const [r] = resolve("[private@abc1234:Oa1]");
      assert.equal(r?.state, "unreachable", JSON.stringify(r));
      const args = readFileSync(said, "utf8");
      assert.match(args, /BatchMode=yes/);
      assert.match(args, /agent=\/tmp\/agent\.sock/);
      assert.match(r?.why ?? "", /Host key verification failed$/, "ssh's own sentence, without its full stop, so a message can end it");
    } finally {
      process.env["PATH"] = path;
      if (sock === undefined) delete process.env["SSH_AUTH_SOCK"];
      else process.env["SSH_AUTH_SOCK"] = sock;
      write(here, ".railyard/method.json", JSON.stringify({ method: "0.2.0", repositories: { other, gone: join(base, "nowhere") } }));
    }
  });

  it("writes nothing to the other repository, and keeps its copy in the user's cache", () => {
    assert.equal(git(other, "status", "--porcelain"), "");
    assert.equal(git(other, "rev-parse", "HEAD"), second);
    assert.ok(existsSync(join(base, "cache", "railyard-method", "repositories")));
  });

  it("still resolves a commit it already has when the repository cannot be reached, and says so", () => {
    renameSync(other, `${other}-away`);
    try {
      const [r] = resolve(`[other@${first.slice(0, 5)}:Oa1]`);
      assert.equal(r?.state, "suspect", JSON.stringify(r));
      assert.equal(r?.offline, true);
    } finally {
      renameSync(`${other}-away`, other);
    }
  });

  it("answers railyard-ids-resolve for a cross-repository citation", () => {
    const r = spawnSync("node", ["--experimental-strip-types", join(HERE, "../bin/railyard-ids-resolve.ts"), `other@${first.slice(0, 5)}:Oa1`], { cwd: here, encoding: "utf8", env: { ...process.env } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /a criterion/);
    assert.doesNotMatch(r.stdout, /`widget` criterion/);
    assert.match(r.stdout, /changed since/);
  });
});
