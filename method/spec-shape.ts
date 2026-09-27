// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The shapes a spec is read in, in one place, so every reader of them agrees: a numbered item,
// and what a Tests row's first cell says it covers ([Xtd], [MHU]). The check, the trace and the
// migration from numbers to IDs all read a Tests row through `coveredBy`; before, each had a
// grammar of its own, and a criterion's number was the key in all three. The package exports this
// file as `railyard-method/method/spec-shape`, so a reader outside it, Railyard's library among
// them, reads a row as the check does rather than keeping a copy ([Xtd]).

/** A numbered item, and whatever ID follows its ordinal. */
const ITEM = /^(\d+)\.\s+(?:\[([^\]\n]*)\]\s)?/;

export type Item = { readonly n: number; readonly id: string | undefined; readonly line: number };

/** The numbered items under a `## ` heading the predicate accepts, or in the whole file when there is none to look for. */
export function itemsOf(text: string, section: ((heading: string) => boolean) | null): Item[] {
  const out: Item[] = [];
  let inside = section === null;
  text.split("\n").forEach((line, i) => {
    if (section !== null && line.startsWith("## ")) inside = section(line.slice(3).trim().toLowerCase());
    if (!inside) return;
    const m = ITEM.exec(line);
    if (m?.[1] !== undefined) out.push({ n: Number(m[1]), id: m[2], line: i + 1 });
  });
  return out;
}

export const CRITERIA = (h: string): boolean => h === "acceptance criteria";
export const DECISIONS = (h: string): boolean => h === "decision" || h === "decisions";

/** A decision written other than as a numbered item: where it starts, and its opening words. */
export type Unnumbered = { readonly line: number; readonly text: string };

/**
 * Decisions under a `## Decisions` heading written as a bullet, or as a paragraph opening in bold,
 * rather than `N. [ID] …` ([8g5]). Only what starts at the margin counts: what is indented belongs
 * to the numbered decision above it, and a fenced block is quoted, not written.
 */
export function unnumberedDecisions(text: string): Unnumbered[] {
  const out: Unnumbered[] = [];
  let inside = false;
  let fenced = false;
  let previous = "";
  text.split("\n").forEach((line, i) => {
    if (line.startsWith("## ")) inside = DECISIONS(line.slice(3).trim().toLowerCase());
    else if (inside && /^(`{3,}|~{3,})/.test(line)) fenced = !fenced;
    else if (inside && !fenced && (/^[-*+]\s+\S/.test(line) || (/^\*\*\S/.test(line) && previous.trim() === ""))) {
      out.push({ line: i + 1, text: line.replace(/^[-*+]\s+/, "").replace(/\*\*/g, "").slice(0, 60).trim() });
    }
    previous = line;
  });
  return out;
}

const ID = "\\[[A-Za-z0-9]{3}\\]";
const RANGE = "\\d+(?:\\s*[–-]\\s*\\d+)?(?![\\d–-])";
/** Between two IDs or two numbers in a list: a comma, "and", or both; between IDs, a space will do. */
const JOIN = "\\s*(?:,\\s*and\\s+|,\\s*|\\s+and\\s+)";
const LEAD_WORD = "(?:criteri(?:on|a)\\s+)?";
const IDS = new RegExp(`^(\\s*${LEAD_WORD})(${ID}(?:(?:${JOIN}|\\s+)${ID})*)`, "i");
const LEAD = new RegExp(`^\\s*${LEAD_WORD}`, "i");
const RANGE_AT = new RegExp(RANGE, "y");
const JOIN_AT = new RegExp(JOIN, "y");
/** A number past this is not a criterion: a year, most likely. */
const MAX_CRITERION = 999;

/**
 * What a Tests row's first cell says it covers, from what it opens with ([Xtd]):
 *
 * - `ids`: the criteria's IDs, `[Aa1]`, several joined by commas or "and". This is the form.
 * - `numbers`: criteria by number or range, the retired form ([Xtd]): a number names whichever
 *   criterion sits there now, so reordering the criteria moves the test onto another one.
 * - neither: words, such as a row for the non-functional requirements or failure behaviour.
 *
 * `lead` is the text of the cell the list takes up, from its start, so a rewrite can replace
 * exactly that and keep the note after it as it was written.
 */
export type Covered = { readonly ids: readonly string[]; readonly numbers: readonly number[]; readonly lead: string };

/**
 * One number or range in a Tests row's list, and the parenthesised note written straight after
 * it, if any. `numbers` is empty where the range is not one a criterion can have: descending, or
 * past MAX_CRITERION. Offsets are into the cell.
 */
export type Numbered = {
  readonly written: string;
  readonly numbers: readonly number[];
  readonly end: number;
  readonly note?: { readonly text: string; readonly start: number; readonly end: number };
};

/** The offset just past the parenthesis that closes the one at `open`, nested ones counted; -1 where none does. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * The numbers and ranges a Tests row's first cell opens with, the retired form ([Xtd]), each with
 * the note that follows it: `7 (composition), 19` is two, the first with a note. A note between
 * two numbers does not end the list; words do. Empty where the cell does not open with a number.
 */
export function numberedList(cell: string): readonly Numbered[] {
  const items: Numbered[] = [];
  let at = LEAD.exec(cell)?.[0].length ?? 0;
  for (;;) {
    RANGE_AT.lastIndex = at;
    const range = RANGE_AT.exec(cell);
    if (range === null) break;
    const written = range[0];
    const end = at + written.length;
    const m = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(written);
    const from = Number(m?.[1]);
    const to = m?.[2] === undefined ? from : Number(m[2]);
    const numbers: number[] = [];
    if (from >= 1 && to >= from && to <= MAX_CRITERION) for (let n = from; n <= to; n += 1) numbers.push(n);
    const open = end + (/^\s*/.exec(cell.slice(end))?.[0].length ?? 0);
    const close = cell[open] === "(" ? closing(cell, open) : -1;
    const note = close < 0 ? undefined : { text: cell.slice(open + 1, close - 1), start: open, end: close };
    items.push(note === undefined ? { written, numbers, end } : { written, numbers, end, note });
    // The list goes on only where a join is followed by another number.
    JOIN_AT.lastIndex = note?.end ?? end;
    const join = JOIN_AT.exec(cell);
    if (join === null) break;
    RANGE_AT.lastIndex = join.index + join[0].length;
    if (RANGE_AT.exec(cell) === null) break;
    at = join.index + join[0].length;
  }
  return items;
}

export function coveredBy(cell: string): Covered {
  const byId = IDS.exec(cell);
  if (byId !== null) {
    const ids = [...(byId[2] ?? "").matchAll(/\[([A-Za-z0-9]{3})\]/g)].map((m) => m[1] ?? "");
    return { ids, numbers: [], lead: byId[0] };
  }
  const items = numberedList(cell);
  const numbers = items.flatMap((i) => i.numbers);
  const last = items.at(-1);
  return { ids: [], numbers, lead: numbers.length > 0 && last !== undefined ? cell.slice(0, last.end) : "" };
}

/**
 * A criterion cited by number in running text: "criterion 20", "criterion 4's", "criteria 11,
 * 13", "Criteria 10–12". `numbers` is the one number after "criterion", or the list after
 * "criteria". `another` is the name written just before it where there is one, such as
 * `` `desk` ``, `mobile-desk`, `M8` or a spec's own name: then the number is that one's criterion,
 * not the spec's own. Offsets are into the text.
 */
export type CriterionCitation = {
  readonly index: number;
  readonly written: string;
  readonly numbers: readonly number[];
  readonly another: string | undefined;
};

const CITATION = new RegExp(`(?<![\\w-])(criterion|criteria)\\s+(${RANGE}(?:${JOIN}${RANGE})*)`, "gi");
/** A name before "criterion": in backticks, hyphenated, with a digit in it, or possessive or followed by "spec". */
const NAMED_BEFORE = /(?:`([^`\s]+)`|([A-Za-z0-9][\w-]*))((?:'s)?(?:\s+spec(?:'s)?)?),?\s+$/;

/** The criteria `text` cites by number; code spans are quoting, and are not read. `specs` are the repository's spec names. */
export function criterionCitations(text: string, specs: ReadonlySet<string> = new Set()): readonly CriterionCitation[] {
  // A code span quotes, so it is blanked; a single backticked word is kept, since it may be the name before a citation.
  const read = text.replace(/`[^`\n]*`/g, (m) => (/^`[^`\s]+`$/.test(m) ? m : " ".repeat(m.length)));
  const out: CriterionCitation[] = [];
  for (const m of read.matchAll(CITATION)) {
    const plural = (m[1] ?? "").toLowerCase() === "criteria";
    const list = plural ? (m[2] ?? "") : (/^\d+(?:\s*[–-]\s*\d+)?/.exec(m[2] ?? "")?.[0] ?? "");
    const numbers: number[] = [];
    for (const token of list.split(new RegExp(JOIN))) {
      const r = /^(\d+)(?:\s*[–-]\s*(\d+))?$/.exec(token.trim());
      if (r === null) continue;
      const from = Number(r[1]);
      const to = r[2] === undefined ? from : Number(r[2]);
      if (from < 1 || to < from || to > MAX_CRITERION) continue;
      for (let n = from; n <= to; n += 1) numbers.push(n);
    }
    if (numbers.length === 0) continue;
    const before = NAMED_BEFORE.exec(read.slice(0, m.index));
    const word = before?.[1] ?? before?.[2];
    // A bare number before it is a list's, never a name ("criterion 13, criterion 16").
    const named = before !== null && word !== undefined && /[A-Za-z]/.test(word)
      && (before[1] !== undefined || /[-\d]/.test(word) || (before[3] ?? "") !== "" || specs.has(word));
    const written = `${m[0].slice(0, m[0].length - (m[2] ?? "").length)}${list}`;
    out.push({ index: m.index, written, numbers, another: named ? word : undefined });
  }
  return out;
}
