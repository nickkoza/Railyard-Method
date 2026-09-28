// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// What a shell command wrote ([G0i]): a command names no files, and parsing one for the files it
// writes misses every write made by a program it runs. So the scan looks: it asks git which files
// differ from the last commit, and compares each one's modification time and size with what it saw
// the last time it ran (traceability's Decisions).
//
// The same note also keeps, per file, each named thing's own witness as of the last time that
// file's names were reported: what tells a later write's report what it actually changed, as
// opposed to what was already true of the file before it ([G0i], the Decisions). Neither a link's
// own witness (an unlinked name carries none) nor git's `HEAD` (a file never committed has none)
// holds for every file, so this note — already kept for the shell write — is the one extended.
//
// What it saw is kept in the repository's own git directory, never in the tree: there it is never
// committed or shown as a change, belongs to one work tree, and needs no ignore rule. It is a note of
// what was last looked at, not a record: losing it costs one scan that names the whole change again.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";

const STATE = "railyard-scan.json";

/** Read from a file this tool wrote, and validated, since anything may have written over it since. */
const Seen = z.strictObject({
  seen: z.record(z.string(), z.string()),
  /** Per file, each named thing's witness as of the last time that file was reported. */
  names: z.record(z.string(), z.record(z.string(), z.string())).default({}),
});
type State = z.infer<typeof Seen>;

export type Changes = {
  /** Files that differ from the last commit and changed since the last scan, the most recently written first. */
  readonly written: readonly string[];
  /** Files deleted since the last commit that the last scan saw still there. */
  readonly deleted: readonly string[];
};

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", ["-c", "core.fsmonitor=false", "-c", "core.quotepath=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 });
}

/** Where the note of what the scan last saw is kept, or undefined outside a git repository. */
function statePath(root: string): string | undefined {
  try {
    const path = git(root, ["rev-parse", "--git-path", STATE]).trim();
    return path === "" ? undefined : isAbsolute(path) ? path : join(root, path);
  } catch {
    return undefined;
  }
}

function readState(path: string): State {
  try {
    const parsed = Seen.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : { seen: {}, names: {} };
  } catch {
    return { seen: {}, names: {} };
  }
}

function writeState(path: string, state: State): void {
  // Written whole and moved into place, so two hooks at once leave one note or the other, never half of each.
  const next = `${path}.${String(process.pid)}`;
  writeFileSync(next, `${JSON.stringify(state)}\n`);
  renameSync(next, path);
}

/** A file as a write leaves it: its modification time and size, or gone. */
function signature(root: string, file: string): string {
  try {
    const s = statSync(join(root, file));
    return `${String(Math.trunc(s.mtimeMs))}:${String(s.size)}`;
  } catch {
    return "gone";
  }
}

/** The files that differ from the last commit, untracked among them and ignored ones not, each with whether it is deleted. */
function inTheChange(root: string): { readonly file: string; readonly deleted: boolean }[] {
  // Git names each file from the top of the repository, which a project may sit below.
  const prefix = git(root, ["rev-parse", "--show-prefix"]).trim();
  const out = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames", "--", "."]);
  return out.split("\0").filter((e) => e.length > 3 && e.slice(3).startsWith(prefix)).map((e) => ({ file: e.slice(3 + prefix.length), deleted: e.slice(0, 2).includes("D") }));
}

/**
 * The files changed since the scan last looked, of those `relevant` accepts, and the note updated
 * to what is there now. Undefined outside a git repository, where which files are the repository's
 * is not known.
 */
export function changedSinceLastScan(root: string, relevant: (file: string) => boolean): Changes | undefined {
  const path = statePath(root);
  if (path === undefined) return undefined;
  let change: { readonly file: string; readonly deleted: boolean }[];
  try {
    change = inTheChange(root).filter((c) => relevant(c.file));
  } catch {
    return undefined;
  }
  const state = readState(path);
  const before = state.seen;
  const now: Record<string, string> = {};
  const written: { readonly file: string; readonly at: number }[] = [];
  const deleted: string[] = [];
  for (const c of change) {
    const sig = c.deleted && !existsSync(join(root, c.file)) ? "gone" : signature(root, c.file);
    now[c.file] = sig;
    if (before[c.file] === sig) continue;
    if (sig === "gone") deleted.push(c.file);
    else written.push({ file: c.file, at: Number(sig.split(":")[0]) });
  }
  writeState(path, { ...state, seen: now });
  return { written: written.sort((a, b) => b.at - a.at || a.file.localeCompare(b.file)).map((w) => w.file), deleted: deleted.sort() };
}

/** Notes a file a file tool wrote, and the scan answered, as seen: the next command does not name it again. */
export function remember(root: string, file: string): void {
  const path = statePath(root);
  if (path === undefined) return;
  const state = readState(path);
  writeState(path, { ...state, seen: { ...state.seen, [file]: signature(root, file) } });
}

/**
 * The names among `things` new since the last time `file`'s names were reported, or whose witness
 * has changed since ([G0i]): what a write actually touched, as opposed to what was already true of
 * the file before it. The note is updated to what is there now, whether or not a name is touched,
 * so the next write's "before" is always this write's "after."
 *
 * Undefined outside a git repository, where the note has nowhere fixed to live: every name then
 * reads as touched, the same as before this bound existed — noisy is the safe direction to fail in,
 * never silent ([Wuq]). The first time this runs over a file already full of history, the note
 * holds nothing for it yet, so everything reads as touched, once — the same rule a whole new file
 * already reads by.
 */
export function touchedNames(root: string, file: string, things: readonly { readonly name: string; readonly witness: string }[]): ReadonlySet<string> | undefined {
  const path = statePath(root);
  if (path === undefined) return undefined;
  const state = readState(path);
  const before = state.names[file] ?? {};
  const touched = new Set(things.filter((t) => before[t.name] !== t.witness).map((t) => t.name));
  writeState(path, { ...state, names: { ...state.names, [file]: Object.fromEntries(things.map((t) => [t.name, t.witness])) } });
  return touched;
}
