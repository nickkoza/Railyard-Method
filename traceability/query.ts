// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The queries ([QBm]): backward, from a line to the artifacts that caused
// it, and forward, from an artifact to the source positions that trace to it.
// Both are read-only and at one commit, from what the repository already
// records.
import { namedThings } from "./anchor.ts";
import { createHash } from "node:crypto";
import { calmAdapter } from "./calm-adapter.ts";
import { GitFailure, openRepository } from "./git.ts";
import type { CommitInfo, Repository } from "./git.ts";
import { BackwardAnswer, ForwardAnswer, SOURCES, TraceRefusal } from "./model.ts";
import type { Adapter, Artifact, Evidence, Link, MadeBy, Position, Snapshot, Source, SourcePath, TestNamed, Unreadable, Version } from "./model.ts";
import { railyardAdapter } from "./railyard-adapter.ts";
import { commentOf, scopeOf } from "./scope.ts";
import { FORMAT } from "./symbols.ts";
import { isCode } from "../method/paths.ts";

/**
 * A symbols directory names itself by the index at its root, so a query finds the terrain rather than being told it
 * ([QBm]). Only a nested index counts: an index at the root of the tree would
 * make the whole repository its own record. The head of the file is enough, and it is never parsed — a version file
 * declares `railyard-symbols-version`, which this does not match.
 */
const RECORD_INDEX = "index.json";
const RECORD_FORMAT = new RegExp(`"format"\\s*:\\s*"${FORMAT}"`);
const RECORD_HEAD = 4096;

/** Railyard's artifacts, and CALM. */
export const defaultAdapters: readonly Adapter[] = [railyardAdapter, calmAdapter];

/** Only a structural record is `recorded`; every citation is `cited` (traceability's Decisions). */
const KIND: Readonly<Record<Source, Evidence>> = {
  "architecture-source-path": "recorded",
  // [CS8]: asserted by whoever wrote the code, when they wrote it: recorded, and the only kind that carries intent.
  "asserted-link": "recorded",
  "tests-table": "cited",
  "code-citation": "cited",
  "commit-message": "cited",
  "commit-trailer": "cited",
};

type Found = { readonly artifact: Artifact; readonly source: Source; readonly madeBy: MadeBy };

type Context = {
  readonly repo: Repository;
  readonly at: Version;
  readonly adapters: readonly Adapter[];
  /** The sources git could not read during this query, each with git's words (traceability's Decisions). */
  readonly unreadable: readonly Unreadable[];
  snapshot(commit: string): Snapshot;
  settle(found: Found): Link;
  /** The artifact's own version at a commit: the last commit at or before it at which its own text changed ([EaR]); null when it is not there. */
  versionOf(artifact: Artifact, commit: string): Version | null;
  /** `run`'s answer; when git fails, the source at `path` is named as unreadable, with why, and undefined is given. */
  attempt<T>(path: string, what: string, run: () => T): T | undefined;
};

/** `run`'s answer; when git fails, the query is refused in words, since what it asks about cannot be read. */
function refusing<T>(what: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof GitFailure) throw new TraceRefusal(`${what}: ${error.message}`);
    throw error;
  }
}

export function short(sha: string): string {
  return sha.slice(0, 12);
}

function isWithin(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

function keyOf(artifact: Artifact): string {
  return `${artifact.path}#${artifact.anchor ?? ""}`;
}

function contextFor(dir: string, revision: string, adapters: readonly Adapter[]): Context {
  const repo = openRepository(dir);
  const at = refusing(`${revision} cannot be read`, () => repo.resolve(revision));
  const unreadable: Unreadable[] = [];
  const attempt = <T>(path: string, what: string, run: () => T): T | undefined => {
    try {
      return run();
    } catch (error) {
      if (!(error instanceof GitFailure)) throw error;
      unreadable.push({ path, reason: what === "" ? error.message : `${what}: ${error.message}` });
      return undefined;
    }
  };
  const snapshots = new Map<string, Snapshot>();
  const snapshot = (commit: string): Snapshot => {
    let s = snapshots.get(commit);
    if (s === undefined) {
      const filesAt = (): ReadonlySet<string> => refusing(`the files at ${short(commit)} cannot be listed`, () => repo.files(commit));
      let dirs: readonly string[] | undefined;
      const recordDirs = (): readonly string[] => {
        dirs ??= [...filesAt()]
          .filter((p) => p.endsWith(`/${RECORD_INDEX}`))
          .filter((p) => RECORD_FORMAT.test((attempt(p, "", () => repo.read(commit, p)) ?? "").slice(0, RECORD_HEAD)))
          .map((p) => p.slice(0, p.length - RECORD_INDEX.length - 1));
        return dirs;
      };
      const isRecord = (path: string): boolean => recordDirs().some((dir) => isWithin(path, dir));
      s = {
        commit,
        files: filesAt,
        sourceFiles: () => new Set([...filesAt()].filter((p) => !isRecord(p))),
        isRecord,
        read: (path) => attempt(path, "", () => repo.read(commit, path)),
      };
      snapshots.set(commit, s);
    }
    return s;
  };
  const texts = new Map<string, { readonly text: string | undefined }>();
  const textAt = (artifact: Artifact, commit: string): string | undefined => {
    const key = `${keyOf(artifact)}\0${commit}`;
    const hit = texts.get(key);
    if (hit !== undefined) return hit.text;
    const text = adapters.find((a) => a.kinds.includes(artifact.kind))?.textOf(artifact, snapshot(commit));
    texts.set(key, { text });
    return text;
  };
  // A criterion's version is its own text's, not its spec's: each commit that touched the file is read back to the
  // one at which the artifact's text last changed.
  const versions = new Map<string, { readonly version: Version | null }>();
  const versionOf = (artifact: Artifact, commit: string): Version | null => {
    const key = `${keyOf(artifact)}\0${commit}`;
    const hit = versions.get(key);
    if (hit !== undefined) return hit.version;
    const history = attempt(artifact.path, "", () => repo.history(commit, artifact.path)) ?? [];
    let version: Version | null = null;
    for (let i = 0; i < history.length; i += 1) {
      const here = history[i];
      if (here === undefined) break;
      const text = textAt(artifact, here.commit);
      if (text === undefined) break;
      const before = history[i + 1];
      if (before === undefined || textAt(artifact, before.commit) !== text) {
        // The witness ([EaR]): a hash of what the link names at this version, so a reader
        // holding only the symbols file can tell whether the artifact moved under the link.
        // Computed here because this is the one place that already has the text in hand.
        version = { ...here, content: createHash("sha256").update(text, "utf8").digest("hex") };
        break;
      }
    }
    versions.set(key, { version });
    return version;
  };
  return {
    repo,
    at,
    adapters,
    unreadable,
    snapshot,
    attempt,
    versionOf,
    settle({ artifact, source, madeBy }) {
      const now = textAt(artifact, at.commit);
      const then = textAt(artifact, madeBy.commit);
      const state = now === undefined ? "missing" : then === now ? "current" : "suspect";
      return {
        artifact,
        kind: KIND[source],
        source,
        state,
        // A link made before its artifact existed has no version linked, and is suspect ([EaR]).
        linked: then === undefined ? null : versionOf(artifact, madeBy.commit),
        current: now === undefined ? null : versionOf(artifact, at.commit),
        madeBy,
      };
    },
  };
}

function lineSplit(text: string): string[] {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function unique(artifacts: readonly Artifact[]): Artifact[] {
  const seen = new Set<string>();
  return artifacts.filter((a) => {
    if (seen.has(keyOf(a))) return false;
    seen.add(keyOf(a));
    return true;
  });
}

function cite(ctx: Context, text: string): Artifact[] {
  const at = ctx.snapshot(ctx.at.commit);
  return ctx.adapters.flatMap((a) => a.cite(text, at));
}

function foundKey(f: Found): string {
  return [keyOf(f.artifact), f.source, f.madeBy.commit, f.madeBy.path ?? "", String(f.madeBy.line ?? "")].join("\0");
}

/** Links found twice from the same place are one link; the rest are listed in order of trust, then as found. */
function settleAll(ctx: Context, found: readonly Found[]): Link[] {
  const seen = new Set<string>();
  const once = found.filter((f) => {
    if (seen.has(foundKey(f))) return false;
    seen.add(foundKey(f));
    return true;
  });
  return once.map((f) => ctx.settle(f)).sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source));
}

function uniqueUnreadable(list: readonly Unreadable[]): Unreadable[] {
  const seen = new Set<string>();
  return list.filter((u) => {
    const key = `${u.path}\0${u.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The commit that last changed a line of a document the query read, for a link written on it; undefined, and the document named, when git cannot say. */
function blameOf(ctx: Context, path: string, line: number): string | undefined {
  return ctx.attempt(path, "", () => ctx.repo.blame(ctx.at.commit, path)[line - 1] ?? ctx.repo.lastChange(ctx.at.commit, path)?.commit ?? ctx.at.commit);
}

function ambiguity(ctx: Context, line: number, name: string, count: number): string {
  return count === 0
    ? `line ${String(line)} names \`${name}\`, which no file at ${short(ctx.at.commit)} carries`
    : `line ${String(line)} names \`${name}\`, which ${String(count)} files carry, so which one it means is not guessed`;
}

/** Sorted line numbers as contiguous ranges: 1, 2, 3, 7 → [1, 3], [7, 7]. */
function runs(lines: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const n of lines) {
    const last = out.at(-1);
    if (last !== undefined && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

/**
 * What a whole file's lines carry, whichever line is asked about: its architecture node, by the source path it lies
 * under, and the criteria whose Tests row names it. A name several files carry is said, never guessed at.
 */
function fileFound(ctx: Context, path: string, owners: readonly SourcePath[], named: readonly TestNamed[]): { readonly found: readonly Found[]; readonly unreadable: readonly Unreadable[] } {
  const found: Found[] = [];
  const unreadable: Unreadable[] = [];
  const owner = owners.filter((e) => isWithin(path, e.sourcePath)).sort((a, b) => b.sourcePath.length - a.sourcePath.length)[0];
  const ownerCommit = owner === undefined ? undefined : blameOf(ctx, owner.doc, owner.line);
  if (owner !== undefined && ownerCommit !== undefined) {
    found.push({ artifact: owner.artifact, source: "architecture-source-path", madeBy: { commit: ownerCommit, path: owner.doc, line: owner.line } });
  }
  for (const entry of named) {
    if (!entry.tests.includes(path)) continue;
    if (entry.tests.length === 1) {
      const rowCommit = blameOf(ctx, entry.doc, entry.line);
      if (rowCommit !== undefined) found.push({ artifact: entry.artifact, source: "tests-table", madeBy: { commit: rowCommit, path: entry.doc, line: entry.line } });
    } else {
      unreadable.push({ path: entry.doc, reason: ambiguity(ctx, entry.line, entry.name, entry.tests.length) });
    }
  }
  return { found, unreadable };
}

/** A link asserted as the code was written ([CS8]): the named thing's span at the commit read, and each ID it names with the lines that ID's link has in the links file. */
type Asserted = { readonly path: string; readonly start: number; readonly end: number; readonly links: readonly { readonly id: string; readonly lines: readonly number[] }[]; readonly doc: string };

const LINKS_DIR = "symbols/links/";

/** The lines of each link in an entry: from its `"id"` line to the line closing its object, within the entry. */
function linkLines(docLines: readonly string[], name: string, ids: readonly string[]): ReadonlyMap<string, readonly number[]> {
  const out = new Map<string, number[]>();
  const from = docLines.findIndex((l) => l.includes(`"name": ${JSON.stringify(name)}`));
  if (from < 0) return out;
  const next = docLines.findIndex((l, i) => i > from && /^\s*"name":/.test(l));
  const to = next < 0 ? docLines.length : next;
  for (const id of ids) {
    const at = docLines.findIndex((l, i) => i > from && i < to && l.includes(`"id": ${JSON.stringify(id)}`));
    if (at < 0) continue;
    const lines: number[] = [];
    for (let i = at; i < to; i += 1) {
      if (/^\s*}/.test(docLines[i] ?? "")) break;
      lines.push(i + 1);
    }
    out.set(id, lines);
  }
  return out;
}

/**
 * Every asserted link at the commit read, from the links files committed beside the code
 * (traceability's Decisions). A links file that cannot be read is named, and the rest still answer.
 */
function assertedAt(ctx: Context, files: ReadonlySet<string>, unreadable: Unreadable[]): Asserted[] {
  const out: Asserted[] = [];
  for (const doc of [...files].filter((f) => f.startsWith(LINKS_DIR) && f.endsWith(".json")).sort()) {
    const path = doc.slice(LINKS_DIR.length, -".json".length);
    try {
      const text = ctx.repo.read(ctx.at.commit, doc) ?? "";
      const kept = JSON.parse(text) as { entries?: readonly { name?: unknown; links?: readonly { id?: unknown }[] }[] };
      const source = files.has(path) ? ctx.repo.read(ctx.at.commit, path) : undefined;
      if (source === undefined) continue;
      const things = new Map(namedThings(source).map((t) => [t.name, t]));
      const docLines = lineSplit(text);
      for (const entry of kept.entries ?? []) {
        if (typeof entry.name !== "string") continue;
        const thing = things.get(entry.name);
        if (thing === undefined) continue;
        const ids = (entry.links ?? []).flatMap((l) => (typeof l.id === "string" ? [l.id] : []));
        const lines = linkLines(docLines, entry.name, ids);
        out.push({ path, start: thing.start, end: thing.end, doc, links: ids.map((id) => ({ id, lines: lines.get(id) ?? [1] })) });
      }
    } catch (error) {
      unreadable.push({ path: doc, reason: `the asserted-link source could not be read: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return out;
}

/**
 * When one asserted link was made: the newest of the commits that last changed its own lines in the
 * links file (traceability's Decisions). Not the entry's name, which stays as it was while links are
 * added to it and confirmed; dated by that, a link added with its criterion read as made before it.
 */
function assertedBy(ctx: Context, doc: string, lines: readonly number[]): MadeBy {
  const blame = ctx.attempt(doc, "", () => ctx.repo.blame(ctx.at.commit, doc));
  const shas = new Set(lines.flatMap((n) => blame?.[n - 1] ?? []));
  const history = shas.size > 1 ? ctx.attempt(doc, "", () => ctx.repo.history(ctx.at.commit, doc)) ?? [] : [];
  const newest = history.find((v) => shas.has(v.commit))?.commit ?? [...shas][0] ?? ctx.at.commit;
  return { commit: newest, path: doc, line: lines[0] ?? 1 };
}

/** The artifacts cited in scope of one line (traceability's Decisions), each made by the commit that last changed the citing line. */
function citedInScope(ctx: Context, path: string, lines: readonly string[], scope: (line: number) => readonly number[], blame: readonly string[], line: number, lineSha: string): Found[] {
  const found: Found[] = [];
  for (const n of scope(line)) {
    const madeBy = { commit: blame[n - 1] ?? lineSha, path, line: n };
    for (const artifact of cite(ctx, commentOf(lines[n - 1] ?? ""))) found.push({ artifact, source: "code-citation", madeBy });
  }
  return found;
}

/** The artifacts a commit's message and trailers cite: the same for every line that commit last changed. */
function citedInCommit(ctx: Context, commit: CommitInfo): Found[] {
  const madeBy = { commit: commit.commit, path: null, line: null };
  const found: Found[] = [];
  for (const artifact of cite(ctx, commit.message)) found.push({ artifact, source: "commit-message", madeBy });
  for (const trailer of commit.trailers) {
    for (const artifact of cite(ctx, trailer.value)) found.push({ artifact, source: "commit-trailer", madeBy });
  }
  return found;
}

export type BackwardQuery = {
  /** A directory in the repository. */
  readonly repo: string;
  /** The commit to read; `HEAD` when absent. */
  readonly at?: string | undefined;
  /** The file, relative to the repository's root. */
  readonly path: string;
  /** 1-based. */
  readonly line: number;
  readonly adapters?: readonly Adapter[] | undefined;
};

export function traceBackward(query: BackwardQuery): BackwardAnswer {
  const ctx = contextFor(query.repo, query.at ?? "HEAD", query.adapters ?? defaultAdapters);
  const at = ctx.snapshot(ctx.at.commit);
  const where = `${query.path} at ${short(ctx.at.commit)}`;
  // The position itself: when git cannot read it, there is nothing to answer about, and the query is refused in words.
  const text = at.files().has(query.path) ? refusing(`${where} cannot be read`, () => ctx.repo.read(ctx.at.commit, query.path)) : undefined;
  if (text === undefined) throw new TraceRefusal(`${query.path} is not a file at ${short(ctx.at.commit)}`);
  const lines = lineSplit(text);
  if (!Number.isInteger(query.line) || query.line < 1 || query.line > lines.length) {
    throw new TraceRefusal(`${query.path} has ${String(lines.length)} lines at ${short(ctx.at.commit)}, so it has no line ${String(query.line)}`);
  }
  const blame = refusing(`${where} cannot be blamed`, () => ctx.repo.blame(ctx.at.commit, query.path));
  const lineSha = blame[query.line - 1];
  if (lineSha === undefined) throw new Error(`git blame gave no commit for ${query.path}:${String(query.line)}`);
  const commit = refusing(`the commit that last changed ${query.path}:${String(query.line)} cannot be read`, () => ctx.repo.commit(lineSha));

  const found: Found[] = [];
  const unreadable: Unreadable[] = [];

  // The architecture's source paths, and the Tests tables: the file's, whichever line is asked about.
  const owners = ctx.adapters.map((a) => a.sourcePaths(at));
  const named = ctx.adapters.map((a) => a.testsNamed(at));
  unreadable.push(...owners.flatMap((o) => o.unreadable), ...named.flatMap((n) => n.unreadable));
  const ofFile = fileFound(ctx, query.path, owners.flatMap((o) => o.entries), named.flatMap((n) => n.entries));
  found.push(...ofFile.found);
  unreadable.push(...ofFile.unreadable);

  // Links asserted as the code was written, for every named thing the line falls inside.
  for (const a of assertedAt(ctx, at.files(), unreadable).filter((x) => x.path === query.path && x.start <= query.line && query.line <= x.end)) {
    for (const l of a.links) {
      const madeBy = assertedBy(ctx, a.doc, l.lines);
      for (const artifact of unique(cite(ctx, `[${l.id}]`))) found.push({ artifact, source: "asserted-link", madeBy });
    }
  }

  // Citations in the code, in scope of the line; then the line's commit, its message and its trailers.
  found.push(...citedInScope(ctx, query.path, lines, scopeOf(lines), blame, query.line, lineSha));
  // A commit's message links the code it changed, and nothing else it touched (traceability's Decisions).
  if (isCode(query.path)) found.push(...citedInCommit(ctx, commit));

  const links = settleAll(ctx, found);
  return BackwardAnswer.parse({
    query: "backward",
    at: ctx.at,
    position: { path: query.path, line: query.line },
    text: lines[query.line - 1] ?? "",
    lineCommit: { commit: commit.commit, date: commit.date, author: commit.author, subject: commit.subject, trailers: commit.trailers },
    traced: links.length > 0,
    links,
    unreadable: uniqueUnreadable([...unreadable, ...ctx.unreadable]),
  });
}

export type ForwardQuery = {
  /** A directory in the repository. */
  readonly repo: string;
  /** The commit to read; `HEAD` when absent. */
  readonly at?: string | undefined;
  /** A repository path, a path with an anchor after `#`, or one citation an adapter recognises, such as a bracketed ID. */
  readonly reference: string;
  readonly adapters?: readonly Adapter[] | undefined;
};

/** A stable ID as a query may be given one: bare, or bracketed as it is cited. */
const GIVEN_ID = /^\[?([A-Za-z0-9]{3})\]?$/;
/** An item named by its place in its file: `criterion-3`, `decision-2`, `principle-4`. */
const PLACE = /^(?:criterion|decision|principle)-\d+$/;

function resolveReference(ctx: Context, given: string): Artifact {
  const at = ctx.snapshot(ctx.at.commit);
  const id = GIVEN_ID.exec(given)?.[1];
  const reference = id === undefined ? given : `[${id}]`;
  const anchored = /^([^\s#`]+)#([^\s#`]+)$/.exec(reference);
  if (anchored !== null || /^[^\s`#]+\/[^\s`#]+$/.test(reference)) {
    const path = anchored?.[1] ?? reference;
    const anchor = anchored?.[2] ?? null;
    // A file and the ID of something in it: the ID names it, and the file only has to agree.
    const ided = anchor === null ? undefined : GIVEN_ID.exec(anchor)?.[1];
    const byId = ided === undefined ? undefined : unique(cite(ctx, `[${ided}]`)).find((a) => a.path === path);
    if (byId !== undefined) return byId;
    const found = ctx.adapters.map((a) => a.fromPath(path, anchor, at)).find((a) => a !== undefined);
    if (found === undefined) throw new TraceRefusal(`no adapter recognises ${reference}`);
    // An item by its place is taken only where it has no other name; one with an ID is named by it (the Decisions).
    if (anchor !== null && PLACE.test(anchor) && found.id !== undefined) {
      throw new TraceRefusal(`${reference} names an item by its place, which names whichever item sits there now; it is [${found.id}] today: forward ${found.id}`);
    }
    return found;
  }
  const cited = unique(cite(ctx, reference));
  const [only] = cited;
  if (only === undefined) throw new TraceRefusal(`no adapter recognises ${reference}`);
  if (cited.length > 1) throw new TraceRefusal(`${reference} names ${String(cited.length)} artifacts (${cited.map((a) => a.label).join(", ")}); name one`);
  return only;
}

type Placed = { readonly position: Position; readonly found: Found };

export function traceForward(query: ForwardQuery): ForwardAnswer {
  const ctx = contextFor(query.repo, query.at ?? "HEAD", query.adapters ?? defaultAdapters);
  const at = ctx.snapshot(ctx.at.commit);
  const target = resolveReference(ctx, query.reference);
  const owner = ctx.adapters.find((a) => a.kinds.includes(target.kind));
  if (owner === undefined) throw new TraceRefusal(`no adapter owns ${target.label}`);
  const matches = (a: Artifact): boolean => a.path === target.path && (target.anchor === null || a.anchor === target.anchor);
  // An artifact's own documents are what the positions trace to, never positions themselves.
  const built = (path: string): boolean => !ctx.adapters.some((a) => a.isArtifactFile(path));
  const placed: Placed[] = [];
  const unreadable: Unreadable[] = [];

  // The architecture's source paths: each file belongs to the nested node with the longest path.
  const sourcePaths = ctx.adapters.map((a) => a.sourcePaths(at));
  unreadable.push(...sourcePaths.flatMap((o) => o.unreadable));
  const entries = sourcePaths.flatMap((o) => o.entries).sort((a, b) => b.sourcePath.length - a.sourcePath.length);
  for (const entry of entries.filter((e) => matches(e.artifact))) {
    const nodeCommit = blameOf(ctx, entry.doc, entry.line);
    if (nodeCommit === undefined) continue;
    const madeBy = { commit: nodeCommit, path: entry.doc, line: entry.line };
    for (const file of [...at.sourceFiles()].sort()) {
      if (!built(file) || entries.find((e) => isWithin(file, e.sourcePath)) !== entry) continue;
      placed.push({ position: { path: file, start: null, end: null }, found: { artifact: entry.artifact, source: "architecture-source-path", madeBy } });
    }
  }

  // Links asserted as the code was written: the named thing's own span.
  for (const a of assertedAt(ctx, at.files(), unreadable)) {
    for (const l of a.links) {
      const artifacts = unique(cite(ctx, `[${l.id}]`).filter(matches));
      if (artifacts.length === 0) continue;
      const madeBy = assertedBy(ctx, a.doc, l.lines);
      for (const artifact of artifacts) placed.push({ position: { path: a.path, start: a.start, end: a.end }, found: { artifact, source: "asserted-link", madeBy } });
    }
  }

  // Tests tables: the test files named for it, whole.
  const named = ctx.adapters.map((a) => a.testsNamed(at));
  unreadable.push(...named.flatMap((n) => n.unreadable));
  for (const entry of named.flatMap((n) => n.entries).filter((e) => matches(e.artifact))) {
    const [test] = entry.tests;
    if (entry.tests.length !== 1 || test === undefined) {
      unreadable.push({ path: entry.doc, reason: ambiguity(ctx, entry.line, entry.name, entry.tests.length) });
      continue;
    }
    const rowCommit = blameOf(ctx, entry.doc, entry.line);
    if (rowCommit === undefined) continue;
    const madeBy = { commit: rowCommit, path: entry.doc, line: entry.line };
    placed.push({ position: { path: test, start: null, end: null }, found: { artifact: entry.artifact, source: "tests-table", madeBy } });
  }

  // Citations in the code: the lines whose scope holds a citing line. A search git cannot run is named as the repository's.
  const pattern = owner.pattern(target, at);
  const hitsByFile = new Map<string, number[]>();
  const searched = ctx.attempt(".", "the code-citation source could not be searched", () => ctx.repo.grep(ctx.at.commit, pattern));
  for (const skipped of searched?.passedOver ?? []) unreadable.push({ path: skipped.path, reason: `the code-citation source passed over it: ${skipped.reason}` });
  for (const hit of searched?.hits ?? []) {
    if (built(hit.path) && !at.isRecord(hit.path)) hitsByFile.set(hit.path, [...(hitsByFile.get(hit.path) ?? []), hit.line]);
  }
  for (const [path, hitLines] of hitsByFile) {
    const lines = lineSplit(at.read(path) ?? "");
    const citing = new Map<number, Artifact[]>();
    for (const n of hitLines) {
      const artifacts = unique(cite(ctx, commentOf(lines[n - 1] ?? "")).filter(matches));
      if (artifacts.length > 0) citing.set(n, artifacts);
    }
    if (citing.size === 0) continue;
    const scope = scopeOf(lines);
    const covered = new Map<number, number[]>();
    for (let n = 1; n <= lines.length; n += 1) {
      for (const c of scope(n)) {
        if (!citing.has(c)) continue;
        const list = covered.get(c) ?? [];
        list.push(n);
        covered.set(c, list);
      }
    }
    const blame = ctx.attempt(path, "", () => ctx.repo.blame(ctx.at.commit, path));
    if (blame === undefined) continue;
    for (const [c, artifacts] of citing) {
      const madeBy = { commit: blame[c - 1] ?? ctx.at.commit, path, line: c };
      for (const [start, end] of runs(covered.get(c) ?? [c])) {
        for (const artifact of artifacts) placed.push({ position: { path, start, end }, found: { artifact, source: "code-citation", madeBy } });
      }
    }
  }

  // Commits whose message or trailers cite it: the lines at the commit read that blame still gives to them.
  const files = at.sourceFiles();
  const citingCommits = ctx.attempt(".", "the commit-message and commit-trailer sources could not be searched", () => ctx.repo.commitsCiting(ctx.at.commit, pattern)) ?? [];
  for (const sha of citingCommits) {
    const info = ctx.attempt(".", `commit ${short(sha)} could not be read`, () => ctx.repo.commit(sha));
    if (info === undefined) continue;
    const bySource: readonly (readonly [Source, readonly Artifact[]])[] = [
      ["commit-message", unique(cite(ctx, info.message).filter(matches))],
      ["commit-trailer", unique(info.trailers.flatMap((t) => cite(ctx, t.value)).filter(matches))],
    ];
    if (bySource.every(([, artifacts]) => artifacts.length === 0)) continue;
    const madeBy = { commit: sha, path: null, line: null };
    const changed = ctx.attempt(".", `the files commit ${short(sha)} changed could not be listed`, () => ctx.repo.touched(sha)) ?? [];
    for (const path of changed.filter((p) => files.has(p) && built(p) && isCode(p)).sort()) {
      const blamed = ctx.attempt(path, "", () => ctx.repo.blame(ctx.at.commit, path));
      if (blamed === undefined) continue;
      const lines = blamed.flatMap((s, i) => (s === sha ? [i + 1] : []));
      for (const [start, end] of runs(lines)) {
        for (const [source, artifacts] of bySource) {
          for (const artifact of artifacts) placed.push({ position: { path, start, end }, found: { artifact, source, madeBy } });
        }
      }
    }
  }

  const seen = new Set<string>();
  const positions = placed
    .filter(({ position, found }) => {
      const key = `${position.path}\0${String(position.start)}\0${String(position.end)}\0${foundKey(found)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ position, found }) => ({ position, link: ctx.settle(found) }))
    .sort((a, b) =>
      SOURCES.indexOf(a.link.source) - SOURCES.indexOf(b.link.source)
      || a.position.path.localeCompare(b.position.path)
      || (a.position.start ?? 0) - (b.position.start ?? 0));
  const current = owner.textOf(target, at) === undefined ? null : ctx.versionOf(target, ctx.at.commit);
  return ForwardAnswer.parse({
    query: "forward",
    at: ctx.at,
    artifact: target,
    current,
    traced: positions.length > 0,
    positions,
    unreadable: uniqueUnreadable([...unreadable, ...ctx.unreadable]),
  });
}

/** One line of one file, and the links backward gives for it. */
export type Traced = { readonly path: string; readonly line: number; readonly length: number; readonly links: readonly Link[] };

export type AllQuery = {
  readonly repo: string;
  readonly at?: string | undefined;
  readonly adapters?: readonly Adapter[] | undefined;
  /**
   * Directories, relative to the repository's root, whose files are not source and are never walked: a symbols
   * directory checked in beside the source it describes is the index itself ([QBm]).
   */
  readonly exclude?: readonly string[] | undefined;
};

export type AllAnswer = { readonly at: Version; readonly entries: readonly Traced[]; readonly unreadable: readonly Unreadable[] };

/**
 * Every line of every file at the commit that any artifact traces to, read from the sources backward reads and no
 * others ([LPv]). A line that traces to nothing is not given: it is untraced. The adapters' own artifact
 * documents are left out, as forward leaves them out of the positions it places, and so is every directory `exclude`
 * names. One commit is read once, so the blame of a file, a commit's citations and an artifact's version are each
 * worked out once for the whole walk.
 */
export function traceAll(query: AllQuery): AllAnswer {
  const ctx = contextFor(query.repo, query.at ?? "HEAD", query.adapters ?? defaultAdapters);
  const at = ctx.snapshot(ctx.at.commit);
  const owners = ctx.adapters.map((a) => a.sourcePaths(at));
  const named = ctx.adapters.map((a) => a.testsNamed(at));
  const unreadable: Unreadable[] = [...owners.flatMap((o) => o.unreadable), ...named.flatMap((n) => n.unreadable)];
  const ownerEntries = owners.flatMap((o) => o.entries);
  const namedEntries = named.flatMap((n) => n.entries);
  const byCommit = new Map<string, readonly Found[]>();
  const entries: Traced[] = [];
  const excluded = (query.exclude ?? []).map((dir) => (dir.endsWith("/") ? dir : `${dir}/`));
  // `exclude` still names a directory being written that the commit does not carry yet; one already checked in is
  // known from the tree itself, so a caller that forgets to name it is no longer walking the record ([QBm]).
  for (const path of [...at.sourceFiles()].sort()) {
    if (excluded.some((dir) => path.startsWith(dir))) continue;
    if (ctx.adapters.some((a) => a.isArtifactFile(path))) continue;
    const text = at.read(path);
    if (text === undefined) continue;
    const blame = ctx.attempt(path, `${path} cannot be blamed`, () => ctx.repo.blame(ctx.at.commit, path));
    if (blame === undefined) continue;
    const ofFile = fileFound(ctx, path, ownerEntries, namedEntries);
    unreadable.push(...ofFile.unreadable);
    const lines = lineSplit(text);
    const scope = scopeOf(lines);
    for (let line = 1; line <= lines.length; line += 1) {
      const lineSha = blame[line - 1];
      if (lineSha === undefined) continue;
      let cited = isCode(path) ? byCommit.get(lineSha) : [];
      if (cited === undefined) {
        const commit = ctx.attempt(path, `the commit that last changed ${path}:${String(line)} cannot be read`, () => ctx.repo.commit(lineSha));
        cited = commit === undefined ? [] : citedInCommit(ctx, commit);
        byCommit.set(lineSha, cited);
      }
      const links = settleAll(ctx, [...ofFile.found, ...citedInScope(ctx, path, lines, scope, blame, line, lineSha), ...cited]);
      if (links.length > 0) entries.push({ path, line, length: (lines[line - 1] ?? "").length, links });
    }
  }
  return { at: ctx.at, entries, unreadable: uniqueUnreadable([...unreadable, ...ctx.unreadable]) };
}
