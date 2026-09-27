// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// What a shell command wrote ([G0i]): a command names no files, and parsing one for the files it
// writes misses every write made by a program it runs. So the scan looks: it asks git which files
// differ from the last commit, and compares each one's modification time and size with what it saw
// the last time it ran (traceability's Decisions).
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
const Seen = z.strictObject({ seen: z.record(z.string(), z.string()) });

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

function readSeen(path: string): Record<string, string> {
  try {
    const parsed = Seen.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data.seen : {};
  } catch {
    return {};
  }
}

function writeSeen(path: string, seen: Record<string, string>): void {
  // Written whole and moved into place, so two hooks at once leave one note or the other, never half of each.
  const next = `${path}.${String(process.pid)}`;
  writeFileSync(next, `${JSON.stringify({ seen })}\n`);
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
  const before = readSeen(path);
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
  writeSeen(path, now);
  return { written: written.sort((a, b) => b.at - a.at || a.file.localeCompare(b.file)).map((w) => w.file), deleted: deleted.sort() };
}

/** Notes a file a file tool wrote, and the scan answered, as seen: the next command does not name it again. */
export function remember(root: string, file: string): void {
  const path = statePath(root);
  if (path === undefined) return;
  writeSeen(path, { ...readSeen(path), [file]: signature(root, file) });
}
