// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The repository, read through the local git CLI at a commit and never
// written ([QBm]; traceability's Decisions). Git runs with an
// environment of its own, so the caller's GIT_DIR, GIT_WORK_TREE and git
// configuration change neither which repository is read nor what git runs; with
// hardened flags first; and only read-only subcommands. The repository is found
// once from the directory it is pointed at, and named by its git directory after
// that, so a bare repository is read as any other. A failure is git's own words
// (traceability's Decisions), and a file git's grep passed over is said, not dropped.
// Every answer git gives is validated before it is used, and each is read once
// per query.
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { z } from "zod";
import { Instant, Sha, Trailer, TraceRefusal } from "./model.ts";
import type { Unreadable, Version } from "./model.ts";

/** The subcommands the query runs; each only reads. */
const SUBCOMMANDS = ["blame", "cat-file", "diff-tree", "grep", "log", "ls-tree", "rev-parse", "show"] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];
/**
 * Before every subcommand: no hooks, no fsmonitor, no signature program, no colour, paths quoted as they are and
 * never read as patterns. The daemon's git runner has the first two; they are restated, not imported ([QBm], the Decisions).
 */
const FLAGS = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "log.showSignature=false", "-c", "color.ui=never", "-c", "core.quotepath=false", "--literal-pathspecs"] as const;
/** Git's whole environment, an allowlist: nothing of the caller's GIT_*, and no system or global configuration. */
const ENVIRONMENT = {
  PATH: process.env["PATH"] ?? "/usr/bin:/bin",
  HOME: process.env["HOME"] ?? "/nonexistent",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
} as const;
const MAX_BUFFER = 1024 * 1024 * 1024;

export type CommitInfo = Version & {
  readonly author: string;
  readonly subject: string;
  /** The message without its trailers. */
  readonly message: string;
  readonly trailers: readonly Trailer[];
};

export type Hit = { readonly path: string; readonly line: number; readonly text: string };

/** What a search of a commit's files found, and each file it passed over because git could not read it. */
export type Searched = { readonly hits: readonly Hit[]; readonly passedOver: readonly Unreadable[] };

export type Repository = {
  readonly root: string;
  /** The commit a revision names; refused when it names none. */
  resolve(revision: string): Version;
  /** The files at the commit: its blobs. A submodule's entry is no file. */
  files(commit: string): ReadonlySet<string>;
  read(commit: string, path: string): string | undefined;
  /** For each line of the file at the commit, the commit that last changed it. */
  blame(commit: string, path: string): readonly string[];
  commit(sha: string): CommitInfo;
  /** The last commit at or before `commit` that changed `path`. */
  lastChange(commit: string, path: string): Version | undefined;
  /** Every commit at or before `commit` that changed `path`, newest first. */
  history(commit: string, path: string): readonly Version[];
  /** Every line of every text file at the commit that the extended regular expression matches. */
  grep(commit: string, pattern: string): Searched;
  /** Every commit reachable from `commit` whose message the extended regular expression matches. */
  commitsCiting(commit: string, pattern: string): readonly string[];
  /** The files a commit changed. */
  touched(sha: string): readonly string[];
};

/** Git could not do what the query asked of it, in git's own words (traceability's Decisions). */
export class GitFailure extends Error {
  override readonly name = "GitFailure";
  /** Git's exit status; null when it did not exit. */
  readonly status: number | null;
  /** Git's error stream. */
  readonly stderr: string;
  constructor(command: string, reason: string, status: number | null, stderr: string) {
    super(`git ${command} failed: ${reason}`);
    this.status = status;
    this.stderr = stderr;
  }
}

/** What git wrote: its answer, and its error stream, where a read that passed over something says so. */
type Ran = { readonly stdout: string; readonly stderr: string };

function outcome(command: string, result: SpawnSyncReturns<string>): Ran {
  if (result.error !== undefined) throw new GitFailure(command, result.error.message, null, "");
  const stderr = result.stderr;
  if (result.status !== 0) {
    const why = stderr.trim() === "" ? `it exited with ${String(result.status ?? result.signal)}` : stderr.trim();
    throw new GitFailure(command, why, result.status, stderr);
  }
  return { stdout: result.stdout, stderr };
}

/** `rev-parse` in a directory, before the repository is known: git finds it from there. */
function revParseIn(dir: string, args: readonly string[]): string {
  return outcome("rev-parse", spawnSync("git", [...FLAGS, "rev-parse", ...args], { cwd: dir, encoding: "utf8", maxBuffer: MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"], env: ENVIRONMENT })).stdout.trim();
}

/** A read-only subcommand in the repository whose git directory is `gitDir`. Blame runs no textconv program. */
function run(gitDir: string, subcommand: Subcommand, args: readonly string[]): Ran {
  // The type holds it to the list; this holds it there at run time too.
  if (!SUBCOMMANDS.includes(subcommand)) throw new Error(`git ${subcommand} is not a read-only subcommand`);
  const textconv = subcommand === "blame" ? ["--no-textconv"] : [];
  return outcome(subcommand, spawnSync("git", [...FLAGS, `--git-dir=${gitDir}`, subcommand, ...textconv, ...args], { cwd: gitDir, encoding: "utf8", maxBuffer: MAX_BUFFER, stdio: ["ignore", "pipe", "pipe"], env: ENVIRONMENT }));
}

function git(gitDir: string, subcommand: Subcommand, args: readonly string[]): string {
  return run(gitDir, subcommand, args).stdout;
}

function memoize<T>(make: (key: string) => T): (key: string) => T {
  const cache = new Map<string, { readonly value: T }>();
  return (key) => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit.value;
    const value = make(key);
    cache.set(key, { value });
    return value;
  };
}

const CommitFields = z.tuple([Sha, z.string(), Instant, z.string(), z.string(), z.string()]);
const Change = z.tuple([Sha, Instant]);
const GrepRecord = z.tuple([z.string().min(1), z.coerce.number().int().positive(), z.string()]);
const Found = z.tuple([z.string().min(1), z.enum(["true", "false"])]);
const BLAME_HEADER = /^([0-9a-f]{40}(?:[0-9a-f]{24})?) \d+ \d+(?: \d+)?$/;
/** An `ls-tree` entry: its mode, its type, its object, and its path after a tab. */
const TREE_ENTRY = /^\d{6} (blob|tree|commit) [0-9a-f]{40}(?:[0-9a-f]{24})?\t([\s\S]+)$/;
/** How git's grep says it passed over a file it could not read: `error: '<commit>:<path>': unable to read <object>`. */
const PASSED_OVER = /^error: '([^']+)': unable to read /;
const SEP = "\0";

function trailersOf(text: string): Trailer[] {
  return text.split("\n").filter((l) => l.trim() !== "").map((l) => {
    const colon = l.indexOf(":");
    return Trailer.parse({ key: l.slice(0, colon).trim(), value: l.slice(colon + 1).trim() });
  });
}

/** Each file git's grep says it passed over, once, with the line it said it in. */
function passedOver(at: string, stderr: string): Unreadable[] {
  const seen = new Map<string, Unreadable>();
  for (const line of stderr.split("\n")) {
    const where = PASSED_OVER.exec(line)?.[1];
    if (where === undefined || !where.startsWith(`${at}:`)) continue;
    const path = where.slice(at.length + 1);
    if (path !== "" && !seen.has(path)) seen.set(path, { path, reason: line.trim() });
  }
  return [...seen.values()];
}

/** The git directory of the repository `dir` is in, and a name for it: its top level, or the git directory when it is bare. */
function locate(dir: string): { readonly gitDir: string; readonly root: string } {
  let found: z.infer<typeof Found>;
  try {
    const parsed = Found.safeParse(revParseIn(dir, ["--absolute-git-dir", "--is-bare-repository"]).split("\n"));
    if (!parsed.success) throw new Error("git named no git directory");
    found = parsed.data;
  } catch (error) {
    throw new TraceRefusal(`${dir} is not in a git repository: ${error instanceof Error ? error.message : String(error)}`);
  }
  const [gitDir, bare] = found;
  if (bare === "true") return { gitDir, root: gitDir };
  try {
    return { gitDir, root: revParseIn(dir, ["--show-toplevel"]) };
  } catch {
    // Inside a git directory there is no top level to name; the git directory is named instead.
    return { gitDir, root: gitDir };
  }
}

export function openRepository(dir: string): Repository {
  const { gitDir, root } = locate(dir);
  const split = (key: string): [string, string] => {
    const at = key.indexOf(SEP);
    return [key.slice(0, at), key.slice(at + 1)];
  };

  // A file is a blob: a submodule's entry is a commit, which git cannot blame or read as text.
  const files = memoize((commit) => new Set(git(gitDir, "ls-tree", ["-r", "-z", commit]).split(SEP).filter((r) => r !== "").flatMap((record) => {
    const entry = TREE_ENTRY.exec(record);
    if (entry === null) throw new Error(`git ls-tree gave an entry that is not one: ${JSON.stringify(record.slice(0, 80))}`);
    return entry[1] === "blob" ? [entry[2] ?? ""] : [];
  })));

  const read = memoize((key): string | undefined => {
    const [commit, path] = split(key);
    return files(commit).has(path) ? git(gitDir, "cat-file", ["blob", `${commit}:${path}`]) : undefined;
  });

  const blame = memoize((key): readonly string[] => {
    const [commit, path] = split(key);
    const shas: string[] = [];
    let current: string | undefined;
    for (const line of git(gitDir, "blame", ["--line-porcelain", commit, "--", path]).split("\n")) {
      if (line.startsWith("\t")) {
        if (current === undefined) throw new Error(`git blame of ${path} gave a line with no commit`);
        shas.push(current);
        current = undefined;
        continue;
      }
      const header = BLAME_HEADER.exec(line);
      if (header !== null) current = Sha.parse(header[1]);
    }
    return shas;
  });

  const commit = memoize((sha): CommitInfo => {
    const fields = git(gitDir, "show", ["-s", "--format=%H%x00%an%x00%cI%x00%s%x00%(trailers:only,unfold)%x00%B", sha]).split(SEP);
    const [hash, author, date, subject, trailerText, body] = CommitFields.parse(fields);
    const trailers = trailersOf(trailerText);
    // Git reads trailers only from a message's last paragraph.
    const paragraphs = body.trimEnd().split(/\n[ \t]*\n/);
    const message = (trailers.length > 0 ? paragraphs.slice(0, -1) : paragraphs).join("\n\n");
    return { commit: hash, date, author, subject, message, trailers };
  });

  const lastChange = memoize((key): Version | undefined => {
    const [at, path] = split(key);
    const out = git(gitDir, "log", ["-1", "--format=%H%x00%cI", at, "--", path]).trim();
    if (out === "") return undefined;
    const [hash, date] = Change.parse(out.split(SEP));
    return { commit: hash, date };
  });

  const history = memoize((key): readonly Version[] => {
    const [at, path] = split(key);
    return git(gitDir, "log", ["--format=%H%x00%cI", at, "--", path]).split("\n").filter((l) => l !== "").map((l) => {
      const [hash, date] = Change.parse(l.split(SEP));
      return { commit: hash, date };
    });
  });

  return {
    root,
    resolve(revision) {
      let out: string;
      try {
        out = git(gitDir, "rev-parse", ["--verify", "--quiet", "--end-of-options", `${revision}^{commit}`]).trim();
      } catch {
        // A repository with nothing committed is the likeliest reason, and said plainly ([QBm]).
        if (git(gitDir, "log", ["--all", "-1", "--format=%H"]).trim() === "") {
          throw new TraceRefusal(`${root} has no commits yet: a trace reads what was committed, never the working tree, so commit, and trace again`);
        }
        throw new TraceRefusal(`${revision} names no commit in ${root}`);
      }
      const hash = Sha.safeParse(out);
      if (!hash.success) throw new TraceRefusal(`${revision} names no commit in ${root}`);
      return { commit: hash.data, date: Instant.parse(git(gitDir, "show", ["-s", "--format=%cI", hash.data]).trim()) };
    },
    files,
    read: (at, path) => read(`${at}${SEP}${path}`),
    blame: (at, path) => blame(`${at}${SEP}${path}`),
    commit,
    lastChange: (at, path) => lastChange(`${at}${SEP}${path}`),
    history: (at, path) => history(`${at}${SEP}${path}`),
    grep(at, pattern) {
      let ran: Ran;
      try {
        ran = run(gitDir, "grep", ["-I", "-n", "-z", "-E", "-e", pattern, at, "--"]);
      } catch (error) {
        // Git's grep exits 1 when nothing matches; what it passed over is still on its error stream.
        if (error instanceof GitFailure && error.status === 1) return { hits: [], passedOver: passedOver(at, error.stderr) };
        throw error;
      }
      const hits = ran.stdout.split("\n").filter((r) => r !== "").map((record) => {
        const [where = "", line, ...text] = record.split(SEP);
        const [path, n, t] = GrepRecord.parse([where.slice(at.length + 1), line, text.join(SEP)]);
        return { path, line: n, text: t };
      });
      return { hits, passedOver: passedOver(at, ran.stderr) };
    },
    commitsCiting(at, pattern) {
      return git(gitDir, "log", ["--format=%H", "-E", `--grep=${pattern}`, at]).split("\n").filter((l) => l !== "").map((l) => Sha.parse(l));
    },
    touched(sha) {
      return git(gitDir, "diff-tree", ["--no-commit-id", "--name-only", "-r", "-z", "--root", sha]).split(SEP).filter((p) => p !== "");
    },
  };
}
