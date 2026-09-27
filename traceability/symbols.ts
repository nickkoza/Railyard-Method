// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The symbols file ([LRA]): a
// directory of one shared index and one file per version, each version holding
// only the files that changed since its base. It records source positions and,
// for each, its links back. Reading one runs no git: a symbols directory is
// enough to answer. The format is published beside this file, in
// symbols.schema.json, and documented in FORMAT.md; a reader ignores a field it
// does not know.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { Anchor } from "./anchor.ts";
import { Artifact, Evidence, Instant, MadeBy, Sha, State, TraceRefusal, Version } from "./model.ts";

export const FORMAT = "railyard-symbols";
export const VERSION_FORMAT = "railyard-symbols-version";
export const FORMAT_VERSION = "0.3.3";
/** The index, and the directory each version's file lives in. */
const INDEX = "index.json";
const VERSIONS = "versions";

const Nat = z.number().int().nonnegative();
const Line = z.number().int().positive();
const BuildHash = z.string().regex(/^[0-9a-f]{64}$/);
/** Every document is read loosely: a field a reader does not know is ignored, which is the format's compatibility rule. */
const ArtifactRow = z.looseObject({ kind: z.string().min(1), path: z.string().min(1), anchor: z.string().min(1).nullable(), label: z.string().min(1), id: z.string().min(1).optional() });
const CommitRow = z.looseObject({ sha: Sha, date: Instant.nullable() });
const MadeByRow = z.looseObject({ commit: Nat, path: Nat.nullable(), line: Line.nullable() });
const LinkRow = z.looseObject({
  artifact: Nat,
  evidence: Evidence,
  source: z.string().min(1),
  state: State,
  linked: Nat.nullable(),
  current: Nat.nullable(),
  /** The artifact's content hash at each end ([EaR]). Here rather than on a commit, because the
   *  hash is of THIS artifact at that commit and a commit carries many. Absent on a link written
   *  before this was carried; absent is "cannot compare", never "unchanged". */
  linkedContent: z.string().min(1).optional(),
  currentContent: z.string().min(1).optional(),
  madeBy: MadeByRow,
});
/** A position's links are their places in the index's shared table, so each distinct link is written once (FORMAT.md's shared `links` table). */
/** A position's row. `names` is what it names ([LdF]) — absent where nothing does, which is
 *  honest rather than a guessed name: a wrong name is worse than none, because it is believed. */
const PositionRow = z.looseObject({ at: z.tuple([Line, Line, Line, Line]), names: z.string().min(1).optional(), links: z.array(Nat) });
const VersionEntry = z.looseObject({ commit: Nat, base: Nat.nullable(), file: z.string().min(1), builds: z.array(BuildHash) });
type VersionEntry = z.infer<typeof VersionEntry>;
/** What every document carries: read before the rest, so that a file of another format is named as one rather than as a file with fields missing. */
const Stamped = z.looseObject({ format: z.string(), formatVersion: z.string().min(1) });
const IndexDocument = z.looseObject({
  format: z.string(),
  formatVersion: z.string().min(1),
  /** The path from this directory to the root of the tree its paths are relative to, so a directory names the tree it describes ([LRA]). */
  root: z.string().min(1),
  files: z.array(z.string().min(1)),
  artifacts: z.array(ArtifactRow),
  commits: z.array(CommitRow),
  links: z.array(LinkRow),
  versions: z.array(VersionEntry),
});
type IndexDocument = z.infer<typeof IndexDocument>;
const VersionDocument = z.looseObject({
  format: z.string(),
  formatVersion: z.string().min(1),
  commit: Sha,
  base: Sha.nullable(),
  generated: z.string().min(1),
  files: z.record(z.string(), z.array(PositionRow)),
  removed: z.array(Nat),
});
type VersionDocument = z.infer<typeof VersionDocument>;

/** A line and a column, both 1-based. */
export type Place = { readonly line: number; readonly column: number };

/**
 * A link as a symbols file carries it. It is the query's link, except that a producer may name a source of its own,
 * which a reader shows as written.
 */
export const SymbolLink = z.strictObject({
  artifact: Artifact,
  kind: Evidence,
  source: z.string().min(1),
  state: State,
  linked: Version.nullable(),
  current: Version.nullable(),
  madeBy: MadeBy,
});
export type SymbolLink = z.infer<typeof SymbolLink>;

/** A range of a file and its links: the start inclusive, the end exclusive, and a range whose start is its end covering that one position. */
export type SymbolPosition = { readonly path: string; readonly start: Place; readonly end: Place; readonly anchor?: Anchor; readonly links: readonly SymbolLink[] };

/** One version of a symbols directory, its chain of bases already resolved. */
export type Resolved = {
  readonly commit: string;
  readonly generated: string;
  readonly builds: readonly string[];
  /** The positions covering a place; a line with no column matches any position that spans the line. Empty means untraced. */
  at(path: string, line: number, column: number | null): readonly SymbolPosition[];
};

export type Symbols = {
  readonly dir: string;
  /** The path from the directory to the root of the tree its paths are relative to: how it names that tree ([LRA]). */
  readonly root: string;
  readonly versions: readonly { readonly commit: string; readonly builds: readonly string[] }[];
  /** The version a build hash answers for, or the newest when none is given. No other version ever answers in its place. */
  version(build: string | null): Resolved;
};

/** What writing a version did: a file, or nothing because the newest version already says the same. */
export type Written = {
  readonly written: boolean;
  readonly commit: string;
  readonly file: string | null;
  readonly base: string | null;
  readonly positions: number;
  readonly links: number;
  readonly builds: readonly string[];
};

function refuse(what: string): never {
  throw new TraceRefusal(what);
}

function readJson(file: string, what: string): unknown {
  if (!existsSync(file)) refuse(`${file} is missing, so ${what} cannot be read`);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return refuse(`${file} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    return refuse(`${file} cannot be read: it is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * A document's own version must be one this reader knows. While the format's major version is zero its minor version
 * is the compatibility unit, as semantic versioning has it for 0.x (FORMAT.md, Compatibility). Unknown *fields* are still
 * ignored, field by field; that rule governs additions, never a changed shape.
 */
function known(file: string, formatVersion: string): void {
  const [major, minor] = formatVersion.split(".");
  const [reads, readsMinor] = FORMAT_VERSION.split(".");
  if (major !== reads || (reads === "0" && minor !== readsMinor)) {
    refuse(`${file} is ${FORMAT} ${formatVersion}, which this reader does not know; it reads ${FORMAT_VERSION}`);
  }
}

function parsed<T>(file: string, schema: z.ZodType<T>, raw: unknown): T {
  const document = schema.safeParse(raw);
  if (!document.success) refuse(`${file} cannot be read: ${document.error.issues.map((i) => `${i.path.map(String).join(".")} ${i.message}`).join("; ")}`);
  return document.data;
}

/** One of the format's documents, read: its format named first, then its own version, then the whole of it. */
function document<T>(file: string, what: string, format: string, schema: z.ZodType<T>): T {
  const raw = readJson(file, what);
  const stamp = Stamped.safeParse(raw);
  if (!stamp.success) refuse(`${file} is not a ${format} document: it names no format`);
  if (stamp.data.format !== format) refuse(`${file} is not a ${format} file: its format is ${JSON.stringify(stamp.data.format)}`);
  known(file, stamp.data.formatVersion);
  return parsed(file, schema, raw);
}

function at(list: readonly string[], i: number, file: string, what: string): string {
  const found = list[i];
  if (found === undefined) refuse(`${file} names ${what} ${String(i)}, which its index does not carry`);
  return found;
}

function commitAt(index: IndexDocument, i: number, file: string): { readonly sha: string; readonly date: string | null } {
  const found = index.commits[i];
  if (found === undefined) refuse(`${file} names commit ${String(i)}, which its index does not carry`);
  return found;
}

function versionAt(index: IndexDocument, i: number, file: string, content: string | undefined): Version {
  const { sha, date } = commitAt(index, i, file);
  if (date === null) refuse(`${file} names ${sha} as an artifact's version, which its index gives no date for`);
  return { commit: sha, date, ...(content === undefined ? {} : { content }) };
}

function artifactAt(index: IndexDocument, i: number, file: string): Artifact {
  const found = index.artifacts[i];
  if (found === undefined) refuse(`${file} names artifact ${String(i)}, which its index does not carry`);
  return { kind: found.kind, path: found.path, anchor: found.anchor, label: found.label, ...(found.id === undefined ? {} : { id: found.id }) };
}

/** One link of the index's shared table, in the domain. */
function linkAt(index: IndexDocument, i: number, file: string): SymbolLink {
  const link = index.links[i];
  if (link === undefined) refuse(`${file} names link ${String(i)}, which its index does not carry`);
  return {
    artifact: artifactAt(index, link.artifact, file),
    kind: link.evidence,
    source: link.source,
    state: link.state,
    linked: link.linked === null ? null : versionAt(index, link.linked, file, link.linkedContent),
    current: link.current === null ? null : versionAt(index, link.current, file, link.currentContent),
    madeBy: {
      commit: commitAt(index, link.madeBy.commit, file).sha,
      path: link.madeBy.path === null ? null : at(index.files, link.madeBy.path, file, "file"),
      line: link.madeBy.line,
    },
  };
}

/** A position, in the domain, from one row of a version's file. */
function positionOf(index: IndexDocument, file: string, path: string, row: z.infer<typeof PositionRow>): SymbolPosition {
  const [startLine, startColumn, endLine, endColumn] = row.at;
  return {
    path,
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
    ...(row.names === undefined ? {} : { anchor: /** @type {const} */ ({ kind: "name", name: row.names }) }),
    links: row.links.map((i) => linkAt(index, i, file)),
  };
}

function readVersionFile(dir: string, index: IndexDocument, entry: VersionEntry): VersionDocument {
  const file = join(dir, entry.file);
  const version = document(file, "a version of the symbols", VERSION_FORMAT, VersionDocument);
  const named = commitAt(index, entry.commit, file).sha;
  if (version.commit !== named) refuse(`${file} says it is the symbols of ${version.commit}, but the index names ${named} for it; it belongs to another version`);
  return version;
}

/** Every file's positions at a version: its chain of bases walked to the root, the newest statement of each file winning. */
function resolveChain(dir: string, index: IndexDocument, from: number): Map<string, SymbolPosition[]> {
  const chain: VersionEntry[] = [];
  const seen = new Set<number>();
  for (let i: number | null = from; i !== null;) {
    if (seen.has(i)) refuse(`${join(dir, INDEX)} has a version that is its own base, so its chain cannot be walked`);
    seen.add(i);
    const entry: VersionEntry | undefined = index.versions[i];
    if (entry === undefined) refuse(`${join(dir, INDEX)} names version ${String(i)}, which it does not carry`);
    chain.push(entry);
    i = entry.base;
  }
  const byPath = new Map<string, SymbolPosition[]>();
  // Oldest first, so that a later statement of a file replaces an earlier one.
  for (const entry of [...chain].reverse()) {
    const document = readVersionFile(dir, index, entry);
    const file = join(dir, entry.file);
    for (const gone of document.removed) byPath.delete(at(index.files, gone, file, "file"));
    for (const [key, rows] of Object.entries(document.files)) {
      const which = Number(key);
      if (!Number.isInteger(which) || which < 0) refuse(`${file} names ${JSON.stringify(key)} as a file, which is no place in the index's files`);
      const path = at(index.files, which, file, "file");
      byPath.set(path, rows.map((row) => positionOf(index, file, path, row)));
    }
  }
  return byPath;
}

function covers(p: SymbolPosition, line: number, column: number | null): boolean {
  if (line < p.start.line || line > p.end.line) return false;
  if (column === null) return true;
  const empty = p.start.line === p.end.line && p.start.column === p.end.column;
  if (empty) return line === p.start.line && column === p.start.column;
  return (line > p.start.line || column >= p.start.column) && (line < p.end.line || column < p.end.column);
}

export function readSymbols(dir: string): Symbols {
  if (!existsSync(dir)) refuse(`${dir} is missing, so there are no symbols to read`);
  const file = join(dir, INDEX);
  const index = document(file, "the symbols directory's index", FORMAT, IndexDocument);
  const versions = index.versions.map((v) => ({ commit: commitAt(index, v.commit, file).sha, builds: v.builds }));
  return {
    dir,
    root: index.root,
    versions,
    version(build) {
      const which = build === null
        ? index.versions.map((_, i) => i).slice(-1)
        : index.versions.flatMap((v, i) => (v.builds.includes(build) ? [i] : []));
      const [only] = which;
      if (only === undefined) {
        refuse(build === null
          ? `${dir} holds no version of the symbols yet`
          : `${dir} carries no version for the build ${build}; no other version answers in its place`);
      }
      if (which.length > 1) {
        refuse(`${dir} carries ${String(which.length)} versions for the build ${build ?? ""} (${which.map((i) => versions[i]?.commit ?? "").join(", ")}); which one it means is not guessed`);
      }
      const entry = index.versions[only];
      if (entry === undefined) refuse(`${file} names version ${String(only)}, which it does not carry`);
      const document = readVersionFile(dir, index, entry);
      const byPath = resolveChain(dir, index, only);
      return {
        commit: document.commit,
        generated: document.generated,
        builds: entry.builds,
        at: (path, line, column) => (byPath.get(path) ?? []).filter((p) => covers(p, line, column)),
      };
    },
  };
}

/** A position in the domain, as one string, so that two versions' positions can be compared without their indices. */
function canonical(p: SymbolPosition): string {
  return JSON.stringify([
    p.start.line,
    p.start.column,
    p.end.line,
    p.end.column,
    p.anchor?.kind === "name" ? p.anchor.name : null,
    p.links.map((l) => [l.artifact.kind, l.artifact.path, l.artifact.anchor, l.artifact.label, l.artifact.id ?? null, l.kind, l.source, l.state, l.linked, l.current, l.madeBy]),
  ]);
}

function sameFile(a: readonly SymbolPosition[], b: readonly SymbolPosition[]): boolean {
  return a.length === b.length && a.every((p, i) => canonical(p) === canonical(b[i] ?? p));
}

/** The shared tables, as they are while a version is written: each key is taken once and never moves. */
type Tables = {
  readonly index: IndexDocument;
  file(path: string): number;
  artifact(a: Artifact): number;
  commit(sha: string, date: string | null): number;
  link(row: z.infer<typeof LinkRow>): number;
};

function tablesOf(index: IndexDocument): Tables {
  const files = new Map(index.files.map((p, i) => [p, i]));
  const artifacts = new Map(index.artifacts.map((a, i) => [`${a.kind}\0${a.path}\0${a.anchor ?? ""}\0${a.label}`, i]));
  const commits = new Map(index.commits.map((c, i) => [c.sha, i]));
  const links = new Map(index.links.map((l, i) => [JSON.stringify(l), i]));
  return {
    index,
    link(row) {
      const key = JSON.stringify(row);
      const found = links.get(key);
      if (found !== undefined) return found;
      const added = index.links.push(row) - 1;
      links.set(key, added);
      return added;
    },
    file(path) {
      const found = files.get(path);
      if (found !== undefined) return found;
      const added = index.files.push(path) - 1;
      files.set(path, added);
      return added;
    },
    artifact(a) {
      const key = `${a.kind}\0${a.path}\0${a.anchor ?? ""}\0${a.label}\0${a.id ?? ""}`;
      const found = artifacts.get(key);
      if (found !== undefined) return found;
      const added = index.artifacts.push({ kind: a.kind, path: a.path, anchor: a.anchor, label: a.label, ...(a.id === undefined ? {} : { id: a.id }) }) - 1;
      artifacts.set(key, added);
      return added;
    },
    commit(sha, date) {
      const found = commits.get(sha);
      if (found !== undefined) {
        const row = index.commits[found];
        // A commit first seen as a link's own, with no date, gains one when it is later named as an artifact's version.
        if (row !== undefined && row.date === null && date !== null) index.commits[found] = { sha, date };
        return found;
      }
      const added = index.commits.push({ sha, date }) - 1;
      commits.set(sha, added);
      return added;
    },
  };
}

function rowOf(tables: Tables, p: SymbolPosition): z.infer<typeof PositionRow> {
  return {
    at: [p.start.line, p.start.column, p.end.line, p.end.column],
    ...(p.anchor?.kind === "name" ? { names: p.anchor.name } : {}),
    links: p.links.map((l) => tables.link({
      artifact: tables.artifact(l.artifact),
      evidence: l.kind,
      source: l.source,
      state: l.state,
      linked: l.linked === null ? null : tables.commit(l.linked.commit, l.linked.date),
      current: l.current === null ? null : tables.commit(l.current.commit, l.current.date),
      ...(l.linked?.content === undefined ? {} : { linkedContent: l.linked.content }),
      ...(l.current?.content === undefined ? {} : { currentContent: l.current.content }),
      madeBy: {
        commit: tables.commit(l.madeBy.commit, null),
        path: l.madeBy.path === null ? null : tables.file(l.madeBy.path),
        line: l.madeBy.line,
      },
    })),
  };
}

function byPathOf(entries: readonly SymbolPosition[]): Map<string, SymbolPosition[]> {
  const byPath = new Map<string, SymbolPosition[]>();
  for (const p of [...entries].sort((a, b) => a.path.localeCompare(b.path) || a.start.line - b.start.line || a.start.column - b.start.column)) {
    byPath.set(p.path, [...(byPath.get(p.path) ?? []), p]);
  }
  return byPath;
}

function write(file: string, document: unknown, pretty: boolean): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${pretty ? JSON.stringify(document, null, 2) : JSON.stringify(document)}\n`);
}

function emptyIndex(root: string): IndexDocument {
  return { format: FORMAT, formatVersion: FORMAT_VERSION, root, files: [], artifacts: [], commits: [], links: [], versions: [] };
}

/**
 * Leaves the version at `at` the only one claiming its build hashes, releasing them from every other version
 * ([LRA]): the newest version indexed for a build is the one that answers for it, and the reader
 * refuses a directory where two versions claim one hash rather than guessing between them. A version
 * left claiming nothing is kept — it is still a link in the delta chain. Says whether anything was
 * released, since that alone is a reason to write the index back.
 */
function claimBuilds(index: IndexDocument, at: number): boolean {
  const claimed = new Set(index.versions[at]?.builds ?? []);
  let released = false;
  index.versions = index.versions.map((v, i) => {
    if (i === at || !v.builds.some((b) => claimed.has(b))) return v;
    released = true;
    return { ...v, builds: v.builds.filter((b) => !claimed.has(b)) };
  });
  return released;
}

/**
 * Writes `entries` as the symbols of `commit`, as a delta against the directory's newest version. When they say what
 * the newest version already says, no file is written and the build hashes join that version instead ([LPv]).
 *
 * `root` is the path from the directory to the root of the tree the positions are in, which the directory records the
 * first time it is written and keeps ([LRA]). A version whose root would differ is refused, naming both:
 * a directory that moved against its tree describes paths that tree no longer has.
 */
export function writeVersion(dir: string, commit: Version, entries: readonly SymbolPosition[], builds: readonly string[], root: string): Written {
  mkdirSync(join(dir, VERSIONS), { recursive: true });
  const file = join(dir, INDEX);
  const index = existsSync(file) ? document(file, "the symbols directory's index", FORMAT, IndexDocument) : emptyIndex(root);
  // A writer writes the version it writes. An index is added to rather than rebuilt, so without this
  // a document gains a newer writer's fields while still declaring the version it was created with —
  // and `formatVersion` is the one claim every other reader trusts before it reads anything else.
  // `known` has already refused a document from a minor this writer does not share, so this only ever
  // moves the patch within a minor, which is where new fields are allowed to appear.
  index.formatVersion = FORMAT_VERSION;
  if (index.root !== root) {
    refuse(`${file} describes the tree at ${index.root}, and this version would describe the tree at ${root}; a symbols directory names one tree`);
  }
  const newest = index.versions.length - 1;
  const previous = index.versions[newest];
  // A second run at the newest version's own commit rewrites it, against the base it already had.
  const rewriting = previous !== undefined && commitAt(index, previous.commit, file).sha === commit.commit;
  const after = byPathOf(entries);
  const links = entries.reduce((n, p) => n + p.links.length, 0);

  // What the directory already says. When the entries say the same, no version is written: the build hashes join that
  // version instead, since what is built is the same ([LPv]).
  const now = previous === undefined ? new Map<string, SymbolPosition[]>() : resolveChain(dir, index, newest);
  if (previous !== undefined && now.size === after.size && [...after].every(([path, positions]) => sameFile(now.get(path) ?? [], positions))) {
    const joined = [...previous.builds, ...builds.filter((b) => !previous.builds.includes(b))];
    index.versions[newest] = { ...previous, builds: joined };
    // A hash joining this version may still be claimed by an older one — in a directory written before this rule, or
    // by another tool — and then nothing here would have changed, so nothing would have been written, and the
    // directory would stay unanswerable. One re-index repairs it.
    const released = claimBuilds(index, newest);
    if (joined.length !== previous.builds.length || released) write(file, index, true);
    return { written: false, commit: commitAt(index, previous.commit, file).sha, file: previous.file, base: null, positions: entries.length, links, builds: joined };
  }

  const baseAt = rewriting ? previous.base : (previous === undefined ? null : newest);
  const before = baseAt === null ? new Map<string, SymbolPosition[]>() : resolveChain(dir, index, baseAt);
  const settled = rewriting ? previous : undefined;
  const changed = [...after].filter(([path, positions]) => !sameFile(before.get(path) ?? [], positions));
  const removed = [...before.keys()].filter((path) => !after.has(path));

  const tables = tablesOf(index);
  const files: Record<string, z.infer<typeof PositionRow>[]> = {};
  for (const [path, positions] of changed) files[String(tables.file(path))] = positions.map((p) => rowOf(tables, p));
  const gone = removed.map((path) => tables.file(path));
  const versionFile = join(VERSIONS, `${commit.commit}.json`);
  const base = baseAt === null ? null : commitAt(index, index.versions[baseAt]?.commit ?? 0, file).sha;
  const version: VersionDocument = {
    format: VERSION_FORMAT,
    formatVersion: FORMAT_VERSION,
    commit: commit.commit,
    base,
    generated: new Date().toISOString(),
    files,
    removed: gone,
  };
  write(join(dir, versionFile), version, false);
  const entry = {
    commit: tables.commit(commit.commit, commit.date),
    base: baseAt,
    file: versionFile,
    builds: [...(settled?.builds ?? []), ...builds.filter((b) => !(settled?.builds ?? []).includes(b))],
  };
  if (rewriting) index.versions[newest] = entry;
  else index.versions.push(entry);
  // A build whose positions moved while what was served did not — a spec's Tests rows corrected, say — would
  // otherwise be claimed by this version and by the one before it (found live, 2026-09-15).
  // Where this version landed: rewriting put it back at `newest`, and otherwise it was pushed past it.
  claimBuilds(index, index.versions.length - 1);
  write(file, index, true);
  return {
    written: true,
    commit: commit.commit,
    file: versionFile,
    base,
    positions: entries.length,
    links,
    builds: entry.builds,
  };
}
