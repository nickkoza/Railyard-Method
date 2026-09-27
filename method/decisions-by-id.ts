// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `railyard decisions-by-id [--dry-run] [<repository>]` ([RVv]): carry a repository's decisions from
// bullets and bold paragraphs to numbered decisions, each with an ID of its own.
//
// A decision written as a bullet or a bold paragraph carries no ID, so nothing can cite it and the
// check reports it ([8g5]). This numbers each one under a `## Decisions` heading, in a spec or a
// waymark, with an ID taken by the minting rule ([9pu]), and indents what follows it up to the next
// one inside it, which is where the method says a decision's further paragraphs, tables and views go.
//
// It reads a decision as the check does (`spec-shape.ts`'s `unnumberedDecisions`): a bullet at the
// margin, or a paragraph at the margin opening in bold. Where the text reads two ways — a list at
// the margin after a decision may be its detail or decisions of their own, a paragraph ending in a
// colon may introduce what follows rather than belong to what precedes — it changes nothing in that
// section and says so: which it meant is the author's to say, and a migration that guessed would
// write the wrong structure under a fresh ID nobody questions.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { mentionsIn, mintIds, Unreadable } from "../ids/mint.ts";
import { linksTo } from "./links.ts";
import { ARTIFACT_PATHS } from "./paths.ts";
import { DECISIONS } from "./spec-shape.ts";

export type DecisionsReport = {
  /** Each artifact rewritten, and how many of its decisions were given an ID. */
  readonly changed: readonly { readonly file: string; readonly decisions: number }[];
  /** Each section left as it was: `file:line`, and why. */
  readonly left: readonly { readonly where: string; readonly why: string }[];
  /** How many links name an artifact it rewrote: each was made against the artifact's whole text, and reads as changed until confirmed. */
  readonly specLinks: number;
};

export type Carried = { readonly text: string; readonly count: number; readonly left: DecisionsReport["left"] };

type Kind = "numbered" | "bullet" | "bold";
type Block = { readonly kind: Kind; readonly start: number; readonly end: number; readonly id: string | undefined; readonly marker: string };

const NUMBERED = /^(\d+)\.(\s+)(?:\[([A-Za-z0-9]{3})\]\s)?/;
const BULLET = /^[-*+]\s+(?=\S)/;
const FENCE = /^\s*(`{3,}|~{3,})/;
/** A placeholder for a dry run, which takes no ID. */
const UNTAKEN = "???";

function indentOf(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

/** `line` moved right by `by` spaces, or left by as many leading spaces as it has, up to `-by`. */
function shift(line: string, by: number): string {
  if (line.trim() === "" || by === 0) return line;
  if (by > 0) return `${" ".repeat(by)}${line}`;
  return line.slice(Math.min(-by, indentOf(line)));
}

/**
 * One Decisions section's lines (`from` to `to`, exclusive), its decisions numbered and what follows
 * each indented inside it, or why it cannot be. `take` gives the next ID.
 */
function carrySection(file: string, lines: string[], from: number, to: number, take: () => string): { readonly count: number; readonly why: readonly { readonly line: number; readonly text: string }[] } {
  const blocks: Block[] = [];
  /** The decision collecting the lines that follow it; none before the first, or after a heading. */
  let open: Block | undefined;
  let fence: string | undefined;
  let fenceStart = 0;
  let previous = "";
  /** The last line written above a start, where a colon may say it introduces what follows. */
  let lastText = "";
  const why: { line: number; text: string }[] = [];
  const refuse = (line: number, text: string): void => { why.push({ line, text }); };
  const close = (at: number): void => {
    if (open !== undefined) blocks.push({ ...open, end: at });
    open = undefined;
  };
  for (let i = from; i < to; i += 1) {
    const line = lines[i] ?? "";
    if (fence !== undefined) {
      if (line.trim().startsWith(fence)) fence = undefined;
      previous = line;
      continue;
    }
    const opens = FENCE.exec(line);
    if (opens?.[1] !== undefined) {
      fence = opens[1];
      fenceStart = i;
      previous = line;
      lastText = line;
      continue;
    }
    if (line.startsWith("#")) {
      // A heading inside the section groups what follows it, and belongs to no decision.
      close(i);
      previous = line;
      lastText = "";
      continue;
    }
    let start: Omit<Block, "end"> | undefined;
    const numbered = NUMBERED.exec(line);
    const bullet = BULLET.exec(line);
    if (numbered !== null) start = { kind: "numbered", start: i, id: numbered[3], marker: numbered[0] };
    else if (bullet !== null) start = { kind: "bullet", start: i, id: undefined, marker: bullet[0] };
    else if (/^\*\*\S/.test(line) && previous.trim() === "") start = { kind: "bold", start: i, id: undefined, marker: "" };
    if (start !== undefined) {
      if (open !== undefined) {
        const inList = start.kind === "bullet" && open.kind === "bullet" && previous.trim() !== "";
        if (start.kind === "bullet" && open.kind !== "bullet") {
          refuse(i + 1, `a list at the margin follows the decision at ${file}:${String(open.start + 1)}: whether it is that decision's detail or decisions of their own is yours to say. Indent it under the decision, or number each that is a decision of its own`);
        }
        if (!inList && /:(?:\*\*|__|\*|_)?\s*$/.test(lastText)) {
          refuse(i + 1, `the paragraph above it ends in a colon, so it may introduce what follows rather than belong to the decision at ${file}:${String(open.start + 1)}. Indent what belongs to that decision under it, or number what follows`);
        }
      }
      close(i);
      open = { ...start, end: to };
    }
    if (line.trim() !== "") lastText = line;
    previous = line;
  }
  close(to);
  if (fence !== undefined) refuse(fenceStart + 1, "a fenced block opened here is never closed, which hides where the section ends");
  const due = blocks.filter((b) => b.kind !== "numbered" || b.id === undefined).length;
  if (due === 0) return { count: 0, why: [] };
  if (why.length > 0) return { count: 0, why };

  let n = 0;
  for (const block of blocks) {
    n += 1;
    const head = lines[block.start] ?? "";
    const id = block.id ?? take();
    const ordinal = `${String(n)}. `;
    lines[block.start] = `${ordinal}[${id}] ${head.slice(block.marker.length)}`;
    const was = block.marker.length;
    const now = ordinal.length;
    let inFence: { readonly by: number; readonly close: string } | undefined;
    for (let i = block.start + 1; i < block.end; i += 1) {
      const line = lines[i] ?? "";
      if (inFence !== undefined) {
        lines[i] = shift(line, inFence.by);
        if (line.trim().startsWith(inFence.close)) inFence = undefined;
        continue;
      }
      const indent = indentOf(line);
      const by = indent >= was && was > 0 ? now - was : now;
      lines[i] = shift(line, by);
      const opens = FENCE.exec(line);
      if (opens?.[1] !== undefined) inFence = { by, close: opens[1] };
    }
  }
  return { count: due, why: [] };
}

/**
 * An artifact's text, its decisions carried: numbered, each with an ID from `ids` in order, what
 * follows each indented inside it. A section it cannot be sure of is left, and named.
 */
export function carryDecisions(file: string, text: string, ids: readonly string[] | null): Carried {
  const lines = text.split("\n");
  const left: { where: string; why: string }[] = [];
  let count = 0;
  let taken = 0;
  const take = (): string => {
    if (ids === null) return UNTAKEN;
    const id = ids[taken];
    if (id === undefined) throw new Error("decisions-by-id: fewer IDs were taken than there are decisions to number");
    taken += 1;
    return id;
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.startsWith("## ") || !DECISIONS(line.slice(3).trim().toLowerCase())) continue;
    let end = i + 1;
    while (end < lines.length && !/^#{1,2} /.test(lines[end] ?? "")) end += 1;
    const copy = [...lines];
    const done = carrySection(file, copy, i + 1, end, take);
    if (done.why.length > 0) {
      for (const w of done.why) left.push({ where: `${file}:${String(w.line)}`, why: w.text });
    } else if (done.count > 0) {
      lines.splice(0, lines.length, ...copy);
      count += done.count;
    }
    i = end - 1;
  }
  return { text: count === 0 ? text : lines.join("\n"), count, left };
}

/** The specs and waymarks directly under their directories, as paths from the root; `dirs` names others to read instead. */
function artifacts(root: string, dirs: readonly string[]): string[] {
  return dirs.flatMap((dir) => {
    try {
      return readdirSync(join(root, dir), { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => `${dir}/${e.name}`).sort();
    } catch {
      return [];
    }
  });
}

export type Options = {
  readonly write: boolean;
  /** The IDs to number with, already taken; a write with none takes them itself. */
  readonly ids?: readonly string[];
  /** Where the artifacts are, when not at the conventional paths: an upgrade reads them before it moves them. */
  readonly dirs?: readonly string[];
};

/** Every spec's and waymark's decisions carried, with the IDs given; written unless `write` is false. A dry run takes no ID. */
export function carryDecisionsIn(root: string, options: Options): DecisionsReport & { readonly needed: number } {
  const changed: { file: string; decisions: number }[] = [];
  const left: { where: string; why: string }[] = [];
  const rewritten = new Set<string>();
  const ids = options.ids ?? null;
  let used = 0;
  let needed = 0;
  for (const file of artifacts(root, options.dirs ?? [ARTIFACT_PATHS.specs, ARTIFACT_PATHS.waymarks])) {
    const before = readFileSync(join(root, file), "utf8");
    const after = carryDecisions(file, before, ids === null ? null : ids.slice(used));
    left.push(...after.left);
    if (after.count === 0) continue;
    needed += after.count;
    if (ids !== null) used += after.count;
    changed.push({ file, decisions: after.count });
    const own = /\*\*ID:\*\*\s*\[([A-Za-z0-9]{3})\]/.exec(before)?.[1];
    if (own !== undefined) rewritten.add(own);
    if (options.write) {
      if (ids === null) throw new Error("decisions-by-id: a write needs the IDs it numbers with");
      writeFileSync(join(root, file), after.text);
    }
  }
  return { changed, left, needed, specLinks: rewritten.size === 0 ? 0 : linksTo(root, rewritten) };
}

/** Takes `count` IDs by the minting rule, or says why none can be taken. */
export async function takeIds(root: string, count: number): Promise<{ readonly ids: readonly string[] } | { readonly why: string }> {
  if (count === 0) return { ids: [] };
  try {
    return { ids: await mintIds(await mentionsIn(root), count) };
  } catch (e) {
    if (!(e instanceof Unreadable)) throw e;
    // Nothing is offered unsearched ([9pu]): an ID drawn without the search is one nobody checked.
    return { why: `no ID could be taken, because an ID is free only once the repository and its history are searched: ${e.message}` };
  }
}

/** Every spec's and waymark's decisions carried; written unless `write` is false, with IDs taken by the minting rule. */
export async function decisionsById(root: string, options: { readonly write: boolean }): Promise<DecisionsReport & { readonly unTaken?: string }> {
  const plan = carryDecisionsIn(root, { write: false });
  if (!options.write || plan.needed === 0) return plan;
  const taken = await takeIds(root, plan.needed);
  if ("why" in taken) return { changed: [], left: plan.left, specLinks: 0, unTaken: taken.why };
  return carryDecisionsIn(root, { write: true, ids: taken.ids });
}

/** What a carry did, or would do on a dry run, in words, bar the sections it left: the command prints those, and the upgrade refuses on them. */
export function decisionsReport(report: DecisionsReport, dry: boolean): string {
  const out: string[] = [];
  for (const c of report.changed) out.push(`${c.file}: ${String(c.decisions)} ${c.decisions === 1 ? "decision" : "decisions"} ${dry ? "would be " : ""}numbered, each with an ID`);
  if (report.specLinks > 0) {
    const n = report.specLinks;
    out.push(`${String(n)} ${n === 1 ? "link names an artifact" : "links name an artifact"} it ${dry ? "would rewrite" : "rewrote"}. Each was made against the artifact's whole text, so each will read as changed: \`check\` lists each, and \`link <file>#<name> <ID>\` confirms one that still holds.`);
  }
  return out.map((l) => `${l}\n`).join("");
}

/** railyard decisions-by-id: in the repository it is run in, or the one it is pointed at. */
export async function main(argv: readonly string[]): Promise<number> {
  const usage = "usage: railyard decisions-by-id [--dry-run] [<repository>]\n";
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${usage}  numbers each decision under ## Decisions that carries no ID, with a fresh one; --dry-run says what it would change\n`);
    return 0;
  }
  const dry = argv.includes("--dry-run");
  const rest = argv.filter((a) => a !== "--dry-run");
  if (rest.length > 1 || rest[0]?.startsWith("-") === true) {
    process.stderr.write(usage);
    return 2;
  }
  const root = resolve(rest[0] ?? ".");
  const report = await decisionsById(root, { write: !dry });
  if (report.unTaken !== undefined) {
    process.stderr.write(`Nothing was changed: ${report.unTaken}\n`);
    return 1;
  }
  if (report.changed.length === 0) process.stdout.write("no decision under ## Decisions needed an ID that could be given one\n");
  process.stdout.write(decisionsReport(report, dry));
  for (const l of report.left) process.stderr.write(`${l.where}: left as it was, ${l.why}\n`);
  return report.left.length > 0 ? 1 : 0;
}
