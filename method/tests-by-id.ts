// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `railyard tests-by-id [--dry-run] [<repository>]` ([R6P]): carry a repository's Tests rows from
// criteria's numbers to their IDs.
//
// A Tests row that names its criteria by number names whichever criteria sit at those numbers
// now, so reordering a spec's criteria moved its tests onto others and nothing noticed ([Xtd]).
// This rewrites the numbers each row opens with to the IDs of the criteria they name in that
// spec as it stands, which is the one moment a number and an ID are known to agree. It is one of
// the skill's commands, because the repositories that need it are the ones that installed the skill.
//
// It reads each spec as the check reads it (`spec-shape.ts`), so a row it carries is one the
// check then accepts, and it changes only the text a row's list of numbers takes up. A row it
// cannot carry is left exactly as it was and named: which criterion was meant is a judgement,
// and a migration that guessed would make the mistake this exists to end.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { linksTo } from "./links.ts";
import { ARTIFACT_PATHS } from "./paths.ts";
import { CRITERIA, criterionCitations, itemsOf, numberedList } from "./spec-shape.ts";
import type { Item, Numbered } from "./spec-shape.ts";

export type Report = {
  /** Each spec rewritten, and how many of its rows. */
  readonly changed: readonly { readonly file: string; readonly rows: number }[];
  /** Each row left as it was: `file:line`, and why. */
  readonly left: readonly { readonly where: string; readonly why: string }[];
  /** Each criterion a row cited by number in its text, and the IDs it was carried to, for a person to read. */
  readonly cited: readonly { readonly where: string; readonly written: string; readonly to: string }[];
  /** Each criterion a row cites by number after another spec's name: left, and named. */
  readonly noted: readonly { readonly where: string; readonly why: string }[];
  /** How many links name a spec it rewrote: each was made against the spec's whole text, and reads as changed until confirmed. */
  readonly specLinks: number;
};

type Carried = { readonly text: string; readonly rows: number; readonly left: Report["left"]; readonly cited: Report["cited"]; readonly noted: Report["noted"] };

const WELL_FORMED = /^[A-Za-z0-9]{3}$/;
const SEPARATOR = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

/** The IDs `numbers` name among `criteria`, or why they cannot be named. */
function idsFor(numbers: readonly number[], criteria: readonly Item[]): { readonly ids: readonly string[] } | { readonly why: string } {
  const ids: string[] = [];
  for (const n of numbers) {
    const at = criteria.filter((c) => c.n === n);
    if (at.length === 0) return { why: `no criterion is numbered ${String(n)}` };
    if (at.length > 1) return { why: `criteria share the number ${String(n)}, at lines ${at.map((c) => String(c.line)).join(" and ")}` };
    const id = at[0]?.id;
    if (id === undefined || !WELL_FORMED.test(id)) return { why: `criterion ${String(n)} carries no ID; give it one first` };
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids };
}

/** A number in what follows a row's list, outside any note or code span: a criterion, it may be. */
function strayNumber(rest: string): string | undefined {
  let text = rest.replace(/`[^`]*`/g, " ");
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(/\([^()]*\)/g, " ");
  }
  // A note never closed runs to the end of the cell.
  text = text.replace(/\(.*$/, "");
  // Not a number within a word, a path, a version, or a tier such as [1]; not one a citation names
  // ("criterion 16"); not one a capitalised name owns ("Phase 11", "Node 24").
  return /(?<![\w.:/[]|criteri(?:on|a)\s+|\b[A-Z][\w-]*\s+)\d+(?![\w.:/%\]])/.exec(text)?.[0];
}

/**
 * A Tests row's first cell with the numbers it opens with carried to IDs, undefined where it opens
 * with none, or why it cannot be carried whole. Every number the list names is carried, the ones
 * after a note among them, or the row is left: a criterion left behind reads as untested.
 */
function rewrite(cell: string, criteria: readonly Item[]): { readonly cell: string } | { readonly why: string } | undefined {
  const items = numberedList(cell);
  if (items.length === 0) return undefined;
  const invalid = items.find((it) => it.numbers.length === 0);
  if (invalid !== undefined) return { why: `${invalid.written} is not a criterion's number` };
  const named: { readonly item: Numbered; readonly ids: readonly string[] }[] = [];
  for (const item of items) {
    const found = idsFor(item.numbers, criteria);
    if ("why" in found) return found;
    named.push({ item, ids: found.ids });
  }
  const last = items[items.length - 1];
  if (last === undefined) return undefined;
  const stray = strayNumber(cell.slice(last.note?.end ?? last.end));
  if (stray !== undefined) return { why: `${stray}, after its list and outside a note, may be a criterion; say which by ID` };
  const ids = [...new Set(named.flatMap((n) => n.ids))];
  const cite = (list: readonly string[]): string => list.map((id) => `[${id}]`).join(", ");
  const space = /^\s*/.exec(cell)?.[0] ?? "";
  // A note after the last number alone may describe the whole list, and stays where it was written.
  if (!items.slice(0, -1).some((it) => it.note !== undefined)) return { cell: `${space}${cite(ids)}${cell.slice(last.end)}` };
  const notes = named.flatMap((n) => (n.item.note === undefined ? [] : [`${cite(n.ids)}: ${n.item.note.text.trim()}`]));
  return { cell: `${space}${cite(ids)} (${notes.join("; ")})${cell.slice(last.note?.end ?? last.end)}` };
}

/** One spec's text, its Tests rows carried; what changed and what was left. `specs` are the repository's spec names. */
function carry(file: string, text: string, specs: ReadonlySet<string>): Carried {
  const criteria = itemsOf(text, CRITERIA);
  const lines = text.split("\n");
  const left: { where: string; why: string }[] = [];
  const cited: { where: string; written: string; to: string }[] = [];
  const noted: { where: string; why: string }[] = [];
  let rows = 0;
  const start = lines.findIndex((l) => /^## Tests\s*$/.test(l));
  if (start < 0) return { text, rows, left, cited, noted };
  for (let i = start + 1; i < lines.length && !/^#{1,2} /.test(lines[i] ?? ""); i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    const where = `${file}:${String(i + 1)}`;
    // A header is the row a separator follows.
    if (!trimmed.startsWith("|") || SEPARATOR.test(trimmed) || SEPARATOR.test((lines[i + 1] ?? "").trim())) continue;
    const open = line.indexOf("|");
    const close = line.indexOf("|", open + 1);
    if (close < 0) continue;
    const cell = line.slice(open + 1, close);
    const read = rewrite(cell, criteria);
    if (read !== undefined && "why" in read) {
      left.push({ where, why: `"${trimmed.slice(0, 60)}": ${read.why}` });
      continue;
    }
    let next = read === undefined ? line : `${line.slice(0, open + 1)}${read.cell}${line.slice(close)}`;
    // A criterion cited by number in the row's text, carried in its own spec; another spec's named and left.
    const carrying: { readonly index: number; readonly written: string; readonly to: string }[] = [];
    let why: string | undefined;
    for (const c of criterionCitations(next, specs)) {
      if (c.another !== undefined) {
        noted.push({ where, why: `"${c.another} ${c.written}" names another spec's criterion by number; write its ID` });
        continue;
      }
      const found = idsFor(c.numbers, criteria);
      if ("why" in found) {
        why = `"${c.written}": ${found.why}`;
        break;
      }
      carrying.push({ index: c.index, written: c.written, to: found.ids.map((id) => `[${id}]`).join(", ") });
    }
    if (why !== undefined) {
      left.push({ where, why: `"${trimmed.slice(0, 60)}": ${why}` });
      continue;
    }
    for (const c of [...carrying].reverse()) next = `${next.slice(0, c.index)}${c.to}${next.slice(c.index + c.written.length)}`;
    for (const c of carrying) cited.push({ where, written: c.written, to: c.to });
    if (next === line) continue;
    lines[i] = next;
    rows += 1;
  }
  return { text: lines.join("\n"), rows, left, cited, noted };
}

/** Every spec directly under the repository's specs directory, its Tests rows carried from numbers to IDs; written unless `write` is false. */
export function testsById(root: string, options: { readonly write: boolean }): Report {
  const dir = join(root, ARTIFACT_PATHS.specs);
  const changed: { file: string; rows: number }[] = [];
  const left: { where: string; why: string }[] = [];
  const cited: { where: string; written: string; to: string }[] = [];
  const noted: { where: string; why: string }[] = [];
  const rewritten = new Set<string>();
  let names: string[];
  try {
    names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name).sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    const file = `${ARTIFACT_PATHS.specs}/${name}`;
    const before = readFileSync(join(root, file), "utf8");
    const after = carry(file, before, new Set(names.map((n) => n.slice(0, -".md".length))));
    left.push(...after.left);
    cited.push(...after.cited);
    noted.push(...after.noted);
    if (after.rows === 0) continue;
    changed.push({ file, rows: after.rows });
    const own = /\*\*ID:\*\*\s*\[([A-Za-z0-9]{3})\]/.exec(before)?.[1];
    if (own !== undefined) rewritten.add(own);
    if (options.write) writeFileSync(join(root, file), after.text);
  }
  return { changed, left, cited, noted, specLinks: rewritten.size === 0 ? 0 : linksTo(root, rewritten) };
}

/** What a carry did, or would do on a dry run, in words, bar the rows it left: the command prints those, and the upgrade refuses on them. */
export function carriedReport(report: Report, dry: boolean): string {
  const out: string[] = [];
  for (const c of report.changed) out.push(`${c.file}: ${String(c.rows)} ${c.rows === 1 ? "row" : "rows"} ${dry ? "would be " : ""}carried to IDs`);
  if (report.cited.length > 0) {
    out.push(`These criteria, cited by number in a row's text, ${dry ? "would be" : "were"} carried to the IDs the numbers name today. A number in a note may have named another criterion before the list moved, so read each:`);
    for (const c of report.cited) out.push(`  ${c.where}: "${c.written}" → ${c.to}`);
  }
  if (report.specLinks > 0) {
    const n = report.specLinks;
    out.push(`${String(n)} ${n === 1 ? "link names a spec" : "links name a spec"} it ${dry ? "would rewrite" : "rewrote"}. Each was made against the spec's whole text, so each will read as changed: \`check\` lists each, and \`link <file>#<name> <ID>\` confirms one that still holds.`);
  }
  for (const n of report.noted) out.push(`${n.where}: left, ${n.why}`);
  return out.map((l) => `${l}\n`).join("");
}

/** railyard tests-by-id: in the repository it is run in, or the one it is pointed at. */
export function main(argv: readonly string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write("usage: railyard tests-by-id [--dry-run] [<repository>]\n  carries each spec's Tests rows from criteria's numbers to their IDs; --dry-run says what it would change\n");
    return 0;
  }
  const dry = argv.includes("--dry-run");
  const rest = argv.filter((a) => a !== "--dry-run");
  if (rest.length > 1 || rest[0]?.startsWith("-") === true) {
    process.stderr.write("usage: railyard tests-by-id [--dry-run] [<repository>]\n");
    return 2;
  }
  const root = resolve(rest[0] ?? ".");
  const report = testsById(root, { write: !dry });
  if (report.changed.length === 0) process.stdout.write("no Tests row names a criterion by number that could be carried\n");
  process.stdout.write(carriedReport(report, dry));
  for (const l of report.left) process.stderr.write(`${l.where}: left as it was, ${l.why}\n`);
  return report.left.length > 0 ? 1 : 0;
}
