// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [Bvq]: a citation of another repository, `[name@commit:ID]`, resolved at the commit it names.
//
// An ID is unique only within its own repository, so a citation across repositories carries the
// repository's declared name and the commit its author read. Resolving it means reading that
// repository at that commit, which means having it: each declared URL is fetched, read-only, into
// a bare clone in this tool's own cache, and read from there. The cache is throw-away ([2sV]).
//
// This writes, to its own cache and nowhere else, which is why it lives here and not beside
// traceability's git reader, which is held to reading only ([QBm]). Nothing here ever writes to
// the repository a citation names, or to the one it is cited from.
//
// What it cannot check it says it cannot check ([9p5]): an undeclared name or a commit the
// repository does not have is unresolvable, and a repository that cannot be reached, with no
// earlier fetch to answer, is unreachable; each with the reason, and never taken as fine.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { repositoriesOf } from "../method/repository.ts";
import { indexOf } from "./resolve.ts";
import type { Indexed, Source } from "./resolve.ts";

export type CrossCitation = {
  readonly name: string;
  readonly commit: string;
  readonly id: string;
  /** As it was written, so a finding can quote it. */
  readonly written: string;
  /** Where in the text it was written, so each occurrence is reported where it is. */
  readonly index: number;
};

export type Resolution = {
  readonly citation: CrossCitation;
  /**
   * current: it resolves and has not changed since; suspect: it has; missing: the ID names nothing at that commit;
   * unresolvable: its name is not declared, or its commit is not in the repository; unreachable: the repository
   * could not be fetched and no earlier fetch holds the commit, so nothing could be checked.
   */
  readonly state: "current" | "suspect" | "missing" | "unresolvable" | "unreachable";
  readonly label?: string | undefined;
  readonly path?: string | undefined;
  readonly text?: string | undefined;
  /** Why it is unresolvable, or missing. */
  readonly why?: string | undefined;
  /** The commit "changed since" was measured against: the tip of the default branch as last fetched. */
  readonly tip?: string | undefined;
  /** True when the repository could not be fetched just now, and the cache answered. */
  readonly offline?: boolean | undefined;
};

/** The notation (traceability's Decisions): a declared name, an abbreviated commit, an ID. */
const FORM = /\[([a-z][a-z0-9-]*)@([0-9a-f]{5,40}):([A-Za-z0-9]{3})\]/g;

export function crossCitationsIn(text: string): CrossCitation[] {
  return [...text.matchAll(FORM)].map((m) => ({ name: m[1] ?? "", commit: m[2] ?? "", id: m[3] ?? "", written: m[0], index: m.index }));
}

/** Git as traceability's reads run it: no hooks, no system or global configuration, none of the caller's GIT_* variables. */
const FLAGS = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"] as const;

function git(args: readonly string[]): { readonly ok: boolean; readonly out: string; readonly err: string } {
  const sock = process.env["SSH_AUTH_SOCK"];
  const env = {
    PATH: process.env["PATH"] ?? "/usr/bin:/bin",
    HOME: process.env["HOME"] ?? homedir(),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    // ssh asks on the terminal itself, past GIT_TERMINAL_PROMPT, and a check nobody answers would hang (traceability's Decisions).
    GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
    ...(sock === undefined ? {} : { SSH_AUTH_SOCK: sock }),
  };
  const r = spawnSync("git", [...FLAGS, ...args], { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout.trim(), err: r.stderr.trim() };
}

/** This tool's own cache of other repositories: one bare clone per declared URL. */
function cacheFor(url: string): string {
  const root = process.env["XDG_CACHE_HOME"] !== undefined && process.env["XDG_CACHE_HOME"] !== "" ? process.env["XDG_CACHE_HOME"] : join(homedir(), ".cache");
  return join(root, "railyard-method", "repositories", `${createHash("sha256").update(url).digest("hex").slice(0, 16)}.git`);
}

type Fetched = { readonly dir: string; readonly offline: boolean } | { readonly error: string };

/** Makes sure the cache holds `url`'s branches, fetching them once; says so when it could not reach it. */
function fetch(url: string): Fetched {
  const dir = cacheFor(url);
  if (!existsSync(dir)) {
    mkdirSync(dirname(dir), { recursive: true });
    const cloned = git(["clone", "--bare", "--quiet", url, dir]);
    return cloned.ok ? { dir, offline: false } : { error: `${url} cannot be fetched: ${(cloned.err.split("\n")[0] ?? "git failed").trim().replace(/\.+$/, "")}` };
  }
  // All branches, never one commit by hash: git's fetch asks for full object IDs, and a citation carries an abbreviated one.
  const fetched = git(["-C", dir, "fetch", "--quiet", url, "+refs/heads/*:refs/heads/*"]);
  return { dir, offline: !fetched.ok };
}

/** A commit of a cached repository, as a source to index. */
function atCommit(dir: string, commit: string): Source {
  return {
    read: (path) => {
      const r = git(["-C", dir, "show", `${commit}:${path}`]);
      return r.ok ? r.out : undefined;
    },
    list: (folder) => {
      const r = git(["-C", dir, "ls-tree", "--name-only", commit, "--", `${folder}/`]);
      return r.ok ? r.out.split("\n").filter((p) => p.endsWith(".md") || p.endsWith(".json")).sort() : [];
    },
  };
}

/**
 * Which commit a prefix names, among the commits it matches (traceability's Decisions). A prefix
 * written unambiguously can match more commits as the repository grows, so where it does, the
 * commits at which the cited ID exists are kept; one left is the answer, and more is refused with
 * the candidates named rather than guessed between.
 */
export function chooseCommit(prefix: string, candidates: readonly string[], holdsId: (commit: string) => boolean): { readonly commit: string } | { readonly why: string } {
  if (candidates.length === 0) return { why: `${prefix} names no commit` };
  const [only] = candidates;
  if (candidates.length === 1 && only !== undefined) return { commit: only };
  const holding = candidates.filter(holdsId);
  const [one] = holding;
  if (holding.length === 1 && one !== undefined) return { commit: one };
  return { why: `${prefix} now names ${String(candidates.length)} commits (${candidates.join(", ")}), and ${holding.length === 0 ? "none" : "more than one"} of them holds the cited ID` };
}

/** Every commit a prefix names in a cached repository: git lists every object the prefix matches, and only commits count. */
function commitsFor(dir: string, prefix: string): string[] {
  const listed = git(["-C", dir, "rev-parse", `--disambiguate=${prefix}`]);
  if (!listed.ok) return [];
  return listed.out.split("\n").filter((oid) => oid !== "" && git(["-C", dir, "cat-file", "-t", oid]).out === "commit");
}

/** Resolves each citation against the repository it names, from `root`'s declarations. */
export function resolveElsewhere(root: string, citations: readonly CrossCitation[]): Resolution[] {
  const declared = repositoriesOf(root);
  const fetched = new Map<string, Fetched>();
  const indexes = new Map<string, ReadonlyMap<string, Indexed>>();
  const indexAt = (dir: string, commit: string): ReadonlyMap<string, Indexed> => {
    const key = `${dir}@${commit}`;
    let found = indexes.get(key);
    if (found === undefined) {
      found = indexOf(atCommit(dir, commit));
      indexes.set(key, found);
    }
    return found;
  };

  return citations.map((citation): Resolution => {
    const url = declared.get(citation.name);
    if (url === undefined) {
      return { citation, state: "unresolvable", why: `${citation.name} is not declared under repositories in .railyard/method.json` };
    }
    let repo = fetched.get(url);
    if (repo === undefined) {
      repo = fetch(url);
      fetched.set(url, repo);
    }
    if ("error" in repo) return { citation, state: "unreachable", why: repo.error };
    const offline = repo.offline;
    const dir = repo.dir;
    const chosen = chooseCommit(citation.commit, commitsFor(dir, citation.commit), (c) => indexAt(dir, c).has(citation.id));
    if ("why" in chosen) {
      // Offline, a commit the cache lacks may still be there: not checked, rather than wrong.
      return { citation, state: offline ? "unreachable" : "unresolvable", offline, why: `${chosen.why} in ${citation.name} (${url})${offline ? ", which could not be fetched just now" : ""}` };
    }
    const cited = indexAt(dir, chosen.commit).get(citation.id);
    if (cited === undefined) {
      return { citation, state: "missing", offline, why: `[${citation.id}] names nothing in ${citation.name} at ${citation.commit}` };
    }
    const tip = git(["-C", repo.dir, "rev-parse", "HEAD"]).out;
    const now = indexAt(repo.dir, tip).get(citation.id);
    const state = now !== undefined && now.body === cited.body ? "current" : "suspect";
    return { citation, state, label: cited.label ?? undefined, path: cited.path ?? undefined, text: cited.text ?? undefined, tip, offline };
  });
}
