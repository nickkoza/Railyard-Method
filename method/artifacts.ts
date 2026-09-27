// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The artifacts spec ([XLT]), held mechanically: every artifact and numbered item carries an ID
// ([8g5]), a cited ID names something ([BNb]), a citation of something with an ID is the ID
// ([pY5]), and a spec's Tests table accounts for every criterion ([Xtd]). With the architecture
// checks, these are what `railyard-check` runs ([f4v]).
//
// Brought across from Railyard's conformance tool, where they were written first. Two things
// changed on the way: code is read by traceability's comment rule ([ei5]) rather than a stripper
// that knew only TypeScript, and a Tests table is now also held to naming every criterion, which
// the original never asked.
//
// Every rule reports; none repairs ([AUx]).
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { checkLinks } from "./links.ts";
import { crossCitationsIn, resolveElsewhere } from "../ids/elsewhere.ts";
import type { CrossCitation } from "../ids/elsewhere.ts";
import { commentOf } from "../traceability/scope.ts";
import { checkArchitecture, tracked } from "./architecture.ts";
import { ARTIFACT_PATHS } from "./paths.ts";
import { recordsAMoment } from "./repository.ts";
import { CRITERIA, DECISIONS, coveredBy, criterionCitations, itemsOf, unnumberedDecisions } from "./spec-shape.ts";
import type { Item } from "./spec-shape.ts";

/** A finding fails the check; a notice is shown and does not ([v0F]: another repository moving on is not this one's defect). */
/** [98I]: the words a Tests row's status begins with (the artifacts spec's Decisions say what each means). */
const STATUS_WORDS = ["Passing", "Written", "Failing", "Partial", "Planned", "Not yet written", "Measured", "Withdrawn"] as const;
const STATUS = new RegExp(`^(?:${STATUS_WORDS.join("|")})(?![\\w-])`, "i");

export type Finding = {
  readonly rule: string;
  readonly message: string;
  readonly notice?: boolean;
  /** A link a change has left to answer ([G0i]): the notices `check`'s closing line counts on their own ([f4v]). */
  readonly stale?: boolean;
};

const WELL_FORMED = /^[A-Za-z0-9]{3}$/;
/** An artifact's own ID field, and whatever it holds, so a malformed one is seen rather than read as absent. */
const FIELD = /\*\*ID:\*\*\s*\[([^\]\n]*)\]/;
/** A citation: an ID in brackets, and only that. A cross-repository citation has more inside. */
const CITED = /\[([A-Za-z0-9]{3})\]/g;
const CODE = /\.(?:[cm]?[jt]sx?|rs|py)$/;
const MARKDOWN = /\.md$/;

/** What a document says, with the parts that quote rather than use removed: fenced blocks, and code spans of `quoted` backticks or more. */
function prose(text: string, quoted: 1 | 2): string {
  const blank = (m: string): string => m.replace(/[^\n]/g, " ");
  const spans = quoted === 1 ? /`[^`\n]*`/g : /``(?:[^`]|`(?!`))*``/g;
  return text.replace(/```[\s\S]*?```/g, blank).replace(spans, blank);
}

/** A code file's comment text, line for line, so a finding can still name its line ([ei5]). */
function comments(text: string): string {
  return text.split("\n").map((line) => commentOf(line)).join("\n");
}

function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length;
}

/** The files whose citations are read: not dated, and not the evaluation cases, which are test inputs quoting made-up artifacts. */
function readable(root: string, files: readonly string[]): string[] {
  const model = (f: string): boolean => posix.dirname(f) === ARTIFACT_PATHS.models && f.endsWith(".json");
  return files.filter((f) => (CODE.test(f) || MARKDOWN.test(f) || model(f)) && !recordsAMoment(root, f) && !f.startsWith("evals/"));
}

/** A model's prose, line for line: the text of each name and description, and nothing of its structure. */
function modelProse(text: string): string {
  return text.split("\n").map((line) => {
    return [...line.matchAll(/"(?:name|description)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => (m[1] ?? "").replace(/\\"/g, '"')).join("  ");
  }).join("\n");
}

export function checkArtifacts(root: string): Finding[] {
  const found: Finding[] = [];
  const files = tracked(root);
  const read = (f: string): string => readFileSync(join(root, f), "utf8");
  const directlyUnder = (dir: string): string[] => files.filter((f) => posix.dirname(f) === dir && f.endsWith(".md"));

  // [8g5]: collect every ID carried, reporting what is missing or malformed on the way.
  const carried = new Map<string, string[]>();
  const carry = (id: string | undefined, where: string, what: string): void => {
    if (id === undefined) {
      found.push({ rule: "8g5", message: `${where} carries no ID; every ${what} carries a stable three-character ID, set once` });
      return;
    }
    if (!WELL_FORMED.test(id)) {
      found.push({ rule: "8g5", message: `${where} carries [${id}], which is not an ID: three characters of [A-Za-z0-9]` });
      return;
    }
    carried.set(id, [...(carried.get(id) ?? []), where]);
  };
  /** [8g5]: a decision is a numbered item, so it can carry an ID; one written as a bullet or a bold paragraph carries none. */
  const notNumbered = (file: string, text: string): void => {
    for (const d of unnumberedDecisions(text)) {
      found.push({ rule: "8g5", message: `${file}:${String(d.line)} has a decision that is not a numbered item, so it carries no ID: "${d.text}". Write each decision as \`N. [ID] …\`, like a criterion, with an ID from ids-take` });
    }
  };
  /** A waymark's decisions, and a spec's own, by the artifact's ID (or a waymark's number) and the decision's own number. */
  const decisions = new Map<string, string>();
  const specs = new Map<string, { readonly id: string | undefined; readonly items: Item[] }>();
  for (const file of directlyUnder(ARTIFACT_PATHS.specs)) {
    const text = read(file);
    const items = itemsOf(text, CRITERIA);
    const own = FIELD.exec(text)?.[1];
    carry(own, file, "artifact");
    for (const item of items) carry(item.id, `${file} criterion ${String(item.n)}`, "criterion");
    // A waymark kept in the spec it serves: its decisions carry IDs as a waymark file's do ([8g5]).
    for (const item of itemsOf(text, DECISIONS)) {
      carry(item.id, `${file} decision ${String(item.n)}`, "decision");
      if (own !== undefined && item.id !== undefined && WELL_FORMED.test(item.id)) decisions.set(`${own} ${String(item.n)}`, item.id);
    }
    notNumbered(file, text);
    specs.set(file.slice(ARTIFACT_PATHS.specs.length + 1, -".md".length), { id: own, items });
  }
  const waymarks = new Map<number, string>();
  for (const file of directlyUnder(ARTIFACT_PATHS.waymarks)) {
    const text = read(file);
    const own = FIELD.exec(text)?.[1];
    carry(own, file, "artifact");
    const n = /^(\d+)-/.exec(posix.basename(file))?.[1];
    notNumbered(file, text);
    for (const item of itemsOf(text, DECISIONS)) {
      carry(item.id, `${file} decision ${String(item.n)}`, "decision");
      if (item.id !== undefined && WELL_FORMED.test(item.id)) {
        if (own !== undefined) decisions.set(`${own} ${String(item.n)}`, item.id);
        if (n !== undefined) decisions.set(`${String(Number(n))} ${String(item.n)}`, item.id);
      }
    }
    if (n !== undefined && own !== undefined && WELL_FORMED.test(own)) waymarks.set(Number(n), own);
  }
  const principles = new Map<number, string>();
  for (const file of directlyUnder(ARTIFACT_PATHS.principles)) {
    const text = read(file);
    carry(FIELD.exec(text)?.[1], file, "artifact");
    for (const item of itemsOf(text, null)) {
      carry(item.id, `${file} principle ${String(item.n)}`, "principle");
      if (item.id !== undefined && WELL_FORMED.test(item.id)) principles.set(item.n, item.id);
    }
  }
  for (const file of files.filter((f) => posix.dirname(f) === ARTIFACT_PATHS.models && f.endsWith(".json"))) {
    // A model's missing or malformed ID is the architecture checks' to report ([L7b]); here it only has to be unique.
    const id = /"id"\s*:\s*"([^"]*)"/.exec(/"metadata"\s*:\s*\{[^}]*\}/.exec(read(file))?.[0] ?? "")?.[1];
    if (id !== undefined && WELL_FORMED.test(id)) carried.set(id, [...(carried.get(id) ?? []), file]);
  }
  for (const [id, places] of [...carried].sort(([a], [b]) => a.localeCompare(b))) {
    if (places.length > 1) found.push({ rule: "8g5", message: `${places.join(" and ")} all carry [${id}]; an ID names one thing` });
  }

  // [BNb], [pY5]: what each readable file cites.
  const criterion = new Map<string, string>();
  for (const [name, s] of specs) for (const item of s.items) if (item.id !== undefined && WELL_FORMED.test(item.id)) criterion.set(`${name} ${String(item.n)}`, item.id);
  const elsewhere: { readonly file: string; readonly line: number; readonly citation: CrossCitation }[] = [];
  for (const file of readable(root, files)) {
    const text = read(file);
    const code = CODE.test(file);
    const said = code ? comments(text) : file.endsWith(".json") ? modelProse(text) : text;
    const reported = new Set<string>();
    const cited = prose(said, 1);
    for (const citation of crossCitationsIn(cited)) {
      elsewhere.push({ file, line: lineAt(cited, citation.index), citation });
    }
    for (const m of prose(said, 1).matchAll(CITED)) {
      const id = m[1] ?? "";
      if (carried.has(id) || reported.has(id)) continue;
      reported.add(id);
      found.push({ rule: "BNb", message: `${file}:${String(lineAt(said, m.index))} cites [${id}], which names nothing in this repository` });
    }

    const body = prose(said, 2);
    const say = (offset: number, wrote: string, id: string): void => {
      found.push({ rule: "pY5", message: `${file}:${String(lineAt(said, offset))} cites "${wrote}"; write [${id}], the ID that names it, since a name and a number both move` });
    };
    // A spec's name, in backticks or not, and the word spec or spec's between or not, then a criterion's number.
    const named: [number, number][] = [];
    for (const m of body.matchAll(/(?:`([a-z0-9][\w-]*)`|(?<![\w`./-])([a-z0-9][\w-]*))(?:'s)?(?:\s+spec(?:'s)?)?,?\s+criteri(?:on|a)\s+(\d+)/g)) {
      const name = m[1] ?? m[2] ?? "";
      if (!specs.has(name)) continue;
      named.push([m.index, m.index + m[0].length]);
      const id = criterion.get(`${name} ${m[3] ?? ""}`);
      if (id !== undefined) say(m.index, m[0], id);
    }
    for (const m of body.matchAll(/(?<![\w/.-])docs\/specs\/([\w.-]+)\.md(?![\w/])/g)) {
      const id = specs.get(m[1] ?? "")?.id;
      if (id !== undefined && WELL_FORMED.test(id)) say(m.index, m[0], id);
    }
    const ownNumber = posix.dirname(file) === ARTIFACT_PATHS.waymarks ? Number(/^(\d+)-/.exec(posix.basename(file))?.[1] ?? NaN) : NaN;
    for (const m of body.matchAll(/(?<![A-Za-z0-9])ADR-0*(\d+)(?![0-9])/g)) {
      if (Number(m[1]) === ownNumber) continue;
      const id = waymarks.get(Number(m[1]));
      if (id !== undefined) say(m.index, m[0], id);
    }
    for (const m of body.matchAll(/(?:\[([A-Za-z0-9]{3})\]|(?<![A-Za-z0-9])ADR-0*(\d+))\s+decisions?\s+(\d+)(?!\d)/g)) {
      const key = m[1] !== undefined ? `${m[1]} ${m[3] ?? ""}` : `${String(Number(m[2]))} ${m[3] ?? ""}`;
      const id = decisions.get(key);
      if (id !== undefined) say(m.index, m[0], id);
    }
    for (const m of body.matchAll(/(?<![\w-])principle (\d+)(?!\d)/g)) {
      const id = principles.get(Number(m[1]));
      if (id !== undefined) say(m.index, m[0], id);
    }
    // A spec naming its own criterion writes no name. Its Tests table is excluded: a row by number is [Xtd]'s to report.
    if (posix.dirname(file) === ARTIFACT_PATHS.specs && MARKDOWN.test(file)) {
      const own = specs.get(file.slice(ARTIFACT_PATHS.specs.length + 1, -".md".length))?.items ?? [];
      const end = body.indexOf("\n## Tests");
      const upTo = end < 0 ? body : body.slice(0, end);
      for (const m of upTo.matchAll(/(?<![\w-])criteri(?:on|a)(?:[ \t]+|\n[ \t]*)(\d+)/g)) {
        const before = upTo.slice(0, m.index);
        if (before.trimEnd().endsWith("`") || (before.split("\n").at(-1) ?? "").trimStart().startsWith("#")) continue;
        if (named.some(([from, to]) => m.index >= from && m.index < to)) continue;
        const id = own.find((i) => i.n === Number(m[1]))?.id;
        if (id !== undefined && WELL_FORMED.test(id)) say(m.index, m[0], id);
      }
    }
  }

  // [v0F]: each citation of another repository, resolved there, once per distinct citation.
  const distinct = [...new Map(elsewhere.map((e) => [e.citation.written, e.citation])).values()];
  const answers = new Map(resolveElsewhere(root, distinct).map((r) => [r.citation.written, r]));
  for (const { file, line, citation } of elsewhere) {
    const r = answers.get(citation.written);
    if (r === undefined || r.state === "current") continue;
    const at = `${file}:${String(line)} cites ${citation.written}`;
    if (r.state === "suspect") {
      found.push({ rule: "v0F", notice: true, message: `${at}, ${r.label ?? ""}${r.path === undefined ? "" : ` (${r.path})`}, which has changed since in ${citation.name} (as of ${(r.tip ?? "").slice(0, 12)}); read what changed and move the citation forward${r.offline === true ? ". The repository could not be fetched just now" : ""}` });
    } else if (r.state === "unreachable") {
      found.push({ rule: "v0F", notice: true, message: `${at}, which could not be checked: ${r.why ?? ""}. Whoever can reach ${citation.name} can check it` });
    } else {
      found.push({ rule: "v0F", message: `${at}, which is ${r.state}: ${r.why ?? ""}` });
    }
  }

  // [Xtd]: every spec's Tests table accounts for every criterion.
  for (const [name, s] of specs) {
    const file = `${ARTIFACT_PATHS.specs}/${name}.md`;
    found.push(...testsTable(file, read(file), s.items, carried, new Set(specs.keys())));
  }
  return found;
}

/**
 * [Xtd]: a spec's Tests table accounts for every criterion, each row naming the criteria it covers
 * by ID. `carried` is every ID the repository carries, to where, so a row naming another's can
 * say whose it is.
 */
function testsTable(file: string, text: string, criteria: readonly Item[], carried: ReadonlyMap<string, readonly string[]>, names: ReadonlySet<string>): Finding[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^## Tests\s*$/.test(l));
  if (start < 0) {
    return criteria.length > 0 ? [{ rule: "Xtd", message: `${file} has acceptance criteria and no Tests section to say what holds them` }] : [];
  }
  const rest = lines.slice(start + 1);
  const stop = rest.findIndex((l) => /^#{1,2} /.test(l));
  const section = stop < 0 ? rest : rest.slice(0, stop);
  const separator = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;
  const rows = section.flatMap((raw, i) => {
    const line = raw.trim();
    if (!line.startsWith("|") || separator.test(line) || separator.test((section[i + 1] ?? "").trim())) return [];
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const criterion = cells[0] ?? "";
    return [{ line: start + 2 + i, raw, criterion, covered: coveredBy(criterion), status: cells[cells.length - 1] ?? "" }];
  });
  const found: Finding[] = [];
  if (rows.length === 0 && section.some((l) => /every criterion has a test/i.test(l))) {
    found.push({ rule: "Xtd", message: `${file} says "Every criterion has a test", and its Tests table has no rows` });
  }
  // [98I]: a status begins with one of the method's words; what follows it is a note.
  for (const r of rows) {
    if (!STATUS.test(r.status.replace(/^[*_]+/, ""))) {
      found.push({ rule: "98I", message: `${file}: the row for ${r.criterion === "" ? "an unnamed criterion" : `"${r.criterion.slice(0, 40)}"`} has status "${r.status.slice(0, 40)}"; begin it with one of ${STATUS_WORDS.join(", ")}, and put anything else after the word as a note` });
    }
  }
  const own = new Set(criteria.flatMap((c) => (c.id === undefined ? [] : [c.id])));
  // A row by number is the retired form: reported once, with the IDs to write, and not reported again as leaving its criteria unnamed.
  const byNumber = new Set<number>();
  for (const r of rows.filter((row) => row.covered.numbers.length > 0)) {
    for (const n of r.covered.numbers) byNumber.add(n);
    const ids = r.covered.numbers.map((n) => criteria.find((c) => c.n === n)?.id);
    const write = ids.every((id) => id !== undefined && WELL_FORMED.test(id)) ? `; write ${[...new Set(ids)].map((id) => `[${id ?? ""}]`).join(", ")} instead, or run \`tests-by-id\` to carry every such row` : "";
    found.push({ rule: "Xtd", message: `${file}:${String(r.line)}: the Tests row "${r.criterion.slice(0, 40)}" names criteria by number, which names whichever criterion sits there once the list is reordered${write}` });
  }
  // A criterion cited by number elsewhere in a row: the same retired form, in a note. Another spec's is [pY5]'s.
  for (const r of rows) {
    const open = r.raw.indexOf("|");
    const lead = coveredBy(r.raw.slice(open + 1, r.raw.indexOf("|", open + 1))).lead;
    for (const c of criterionCitations(r.raw, names)) {
      if (c.another !== undefined || c.index < open + 1 + lead.length) continue;
      const ids = c.numbers.map((n) => criteria.find((x) => x.n === n)?.id);
      const missing = c.numbers.find((n) => !criteria.some((x) => x.n === n));
      const today = missing !== undefined
        ? `no criterion is numbered ${String(missing)} now: name the one meant by its ID`
        : ids.every((id) => id !== undefined && WELL_FORMED.test(id))
          ? `it is ${[...new Set(ids)].map((id) => `[${id ?? ""}]`).join(", ")} today: write that, if it is the one meant`
          : "give the criterion an ID, and write that";
      found.push({ rule: "Xtd", message: `${file}:${String(r.line)}: the Tests row cites "${c.written}" by number, which names whichever criterion sits there now; ${today}` });
    }
  }
  for (const r of rows) {
    for (const id of r.covered.ids.filter((i) => !own.has(i))) {
      const where = carried.get(id)?.[0];
      const whose = where === undefined ? "names nothing" : `is carried by ${where.split(" ")[0] ?? where}`;
      found.push({ rule: "Xtd", message: `${file}:${String(r.line)}: the Tests row names [${id}], which is no criterion of this spec: it ${whose}` });
    }
  }
  const named = new Set(rows.flatMap((r) => r.covered.ids));
  for (const c of criteria) {
    if (c.id === undefined || !WELL_FORMED.test(c.id) || named.has(c.id) || byNumber.has(c.n)) continue;
    found.push({ rule: "Xtd", message: `${file}: [${c.id}] is named by no row of its Tests table` });
  }
  // "With no qualifier": a row that is its IDs and nothing else.
  const done = new Set(rows.filter((r) => /^(?:written|passing)\b/i.test(r.status)).flatMap((r) => r.covered.ids));
  const notYet = new Set(rows.filter((r) => /^not yet written\b/i.test(r.status) && r.covered.lead.trim() === r.criterion).flatMap((r) => r.covered.ids));
  for (const id of [...notYet].filter((c) => done.has(c)).sort()) {
    found.push({ rule: "Xtd", message: `${file}: [${id}] is Written or Passing in one row and "Not yet written" in another` });
  }
  return found;
}

/** Every check the method holds a repository to ([f4v]). */
export function checkRepository(root: string): Finding[] {
  return [...checkArchitecture(root), ...checkArtifacts(root), ...checkLinks(root)];
}
