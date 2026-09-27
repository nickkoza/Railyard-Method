// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The answer as text for people ([QBm]). It names the commit read
// and the position or the artifact. Then each link gets a line of its own:
// kind, source, artifact, the version linked to, its state, and where it was
// found. What traces to nothing says untraced, and a source that could not be
// read is named with why.
import { BUILD_HASH } from "./build-hash.ts";
import { short } from "./query.ts";
import type { StampAnswer } from "./build-hash.ts";
import type { IndexAnswer } from "./indexing.ts";
import type { SymbolsAnswer } from "./lookup.ts";
import type { BackwardAnswer, ForwardAnswer, Position, Unreadable, Version } from "./model.ts";
import type { SymbolLink } from "./symbols.ts";

/** `2026-09-15T10:22:31+02:00` → `2026-09-15 10:22 +02:00`. */
function when(date: string): string {
  return `${date.slice(0, 10)} ${date.slice(11, 16)} ${date.slice(19)}`.trimEnd();
}

function version(v: Version | null): string {
  return v === null ? "(not there then)" : `${short(v.commit)} (${when(v.date)})`;
}

function state(link: SymbolLink, at: Version): string {
  switch (link.state) {
    case "current":
      return "current";
    case "suspect":
      // A link made before its artifact existed was never checked against it ([EaR]).
      return link.linked === null
        ? `suspect: it did not exist when the link was made, now ${version(link.current)}`
        : `suspect: changed since the link was made, now ${version(link.current)}`;
    case "missing":
      return `missing at ${short(at.commit)}`;
  }
}

function where(link: SymbolLink): string {
  const { commit, path, line } = link.madeBy;
  return path === null ? `in commit ${short(commit)}` : `at ${path}${line === null ? "" : `:${String(line)}`} (${short(commit)})`;
}

/**
 * An artifact as a person reads it and would cite it: its ID and its file, `[Ay4] (its file)`.
 * Where it carries no ID, how it is cited there and where it is. Never a form that names it by where
 * it sits when it has an ID, since a form a tool prints is one a reader copies ([pY5]).
 */
function named(artifact: SymbolLink["artifact"]): string {
  if (artifact.id !== undefined) return `[${artifact.id}] (${artifact.path})`;
  const where = `${artifact.path}${artifact.anchor === null ? "" : `#${artifact.anchor}`}`;
  return artifact.label === where ? where : `${artifact.label} (${where})`;
}

function positionText(p: Position): string {
  if (p.start === null) return p.path;
  return `${p.path}:${String(p.start)}${p.end === null || p.end === p.start ? "" : `-${String(p.end)}`}`;
}

function lead(link: SymbolLink): string {
  return `${link.kind.padEnd(9)} ${link.source.padEnd(25)}`;
}

function unreadableLines(list: readonly Unreadable[]): string[] {
  return list.map((u) => `could not read ${u.path}: ${u.reason}`);
}

function untraced(unreadable: readonly Unreadable[]): string {
  return unreadable.length === 0 ? "untraced" : "untraced among the sources that could be read";
}

export function renderBackward(answer: BackwardAnswer): string {
  const { at, position, lineCommit } = answer;
  const lines = [
    `${position.path}:${String(position.line)} at ${short(at.commit)} (${when(at.date)})`,
    `  | ${answer.text}`,
    `last changed in ${short(lineCommit.commit)} (${when(lineCommit.date)}) by ${lineCommit.author}: ${lineCommit.subject}`,
    ...lineCommit.trailers.map((t) => `  ${t.key}: ${t.value}`),
    "",
  ];
  if (answer.traced) {
    lines.push(...answer.links.map((l) => `${lead(l)} ${named(l.artifact)} @ ${version(l.linked)}  ${state(l, at)}  ${where(l)}`));
  } else {
    lines.push(untraced(answer.unreadable));
  }
  lines.push(...unreadableLines(answer.unreadable));
  return `${lines.join("\n")}\n`;
}

/** A position as people read it, and `nothing` where a source map gave none. */
function place(at: { readonly path: string; readonly line: number; readonly column: number | null } | null): string {
  return at === null ? "nothing" : `${at.path}:${String(at.line)}${at.column === null ? "" : `:${String(at.column)}`}`;
}

/** An answer read from a symbols file, which says so and names the version it read ([BKY], [QBm]). */
export function renderSymbols(answer: SymbolsAnswer): string {
  const { position, mapped, version: read } = answer;
  const at: Version = { commit: read.commit, date: read.generated };
  const lines = [
    `${place(mapped === null ? position : mapped.built)} from the symbols in ${answer.symbols}`,
    `the version of ${short(read.commit)}, indexed ${read.generated}${read.builds.length === 0 ? "" : `, for the build${read.builds.length === 1 ? "" : "s"} ${read.builds.join(", ")}`}`,
  ];
  if (mapped !== null) {
    lines.push(mapped.to === null
      ? `  through ${mapped.through}, which gives no source position: ${mapped.why ?? ""}`
      : `  through ${mapped.through}, to ${place(mapped.to)}`);
  }
  lines.push("");
  if (answer.traced) {
    for (const p of answer.positions) {
      const range = `${String(p.start.line)}:${String(p.start.column)}-${String(p.end.line)}:${String(p.end.column)}`;
      lines.push(...p.links.map((l) => `${lead(l)} ${named(l.artifact)} @ ${version(l.linked)}  ${state(l, at)}  ${where(l)}  [${range}]`));
    }
  } else {
    lines.push("untraced");
  }
  return `${lines.join("\n")}\n`;
}

/** A build's hash, and where it now rides ([DHL]). */
export function renderStamped(answer: StampAnswer): string {
  const lines = [
    answer.hash,
    `  ${String(answer.files.length)} files under ${answer.root}; ${String(answer.carried)} of them carry ${BUILD_HASH}`,
  ];
  const without = answer.files.filter((f) => !f.stamped);
  if (without.length > 0) {
    lines.push(`  no place for it in ${without.map((f) => f.path).join(", ")}; each is in the hash all the same`);
  }
  return `${lines.join("\n")}\n`;
}

/** What indexing a commit wrote, or why it wrote nothing ([LPv]). */
export function renderIndexed(answer: IndexAnswer): string {
  const { at, written } = answer;
  const lines = [
    `${short(at.commit)} (${when(at.date)}) indexed into ${answer.symbols}`,
    written.written
      ? `  wrote ${written.file ?? ""}: ${String(written.positions)} positions in ${String(answer.files)} files, ${String(written.links)} links; ${written.base === null ? "the first version" : `a delta against ${short(written.base)}`}`
      : `  no version written: ${short(written.commit)} already says the same`,
    ...(written.builds.length === 0 ? [] : [`  it answers for the build${written.builds.length === 1 ? "" : "s"} ${written.builds.join(", ")}`]),
  ];
  lines.push(...unreadableLines(answer.unreadable));
  return `${lines.join("\n")}\n`;
}

export function renderForward(answer: ForwardAnswer): string {
  const { at, artifact } = answer;
  const lines = [
    `${named(artifact)} at ${short(at.commit)} (${when(at.date)})`,
    answer.current === null ? `  missing at ${short(at.commit)}` : `  its current version: ${version(answer.current)}`,
    "",
  ];
  if (answer.traced) {
    lines.push(...answer.positions.map(({ position, link }) =>
      `${lead(link)} ${positionText(position)}  ${named(link.artifact)} @ ${version(link.linked)}  ${state(link, at)}  ${where(link)}`));
  } else {
    lines.push(`${untraced(answer.unreadable)}: no source position traces to it`);
  }
  lines.push(...unreadableLines(answer.unreadable));
  return `${lines.join("\n")}\n`;
}
