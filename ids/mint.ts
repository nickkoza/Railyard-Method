// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `mentionsIn`, `mentionsSince` and `mintIds` ([9pu]): the rule `ids-take` runs, exported so
// whatever else mints an ID reads this answer instead of a second implementation of it
// ([XLT]'s [9pu], its text and its Decisions).
//
// An ID is taken when its three bare characters appear anywhere in a tracked file as it
// stands, edits not yet committed among them; in any version of any file reachable from any
// ref, a file since deleted among them; or in any commit's message. The search is
// deliberately naive and over-eager, because a false positive costs one re-roll and nothing
// else, and a false negative gives an old citation a new meaning.
//
// A full read costs seconds even where it is fast, which a process that mints more than once
// cannot pay every time. `mentionsSince` takes a previous answer — which carries the ref tips
// it was read at — and reads only what a tip that has since moved reaches and the previous
// tips did not: `git rev-list --objects --ignore-missing --stdin`, fed the moved tips and the
// previous tips as `^`-prefixed exclusions, and `git log --format=%B --ignore-missing --stdin`
// over the same revisions for messages ([XLT]'s Decisions).
//
// A bare repository is read too: its history and commit messages are the whole of what is
// taken there, since it has no tracked tree, and the answer's `trackedTree` says which was read
// ([XLT]'s Decisions).
//
// Every read is asynchronous and streams git's output, so a long-running consumer's event loop is
// never held for the length of a read, only for one pipe read's worth of scanning at a time
// ([XLT]'s Decisions).
//
// It writes nothing, to the repository it reads or anywhere else.
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { randomInt } from "node:crypto";
import { join } from "node:path";
import { freeId } from "./take.ts";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const LENGTH = 3;

/**
 * Git reads the repository only, with an environment of its own: none of the caller's GIT_*, no
 * system or global configuration, no hooks, no fsmonitor, no prompt. Restated from traceability's
 * runner rather than imported, as that runner restates the daemon's. PATH is read fresh on every
 * call, not frozen at import: the one thing a caller may legitimately need to change is where the
 * `git` on it is found.
 */
const FLAGS = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "color.ui=never"] as const;
function environment(): Readonly<Record<string, string>> {
  return {
    PATH: process.env["PATH"] ?? "/usr/bin:/bin",
    HOME: process.env["HOME"] ?? "/nonexistent",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
  };
}

/** Git could not answer; the message is git's own first line. */
export class Unreadable extends Error {
  override readonly name = "Unreadable";
}

/**
 * Runs git asynchronously, handing each chunk of its output to `sink` as it arrives, so neither
 * the wait nor the output's size holds the caller's event loop. Settles once git has exited and
 * every chunk has been handed on; rejects with `Unreadable` when git cannot be run or exits
 * non-zero, or with whatever `sink` threw.
 */
function gitStream(cwd: string, args: readonly string[], input: string | undefined, sink: (chunk: Buffer) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...FLAGS, ...args], { cwd, env: environment(), stdio: ["pipe", "pipe", "pipe"] });
    const stderr: Buffer[] = [];
    let failed: unknown;
    child.stdout.on("data", (chunk: Buffer) => {
      if (failed !== undefined) return;
      try {
        sink(chunk);
      } catch (e) {
        failed = e;
        child.kill();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    // A git that exits before reading all it was fed closes its stdin; its exit status says why.
    child.stdin.on("error", () => undefined);
    child.on("error", (e) => {
      failed ??= new Unreadable(`git could not be run: ${e.message}`);
    });
    child.on("close", (status, signal) => {
      if (failed !== undefined) {
        reject(failed instanceof Error ? failed : new Error(String(failed)));
        return;
      }
      if (status !== 0) {
        const said = Buffer.concat(stderr).toString("utf8").trim().split("\n")[0] ?? "";
        reject(new Unreadable(said === "" ? `git ${args.find((a) => !a.startsWith("-") && !a.includes("=")) ?? ""} exited with ${String(status ?? signal)}` : said));
        return;
      }
      resolve();
    });
    child.stdin.end(input ?? "");
  });
}

/** Runs git asynchronously and answers its whole output, for the answers small enough to hold: names and lists, never file contents. */
async function git(cwd: string, args: readonly string[], input?: string): Promise<Buffer> {
  const out: Buffer[] = [];
  await gitStream(cwd, args, input, (chunk) => out.push(chunk));
  return Buffer.concat(out);
}

/** Where a repository's history is, and its tracked tree's top level when it has one: `undefined` in a bare repository. */
type Located = { readonly gitDir: string; readonly toplevel: string | undefined };

/** The repository at or above `cwd`, bare or not, so a read started from any directory in it reads the whole thing. */
async function locate(cwd: string): Promise<Located> {
  try {
    const [gitDir = "", bare = "", inside = ""] = (await git(cwd, ["rev-parse", "--absolute-git-dir", "--is-bare-repository", "--is-inside-work-tree"])).toString("utf8").split("\n");
    if (bare === "true") return { gitDir, toplevel: undefined };
    if (inside !== "true") throw new Unreadable(`${cwd} is inside a git directory, neither a work tree nor a bare repository`);
    return { gitDir, toplevel: (await git(cwd, ["rev-parse", "--show-toplevel"])).toString("utf8").trim() };
  } catch (e) {
    if (!(e instanceof Unreadable)) throw e;
    const why = /not a git repository/i.test(e.message) ? `${cwd} is not in a git repository` : e.message;
    throw new Unreadable(why);
  }
}

/** The bytes a word is made of: the alphabet an ID is drawn from. */
const WORD = new Uint8Array(256);
for (const c of ALPHABET) WORD[c.charCodeAt(0)] = 1;

/** Where a scan stands between one chunk and the next, so a run of three split across two chunks is still seen. */
type Scan = { run: number; key: number };

/** Which runs of three letters or digits have been seen, by their bytes: one bit per possible run of three bytes, 2 MiB. Never cleared: what either read adds is never taken back ([9pu]). */
class Bits {
  private readonly bits = new Uint8Array(1 << 21);

  /** Every run of three in `bytes`, anywhere, inside a longer word too: the search is over-eager on purpose. `scan` carries a run across chunks of one stream. */
  add(bytes: Uint8Array, from = 0, to = bytes.length, scan: Scan = { run: 0, key: 0 }): void {
    let { run, key } = scan;
    for (let i = from; i < to; i += 1) {
      const c = bytes[i] ?? 0;
      if (WORD[c] === 1) {
        run += 1;
        key = ((key << 8) | c) & 0xffffff;
        if (run >= LENGTH) this.bits[key >>> 3] = (this.bits[key >>> 3] ?? 0) | (1 << (key & 7));
      } else {
        run = 0;
      }
    }
    scan.run = run;
    scan.key = key;
  }

  has(id: string): boolean {
    // Anything but three of the alphabet's own characters is no ID a draw could make, so it reads as taken.
    if (id.length !== LENGTH || WORD[id.charCodeAt(0)] !== 1 || WORD[id.charCodeAt(1)] !== 1 || WORD[id.charCodeAt(2)] !== 1) return true;
    const key = (id.charCodeAt(0) << 16) | (id.charCodeAt(1) << 8) | id.charCodeAt(2);
    return ((this.bits[key >>> 3] ?? 0) & (1 << (key & 7))) !== 0;
  }
}

/** What a repository's tracked tree, reachable history and commit messages mention, as of the ref tips it was read at. */
export type Mentions = {
  /** Whether any tracked file as it stands, any version of any file reachable from any ref, or any commit's message ever held these three characters. Anything that is not three of an ID's letters and digits reads as taken, since no draw makes it. */
  has(id: string): boolean;
  /** Whether a work tree's tracked files, as they stand, were read: false in a bare repository, which has none, so there only history and commit messages were. */
  readonly trackedTree: boolean;
  /** The ref tips history was read to. Pass this answer to `mentionsSince` to read only what a tip beyond these reaches. */
  readonly tips: ReadonlySet<string>;
};

/** `Mentions`'s bits, kept off the public shape so a caller sees only `has` and `tips`; `mentionsSince` reads and extends the same array in place, since what either read adds is never taken back. */
const backing = new WeakMap<Mentions, Bits>();

function wrap(bits: Bits, tips: ReadonlySet<string>, trackedTree: boolean): Mentions {
  const mentions: Mentions = { has: (id) => bits.has(id), tips, trackedTree };
  backing.set(mentions, bits);
  return mentions;
}

/** Every tracked file as it stands, edits not yet committed among them. Re-read in full every call: there is no ref tip to compare a working-tree edit against. */
async function trackedFiles(root: string, bits: Bits): Promise<void> {
  const files = (await git(root, ["ls-files", "-z"])).toString("utf8").split("\0").filter((f) => f !== "");
  for (const file of files) {
    try {
      // Streamed, a chunk scanned at a time, so a large file holds the event loop no longer than a small one.
      const scan: Scan = { run: 0, key: 0 };
      for await (const chunk of createReadStream(join(root, file))) {
        if (!(chunk instanceof Uint8Array)) continue;
        bits.add(chunk, 0, chunk.length, scan);
      }
    } catch {
      // A tracked file missing from the tree was deleted and not yet committed; what it held
      // is in history, which is read too.
    }
  }
}

/** Every ref's tip, by its object name. */
async function refTips(gitDir: string): Promise<Set<string>> {
  return new Set((await git(gitDir, [`--git-dir=${gitDir}`, "for-each-ref", "--format=%(objectname)"])).toString("utf8").split("\n").filter((t) => t !== ""));
}

/**
 * A sink for `git cat-file --batch=%(objectsize)`'s output, which comes as `<size>\n<bytes>\n`
 * per version: it scans only the bytes, so no object's name is read, and a version or its header
 * split across chunks is carried to the next.
 */
function versionsInto(bits: Bits): (chunk: Buffer) => void {
  let header = "";
  /** Bytes of the current version still to come, or -1 between versions. */
  let remaining = -1;
  /** The newline after a version, still to skip. */
  let trailing = false;
  let scan: Scan = { run: 0, key: 0 };
  return (chunk) => {
    let at = 0;
    while (at < chunk.length) {
      if (trailing) {
        at += 1;
        trailing = false;
        continue;
      }
      if (remaining < 0) {
        const eol = chunk.indexOf(10, at);
        if (eol < 0) {
          header += chunk.toString("latin1", at);
          return;
        }
        header += chunk.toString("latin1", at, eol);
        const length = Number(header);
        if (header === "" || !Number.isInteger(length) || length < 0) throw new Unreadable(`git cat-file answered in a shape this does not read: ${header.slice(0, 80)}`);
        header = "";
        remaining = length;
        scan = { run: 0, key: 0 };
        at = eol + 1;
        continue;
      }
      const end = Math.min(chunk.length, at + remaining);
      bits.add(chunk, at, end, scan);
      remaining -= end - at;
      at = end;
      if (remaining === 0) {
        remaining = -1;
        trailing = true;
      }
    }
  };
}

/** Every distinct file version, and every commit message, that a tip in `moved` reaches and no tip in `excluded` already did. */
async function readHistorySince(gitDir: string, bits: Bits, moved: readonly string[], excluded: ReadonlySet<string>): Promise<void> {
  if (moved.length === 0) return;
  const at = [`--git-dir=${gitDir}`];
  // `--ignore-missing`: a tip read before and since gone from the answer being extended (a branch
  // deleted, its objects pruned) is skipped rather than refused — excluding less only reads more.
  const revisions = `${[...moved, ...[...excluded].map((t) => `^${t}`)].join("\n")}\n`;
  const objects = (await git(gitDir, [...at, "rev-list", "--objects", "--ignore-missing", "--stdin"], revisions)).toString("utf8")
    .split("\n").map((l) => l.split(" ")[0] ?? "").filter((o) => o !== "");
  if (objects.length > 0) {
    const blobs = (await git(gitDir, [...at, "cat-file", "--batch-check=%(objecttype) %(objectname)"], `${objects.join("\n")}\n`)).toString("utf8")
      .split("\n").map((l) => l.split(" ")).filter(([type]) => type === "blob").map(([, name = ""]) => name);
    if (blobs.length > 0) await gitStream(gitDir, [...at, "cat-file", "--batch=%(objectsize)"], `${blobs.join("\n")}\n`, versionsInto(bits));
  }
  const scan: Scan = { run: 0, key: 0 };
  await gitStream(gitDir, [...at, "log", "--format=%B", "--ignore-missing", "--stdin"], revisions, (chunk) => bits.add(chunk, 0, chunk.length, scan));
}

/**
 * Which three-character runs `cwd`'s repository's tracked tree, reachable history and commit
 * messages mention, read whole ([9pu]). `cwd` may be anywhere in a work tree, or a bare
 * repository, where there is no tracked tree and the answer's `trackedTree` is false.
 */
export function mentionsIn(cwd: string): Promise<Mentions> {
  return mentionsSince(cwd, wrap(new Bits(), new Set(), false));
}

/**
 * Extends `previous` to the ref tips as they stand now: tracked files, where there is a work
 * tree, are re-read in full, and history and commit messages are read only from a tip beyond the
 * ones `previous` already carries. Reading the answer `mentionsIn` gave straight back through this
 * costs one `for-each-ref` and nothing more, since no tip has moved.
 */
export async function mentionsSince(cwd: string, previous: Mentions): Promise<Mentions> {
  const bits = backing.get(previous);
  if (bits === undefined) throw new Error("mentionsSince: previous was not read by mentionsIn or mentionsSince");
  const { gitDir, toplevel } = await locate(cwd);
  if (toplevel !== undefined) await trackedFiles(toplevel, bits);
  const tips = await refTips(gitDir);
  const moved = [...tips].filter((t) => !previous.tips.has(t));
  await readHistorySince(gitDir, bits, moved, previous.tips);
  return wrap(bits, tips, toplevel !== undefined);
}

function draw(): string {
  let out = "";
  for (let i = 0; i < LENGTH; i += 1) out += ALPHABET.charAt(randomInt(ALPHABET.length));
  return out;
}

/**
 * `count` free IDs, none the same within the batch: none `mentions` says is taken, and none
 * `alsoTaken` does, when given — a consumer's own rule for what it holds outside git, asked of
 * each candidate `mentions` leaves free, answering at once or later. When `alsoTaken` fails, the
 * promise rejects with its error and nothing is offered.
 */
export async function mintIds(mentions: Mentions, count: number, alsoTaken?: (id: string) => boolean | Promise<boolean>): Promise<string[]> {
  const drawn = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    const taken = (id: string): boolean | Promise<boolean> => mentions.has(id) || drawn.has(id) || (alsoTaken?.(id) ?? false);
    drawn.add((await freeId(taken, draw)).id);
  }
  return [...drawn];
}
