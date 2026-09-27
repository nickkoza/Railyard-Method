// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Railyard's artifacts (traceability's Decisions). An ADR is
// cited as ADR-<n>, with any leading zeros, as the change's named-by search
// reads it, and is the file under docs/waymarks/ whose number is <n>. A
// spec's criterion is cited as `<name>` criterion <n>, or criteria <list>, and
// is recognised by its shape alone: the name is lowercase words joined by
// hyphens, or an M-name such as `M1-gate`. It is docs/specs/<name>.md, which
// may be missing at the commit read; the query then says so (decision 6). A
// spec is cited by its path. A criterion's text is its numbered item under
// "Acceptance criteria". Each spec's Tests table is read by the IDs each row opens with ([MHU]),
// through the one reading of a row the check also uses; a row by number is read only for
// criteria that carry no ID, and a row naming no criterion, and neither NFRs nor failure
// behaviour, is named unreadable.
import { literal } from "./model.ts";
import type { Adapter, Artifact, Snapshot, TestNamed, Unreadable } from "./model.ts";
import { indexOf } from "../ids/resolve.ts";
import type { Indexed, Source } from "../ids/resolve.ts";
import { ARTIFACT_PATHS } from "../method/paths.ts";
import { coveredBy } from "../method/spec-shape.ts";

/** `ADR-<n>` with any leading zeros, not after a letter or a digit, and not before a digit, as named-by reads it (traceability's Decisions). */
const ADR_CITE = /(?<![A-Za-z0-9])ADR-0*(\d+)(?![0-9])/g;
const RANGE = "\\d+(?:\\s*[–-]\\s*\\d+)?";
/** A spec's name: lowercase words joined by hyphens, or an M-name such as `M1-gate`. */
const SPEC_NAME = "[a-z0-9]+(?:-[a-z0-9]+)*|M\\d+(?:-[a-z0-9]+)+";
const CRITERIA_CITE = new RegExp(`\`(${SPEC_NAME})\` criteri(?:on|a) (${RANGE}(?:\\s*(?:,\\s*and|,|and)\\s*${RANGE})*)`, "g");
const SPEC_CITE = /(?<![\w/.-])docs\/specs\/([\w.-]+)\.md(?![\w/])/g;
/** A stable ID, cited in the one form that is a citation: bracketed, as `[Ay4]`. */
const ID_CITE = /\[([A-Za-z0-9]{3})\]/g;
const ADR_PATH = new RegExp(`^${ARTIFACT_PATHS.waymarks}/(\\d{3,4})-[^/]*\\.md$`);
const SPEC_PATH = /^docs\/specs\/([\w.-]+)\.md$/;
const PRINCIPLES_PATH = new RegExp(`^${ARTIFACT_PATHS.principles}/[^/]+\\.md$`);
const CRITERION_ANCHOR = /^criterion-(\d+)$/;
/** A numbered item that is not a criterion: a decision, in a spec's own Decisions or a waymark, or a principle. */
const ITEM_ANCHOR = /^(decision|principle)-(\d+)$/;
/** A number past this is not a criterion: a year, most likely. */
const MAX_CRITERION = 999;

// The Tests table ([MHU]).
/** A file path in backticks: segments joined by `/`. */
const PATH = /^[\w.@-]+(?:\/[\w.@-]+)+$/;
/** A test file named by its file name alone; it means a file only if exactly one file has that name. */
const BARE = /^[\w.@-]+\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
/** Words a row's first cell may hold that name no numbered criterion. */
const UNNUMBERED = /\b(?:nfrs?|failure|behaviou?r)\b/i;

/** A number's digits without their leading zeros: `0148` → `148`, `000` → `0`. */
function withoutZeros(digits: string): string {
  return digits.replace(/^0+(?=\d)/, "");
}

function spec(name: string): Artifact {
  const path = `docs/specs/${name}.md`;
  return { kind: "spec", path, anchor: null, label: path };
}

function criterion(name: string, n: number): Artifact {
  return { kind: "criterion", path: `docs/specs/${name}.md`, anchor: `criterion-${String(n)}`, label: `\`${name}\` criterion ${String(n)}` };
}

/** A decision or a principle: a numbered item that is not a criterion, found by its number in its file until its ID is stamped on. */
function item(kind: "decision" | "principle", path: string, n: number): Artifact {
  return { kind, path, anchor: `${kind}-${String(n)}`, label: `${path}#${kind}-${String(n)}` };
}

function principles(path: string): Artifact {
  return { kind: "principles", path, anchor: null, label: path };
}

const adrFiles = new WeakMap<Snapshot, ReadonlyMap<string, string>>();

/** An ADR, by its number's digits without their leading zeros. */
function adr(digits: string, at: Snapshot): Artifact {
  let byNumber = adrFiles.get(at);
  if (byNumber === undefined) {
    const found = new Map<string, string>();
    for (const f of at.files()) {
      const m = ADR_PATH.exec(f);
      const key = m === null ? undefined : withoutZeros(m[1] ?? "");
      if (key !== undefined && !found.has(key)) found.set(key, f);
    }
    byNumber = found;
    adrFiles.set(at, found);
  }
  const number = digits.padStart(3, "0");
  return { kind: "adr", path: byNumber.get(digits) ?? `${ARTIFACT_PATHS.waymarks}/${number}`, anchor: null, label: `ADR-${number}` };
}

/** "1–2, 5 and 7" → 1, 2, 5, 7. A descending range, or one past MAX_CRITERION, names nothing. */
function numbersIn(list: string): number[] {
  const out: number[] = [];
  for (const token of list.split(/\s*(?:,\s*and|,|and)\s*/)) {
    const m = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(token.trim());
    if (m === null) continue;
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : Number(m[2]);
    if (from < 1 || to < from || to > MAX_CRITERION) continue;
    for (let n = from; n <= to; n += 1) out.push(n);
  }
  return out;
}

/** The half-open range of lines under a `## ` heading, up to the next one. */
function section(lines: readonly string[], heading: string): { readonly start: number; readonly end: number } | undefined {
  const at = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`);
  if (at < 0) return undefined;
  const next = lines.findIndex((l, i) => i > at && l.startsWith("## "));
  return { start: at + 1, end: next < 0 ? lines.length : next };
}

/** The text of numbered item `n`: under the `## ` heading one of `headings` names, or anywhere in the file when there are none. */
function itemText(text: string, headings: readonly string[] | null, n: number): string | undefined {
  const lines = text.split("\n");
  const range = headings === null ? { start: 0, end: lines.length } : headings.map((h) => section(lines, h)).find((r) => r !== undefined);
  if (range === undefined) return undefined;
  const own = new RegExp(`^${String(n)}\\.\\s`);
  const start = lines.findIndex((l, i) => i >= range.start && i < range.end && own.test(l));
  if (start < 0) return undefined;
  // Within a section an item runs to the next item, as a criterion always has; through a whole file it also stops at a heading.
  const next = lines.findIndex((l, i) => i > start && i < range.end && (/^\d+\.\s/.test(l) || (headings === null && l.startsWith("#"))));
  return lines.slice(start, next < 0 ? range.end : next).join("\n").trimEnd();
}

function criterionText(text: string, n: number): string | undefined {
  return itemText(text, ["acceptance criteria"], n);
}

/** A cell without its parenthesised notes, which may nest, its spaces collapsed. */
function withoutNotes(cell: string): string {
  let text = cell;
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(/\([^()]*\)/g, "");
  }
  return text.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

const byBasename = new WeakMap<Snapshot, ReadonlyMap<string, readonly string[]>>();

function filesNamed(at: Snapshot, name: string): readonly string[] {
  let names = byBasename.get(at);
  if (names === undefined) {
    const found = new Map<string, string[]>();
    for (const f of at.files()) {
      const base = f.slice(f.lastIndexOf("/") + 1);
      found.set(base, [...(found.get(base) ?? []), f]);
    }
    names = found;
    byBasename.set(at, found);
  }
  return names.get(name) ?? [];
}

function specName(path: string): string {
  return SPEC_PATH.exec(path)?.[1] ?? "";
}

/** Every stable ID at a commit, to the artifact carrying it. Built once per tree: an ID names the
 * thing rather than where it sits, so resolving one means reading what declares it. */
const indexes = new WeakMap<object, ReadonlyMap<string, Artifact>>();

/** Whether two artifacts are the same one: the adapter builds a fresh object for each lookup.
 *
 * Compared by what they name, never by the ID, because this is what DECIDES the ID. */
function same(a: Artifact, b: Artifact): boolean {
  return a.kind === b.kind && a.path === b.path && a.anchor === b.anchor;
}

/** What an artifact is keyed by while its ID is looked up. */
function place(a: Artifact): string {
  return `${a.kind}\0${a.path}\0${a.anchor ?? ""}`;
}

/** The reverse of `idIndex`: what each artifact's own stable ID is, where it declares one. */
const byPlace = new WeakMap<object, ReadonlyMap<string, string>>();
function idsByPlace(at: Snapshot): ReadonlyMap<string, string> {
  const cached = byPlace.get(at);
  if (cached !== undefined) return cached;
  const found = new Map<string, string>();
  for (const [id, artifact] of idIndex(at)) if (!found.has(place(artifact))) found.set(place(artifact), id);
  byPlace.set(at, found);
  return found;
}

/** `a` carrying its stable ID, where it declares one ([EaR]): the reference the link holds.
 *
 * Stamped at the adapter's edges rather than in each constructor, so that every artifact this
 * adapter hands out carries it and no caller has to remember to ask. */
function withId(a: Artifact, at: Snapshot): Artifact {
  const id = idsByPlace(at).get(place(a));
  // Named as it is cited ([pY5]): a form that names it by where it sits is one a reader would copy.
  return id === undefined ? a : { ...a, id, label: `[${id}]` };
}

/** A commit's files as the identifiers' index reads them: the `.md` and `.json` directly under a directory. */
function sourceOf(at: Snapshot): Source {
  return {
    read: (path) => at.read(path),
    list: (dir) => [...at.files()].filter((f) => f.slice(0, f.lastIndexOf("/")) === dir && (f.endsWith(".md") || f.endsWith(".json"))).sort(),
  };
}

/** The artifact an indexed ID names, as this adapter hands it out; undefined for a model, which is CALM's. */
function artifactOf(found: Indexed): Artifact | undefined {
  const path = found.path ?? "";
  const n = Number(/-(\d+)$/.exec(found.anchor ?? "")?.[1]);
  switch (found.kind) {
    case "spec": return spec(specName(path));
    case "criterion": return criterion(specName(path), n);
    case "decision": return item("decision", path, n);
    case "principle": return item("principle", path, n);
    case "principles": return principles(path);
    case "waymark": return { kind: "adr", path, anchor: null, label: `ADR-${ADR_PATH.exec(path)?.[1] ?? ""}` };
    case "model": return undefined;
  }
}

/** Every stable ID at a commit, read by the identifiers' one index, so a query and `ids-resolve` agree on what an ID names. */
function idIndex(at: Snapshot): ReadonlyMap<string, Artifact> {
  const cached = indexes.get(at);
  if (cached !== undefined) return cached;
  const index = new Map<string, Artifact>();
  for (const [id, found] of indexOf(sourceOf(at))) {
    const artifact = artifactOf(found);
    if (artifact !== undefined) index.set(id, artifact);
  }
  indexes.set(at, index);
  return index;
}

/**
 * The criteria a Tests row's first cell names ([MHU]), or why it cannot be read.
 *
 * By ID first: an ID names its criterion wherever it now sits, so reordering the criteria, or
 * moving one to another spec, leaves the row on it. A number names whichever criterion sits
 * there now, so a row by number is read only where the criteria it names carry no ID, as in
 * history written before there were any; where one carries an ID the number is the retired
 * form ([Xtd]), and reading it could put the test on the wrong criterion, so it is not read.
 * An unnumbered row, NFRs or failure behaviour, is the spec's as a whole.
 */
function rowCriteria(first: string, doc: string, name: string, at: Snapshot): { readonly artifacts: readonly Artifact[] } | { readonly why: string } {
  const covered = coveredBy(first);
  if (covered.ids.length > 0) {
    const index = idIndex(at);
    const artifacts: Artifact[] = [];
    for (const id of covered.ids) {
      const found = index.get(id);
      if (found?.kind !== "criterion") return { why: `a Tests row names [${id}], which is no criterion` };
      artifacts.push(withId(found, at));
    }
    return { artifacts };
  }
  if (covered.numbers.length > 0) {
    const artifacts = covered.numbers.map((n) => withId(criterion(name, n), at));
    const ids = artifacts.flatMap((a) => (a.id === undefined ? [] : [`[${a.id}]`]));
    if (ids.length > 0) return { why: `a Tests row in ${doc} names criteria by number, which names whichever criterion sits there now; name them by ID: ${ids.join(", ")}` };
    return { artifacts };
  }
  if (UNNUMBERED.test(withoutNotes(first))) return { artifacts: [withId(spec(name), at)] };
  return { why: `a Tests row names no criterion: ${JSON.stringify(withoutNotes(first).slice(0, 80))}` };
}

export const railyardAdapter: Adapter = {
  name: "railyard",
  kinds: ["adr", "spec", "criterion", "decision", "principles", "principle"],

  isArtifactFile(path) {
    return ADR_PATH.test(path) || SPEC_PATH.test(path) || PRINCIPLES_PATH.test(path);
  },

  cite(text, at) {
    const found: Artifact[] = [];
    for (const m of text.matchAll(ADR_CITE)) found.push(adr(withoutZeros(m[1] ?? "0"), at));
    // Recognised by its shape; a spec missing at the commit read is still cited, and said to be missing.
    for (const m of text.matchAll(CRITERIA_CITE)) {
      for (const n of numbersIn(m[2] ?? "")) found.push(criterion(m[1] ?? "", n));
    }
    for (const m of text.matchAll(SPEC_CITE)) found.push(spec(m[1] ?? ""));
    // A stable ID names the artifact rather than its place, so it survives a rename and a renumber.
    const index = idIndex(at);
    for (const m of text.matchAll(ID_CITE)) {
      const hit = index.get(m[1] ?? "");
      if (hit !== undefined) found.push(hit);
    }
    return found.map((a) => withId(a, at));
  },

  fromPath(path, anchor, at) {
    const numbered = anchor === null ? null : ITEM_ANCHOR.exec(anchor);
    const a = ADR_PATH.exec(path);
    if (a !== null) {
      if (anchor === null) return withId({ kind: "adr", path, anchor: null, label: `ADR-${a[1] ?? ""}` }, at);
      return numbered?.[1] === "decision" ? withId(item("decision", path, Number(numbered[2])), at) : undefined;
    }
    if (PRINCIPLES_PATH.test(path)) {
      if (anchor === null) return withId(principles(path), at);
      return numbered?.[1] === "principle" ? withId(item("principle", path, Number(numbered[2])), at) : undefined;
    }
    const s = SPEC_PATH.exec(path);
    if (s === null) return undefined;
    if (anchor === null) return withId(spec(s[1] ?? ""), at);
    if (numbered?.[1] === "decision") return withId(item("decision", path, Number(numbered[2])), at);
    const c = CRITERION_ANCHOR.exec(anchor);
    return c === null ? undefined : withId(criterion(s[1] ?? "", Number(c[1])), at);
  },

  pattern(artifact, at) {
    // The ID first, because it is what a citation is today; the older forms stay, for a citation
    // in a document outside the migrated surface, and in the history a commit-message search reads.
    const ids = [...idIndex(at)].filter(([, held]) => same(held, artifact)).map(([id]) => `\\[${literal(id)}\\]`);
    const older = artifact.kind === "adr"
      ? [`ADR-0*${withoutZeros(/(\d+)$/.exec(artifact.label)?.[1] ?? /(\d{3,4})-[^/]*$/.exec(artifact.path)?.[1] ?? "0")}([^0-9]|$)`]
      : artifact.kind === "criterion"
        ? [`\`${literal(specName(artifact.path))}\` criteri`]
        : artifact.kind === "spec"
          ? [`\`${literal(specName(artifact.path))}\` criteri|docs/specs/${literal(specName(artifact.path))}\\.md`]
          : [];
    // A decision or a principle has no older form; with no ID either, nothing cites it, and the search must find nothing.
    const all = [...ids, ...older];
    return all.length > 0 ? all.join("|") : `\\[${literal(`${artifact.path}#${artifact.anchor ?? ""}`)}\\]`;
  },

  textOf(artifact, at) {
    const text = at.read(artifact.path);
    if (text === undefined) return undefined;
    if (artifact.kind === "criterion") return criterionText(text, Number(CRITERION_ANCHOR.exec(artifact.anchor ?? "")?.[1]));
    const numbered = ITEM_ANCHOR.exec(artifact.anchor ?? "");
    if (numbered === null) return text;
    const n = Number(numbered[2]);
    // A spec's decisions are under its Decisions; a waymark's and the principles' are numbered through the file.
    return artifact.kind === "decision" && SPEC_PATH.test(artifact.path) ? itemText(text, ["decisions", "decision"], n) : itemText(text, null, n);
  },

  testsNamed(at) {
    const entries: TestNamed[] = [];
    const unreadable: Unreadable[] = [];
    for (const doc of [...at.files()].filter((f) => SPEC_PATH.test(f)).sort()) {
      const lines = (at.read(doc) ?? "").split("\n");
      const range = section(lines, "tests");
      if (range === undefined) continue;
      const name = specName(doc);
      for (let i = range.start; i < range.end; i += 1) {
        const line = lines[i] ?? "";
        if (!line.trimStart().startsWith("|")) continue;
        const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        const [first = "", tests = ""] = cells;
        if (/^criterion$/i.test(first) || cells.every((c) => /^:?-+:?$/.test(c))) continue;
        const read = rowCriteria(first, doc, name, at);
        if ("why" in read) {
          unreadable.push({ path: doc, reason: `line ${String(i + 1)}: ${read.why}` });
          continue;
        }
        if (/^not yet written/i.test(cells.at(-1) ?? "")) continue;
        // A test Planned is one not written yet, so the file it names is not there yet either ([98I]): nothing to read, and nothing wrong.
        const planned = /^[*_]*planned\b/i.test(cells.at(-1) ?? "");
        const artifacts = read.artifacts;
        for (const m of tests.matchAll(/`([^`]+)`/g)) {
          const test = m[1] ?? "";
          if (!PATH.test(test) && !BARE.test(test)) continue;
          const candidates = PATH.test(test) ? (at.files().has(test) ? [test] : []) : filesNamed(at, test);
          if (planned && candidates.length === 0) continue;
          for (const artifact of artifacts) entries.push({ artifact, doc, line: i + 1, name: test, tests: candidates });
        }
      }
    }
    return { entries, unreadable };
  },

  sourcePaths() {
    return { entries: [], unreadable: [] };
  },
};
