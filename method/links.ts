// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Links kept per source file as the code is written ([CS8], [G0i], [Zs7]), and the scan that keeps
// them true ([5jT]). traceability's Decisions pin the shape: one file per source file, at a path
// derived from its own, its entries sorted by name so the same links are the same bytes.
//
// A link joins a named thing in a file to an ID it implements. It carries two witnesses: one of
// the thing's own lines, and one of the artifact's text, each as it was when the link was made. The
// scan compares both with what is there now; it never changes a link, because only whoever wrote
// the code knows whether it still implements what it did ([Zs7]).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { z } from "zod";
import { fromDirectory, indexOf } from "../ids/resolve.ts";
import type { Indexed } from "../ids/resolve.ts";
import { namedThings } from "../traceability/anchor.ts";
import type { Finding } from "./artifacts.ts";
import { isCode } from "./paths.ts";

const FORMAT = "railyard-links";
const FORMAT_VERSION = "0.1.0";

const Link = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9]{3}$/),
  /** asserted: recorded by whoever wrote the code ([CS8]), the only kind that carries intent. */
  kind: z.enum(["asserted"]),
  /** A witness of the artifact's text when the link was made. */
  artifact: z.string().regex(/^[0-9a-f]{16}$/),
  at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const Entry = z.strictObject({
  name: z.string().min(1),
  /** A witness of the thing's own lines when it was last linked. */
  witness: z.string().regex(/^[0-9a-f]{16}$/),
  links: z.array(Link).min(1),
});

const LinksFile = z.strictObject({
  format: z.literal(FORMAT),
  formatVersion: z.literal(FORMAT_VERSION),
  path: z.string().min(1),
  entries: z.array(Entry),
});

export type LinksFile = z.infer<typeof LinksFile>;

/** Where a source file's links are kept: `symbols/links/<its path>.json`. */
export function linksPath(root: string, file: string): string {
  return join(root, "symbols", "links", `${file}.json`);
}

export function readLinks(root: string, file: string): LinksFile | undefined {
  const path = linksPath(root, file);
  if (!existsSync(path)) return undefined;
  const parsed = LinksFile.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${path} is not a links file: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  return parsed.data;
}

function write(root: string, file: string, entries: z.infer<typeof Entry>[]): void {
  const path = linksPath(root, file);
  if (entries.length === 0) {
    rmSync(path, { force: true });
    return;
  }
  const sorted = [...entries]
    .map((e) => ({ ...e, links: [...e.links].sort((a, b) => a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify({ format: FORMAT, formatVersion: FORMAT_VERSION, path: file, entries: sorted }, null, 2)}\n`);
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function artifacts(root: string): ReadonlyMap<string, Indexed> {
  return indexOf(fromDirectory(root));
}

function thingsIn(root: string, file: string): ReturnType<typeof namedThings> {
  return namedThings(readFileSync(join(root, file), "utf8"));
}

/**
 * Links a named thing in `file` to each of `ids`, as whoever wrote it ([CS8]). Linking a thing
 * again confirms it: its witnesses become what is there now. Refuses, writing nothing, a name the
 * file does not have and an ID that names nothing in the repository.
 */
export function link(root: string, file: string, name: string, ids: readonly string[], today: string): void {
  const thing = thingsIn(root, file).find((t) => t.name === name);
  if (thing === undefined) throw new Error(`${file} has no named thing "${name}"; run links ${file} to see the names it has`);
  const known = artifacts(root);
  for (const id of ids) {
    if (!known.has(id)) throw new Error(`[${id}] names nothing in this repository`);
  }
  const entries = readLinks(root, file)?.entries.filter((e) => e.name !== name) ?? [];
  const kept = readLinks(root, file)?.entries.find((e) => e.name === name)?.links.filter((l) => !ids.includes(l.id)) ?? [];
  const refreshed = kept.map((l) => ({ ...l, artifact: hashOf(known.get(l.id)?.body ?? "") }));
  const added = ids.map((id) => ({ id, kind: "asserted" as const, artifact: hashOf(known.get(id)?.body ?? ""), at: today }));
  write(root, file, [...entries, { name, witness: thing.witness, links: [...refreshed, ...added] }]);
}

/** Removes `ids` from a thing's links, or every link it has when none are named. Answers whether anything was actually removed. */
export function unlink(root: string, file: string, name: string, ids: readonly string[]): boolean {
  let removed = false;
  const entries = (readLinks(root, file)?.entries ?? []).flatMap((e) => {
    if (e.name !== name) return [e];
    const links = ids.length === 0 ? [] : e.links.filter((l) => !ids.includes(l.id));
    if (links.length !== e.links.length) removed = true;
    return links.length === 0 ? [] : [{ ...e, links }];
  });
  if (removed) write(root, file, entries);
  return removed;
}

export type Scan = {
  readonly file: string;
  /** Whether the file has links at all ([Zs7]): an untracked file is a state, not a failure. */
  readonly tracked: boolean;
  /** Links whose code, or whose artifact's text, has changed since they were made. */
  readonly suspect: readonly { readonly name: string; readonly ids: readonly string[]; readonly why: "code" | "artifact" }[];
  /** Linked things that are no longer in the file, and the file in the same change that has a thing of that name now, where one does. */
  readonly missing: readonly { readonly name: string; readonly ids: readonly string[]; readonly to?: string }[];
  /** Named things with no link. */
  readonly unlinked: readonly string[];
  /** Links whose ID no longer names anything. */
  readonly gone: readonly { readonly name: string; readonly id: string }[];
  /** Of those with no link, each whose name another file in the same change had linked, and lost: moved here, most likely. */
  readonly arrived: readonly { readonly name: string; readonly ids: readonly string[]; readonly from: string }[];
};

/** The files the change in progress touches: those that differ from HEAD, deleted ones among them, and new ones. None outside git. */
function inTheChange(root: string): string[] {
  const git = (...args: string[]): string[] =>
    execFileSync("git", ["-c", "core.fsmonitor=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter((f) => f !== "");
  try {
    let changed: string[];
    try {
      changed = git("diff", "--name-only", "HEAD");
    } catch {
      changed = git("ls-files", "--cached"); // No commit yet: everything is the change.
    }
    return [...new Set([...changed, ...git("ls-files", "--others", "--exclude-standard")])];
  } catch {
    return [];
  }
}

/** Each named thing in a file, or none where the file is gone. */
function namesIn(root: string, file: string): ReadonlySet<string> {
  return existsSync(join(root, file)) ? new Set(thingsIn(root, file).map((t) => t.name)) : new Set();
}

/**
 * Where a name gone from `file` is now, and where each name new in it was linked before, among the
 * other files of the same change ([G0i]): a thing moved between files reads as gone in one and new
 * in the other, and the agent that moved it should be told it is the same thing.
 */
function moves(root: string, file: string, missing: readonly string[], unlinked: readonly string[]): { readonly to: ReadonlyMap<string, string>; readonly arrived: Scan["arrived"] } {
  const to = new Map<string, string>();
  const arrived: { name: string; ids: string[]; from: string }[] = [];
  if (missing.length === 0 && unlinked.length === 0) return { to, arrived };
  const others = inTheChange(root).filter((f) => f !== file && isCode(f)).sort();
  for (const other of others) {
    const names = namesIn(root, other);
    for (const name of missing) if (!to.has(name) && names.has(name)) to.set(name, other);
  }
  for (const name of unlinked) {
    for (const other of others) {
      const kept = (() => {
        try {
          return readLinks(root, other);
        } catch {
          return undefined;
        }
      })();
      const lost = kept?.entries.find((e) => e.name === name);
      if (lost === undefined || namesIn(root, other).has(name)) continue;
      arrived.push({ name, ids: lost.links.map((l) => l.id), from: other });
      break;
    }
  }
  return { to, arrived };
}

/** Compares `file`'s links with its code and with the artifacts they name ([5jT]); changes nothing. */
export function scan(root: string, file: string): Scan {
  const things = thingsIn(root, file);
  const kept = readLinks(root, file);
  if (kept === undefined) {
    const unlinked = things.map((t) => t.name);
    return { file, tracked: false, suspect: [], missing: [], unlinked, gone: [], arrived: moves(root, file, [], unlinked).arrived };
  }
  const known = artifacts(root);
  const now = new Map(things.map((t) => [t.name, t.witness]));
  const suspect: { name: string; ids: string[]; why: "code" | "artifact" }[] = [];
  const missing: { name: string; ids: string[] }[] = [];
  const gone: { name: string; id: string }[] = [];
  for (const entry of kept.entries) {
    const witness = now.get(entry.name);
    const ids = entry.links.map((l) => l.id);
    if (witness === undefined) {
      missing.push({ name: entry.name, ids });
      continue;
    }
    for (const l of entry.links) if (!known.has(l.id)) gone.push({ name: entry.name, id: l.id });
    if (witness !== entry.witness) {
      suspect.push({ name: entry.name, ids, why: "code" });
      continue;
    }
    const changed = entry.links.filter((l) => known.has(l.id) && hashOf(known.get(l.id)?.body ?? "") !== l.artifact).map((l) => l.id);
    if (changed.length > 0) suspect.push({ name: entry.name, ids: changed, why: "artifact" });
  }
  const linked = new Set(kept.entries.map((e) => e.name));
  const unlinked = things.map((t) => t.name).filter((n) => !linked.has(n));
  const moved = moves(root, file, missing.map((m) => m.name), unlinked);
  return {
    file,
    tracked: true,
    suspect,
    missing: missing.map((m) => {
      const to = moved.to.get(m.name);
      return to === undefined ? m : { ...m, to };
    }),
    unlinked,
    gone,
    arrived: moved.arrived,
  };
}

export { isCode, NOT_SOURCE } from "./paths.ts";

function linksFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    return e.isDirectory() ? linksFiles(path) : e.name.endsWith(".json") ? [path] : [];
  });
}

/** How many links in the repository name one of `ids`: what a change to those artifacts' text leaves to confirm. */
export function linksTo(root: string, ids: ReadonlySet<string>): number {
  let n = 0;
  for (const path of linksFiles(join(root, "symbols", "links"))) {
    const parsed = LinksFile.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) continue;
    for (const e of parsed.data.entries) n += e.links.filter((l) => ids.has(l.id)).length;
  }
  return n;
}

/** A thing whose links name an artifact whose text has changed since, and the IDs they name. */
export type Confirm = { readonly file: string; readonly name: string; readonly ids: readonly string[] };

/**
 * Each linked thing whose link into `artifact` (a spec, a waymark, the principles or a model, by
 * its path) no longer witnesses that artifact's text: what a write to it leaves to confirm ([G0i]).
 * A thing whose own file is gone is `check`'s to name, not this.
 */
export function changedUnder(root: string, artifact: string): Confirm[] {
  const known = artifacts(root);
  const out: Confirm[] = [];
  for (const path of linksFiles(join(root, "symbols", "links")).sort()) {
    const parsed = LinksFile.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success || !existsSync(join(root, parsed.data.path))) continue;
    for (const e of parsed.data.entries) {
      const ids = e.links.filter((l) => {
        const now = known.get(l.id);
        return now !== undefined && now.path === artifact && hashOf(now.body) !== l.artifact;
      }).map((l) => l.id);
      if (ids.length === 0) continue;
      out.push({ file: parsed.data.path, name: e.name, ids });
    }
  }
  return out;
}

/**
 * The state of the repository's links, for `check` ([G0i]): each link a change left suspect,
 * missing or gone, each links file whose source no longer exists, and how many source files have
 * no links at all ([Zs7]). Every one is a notice: the scan observes, and never gates.
 */
export function checkLinks(root: string): Finding[] {
  const found: Finding[] = [];
  const notice = (message: string): void => { found.push({ rule: "G0i", notice: true, message }); };
  const stale = (message: string): void => { found.push({ rule: "G0i", notice: true, stale: true, message }); };
  const kept = new Set<string>();
  for (const path of linksFiles(join(root, "symbols", "links"))) {
    const file = relative(join(root, "symbols", "links"), path).split(sep).join("/").replace(/\.json$/, "");
    kept.add(file);
    if (!existsSync(join(root, file))) {
      stale(`symbols/links/${file}.json keeps links for ${file}, which no longer exists: link whatever implements them now, and remove it`);
      continue;
    }
    const r = scan(root, file);
    for (const x of r.suspect) stale(`${file}#${x.name}: ${x.why === "code" ? "its code" : "the text of what it implements"} changed since it was linked to ${x.ids.map((i) => `[${i}]`).join(", ")}`);
    for (const x of r.missing) stale(`${file}#${x.name} is gone, and was linked to ${x.ids.map((i) => `[${i}]`).join(", ")}${x.to === undefined ? "" : `; ${x.to} has a ${x.name} now`}`);
    for (const x of r.gone) stale(`${file}#${x.name} is linked to [${x.id}], which names nothing`);
  }
  let listed: string[] = [];
  try {
    listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f !== "");
  } catch {
    return found; // Not a git repository: which files are source is not known, so nothing is counted.
  }
  const untracked = listed.filter((f) => isCode(f) && !kept.has(f) && existsSync(join(root, f))).filter((f) => {
    try {
      return namedThings(readFileSync(join(root, f), "utf8")).length > 0;
    } catch {
      return false;
    }
  });
  if (untracked.length > 0) {
    const n = untracked.length;
    notice(`${String(n)} source file${n === 1 ? " has" : "s have"} no links, so nothing traces ${n === 1 ? "it" : "them"} to what ${n === 1 ? "it implements" : "they implement"}: ${untracked.slice(0, 5).join(", ")}${n > 5 ? `, and ${String(n - 5)} more` : ""}`);
  }
  return found;
}
