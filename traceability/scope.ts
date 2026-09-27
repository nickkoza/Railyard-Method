// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Which lines' citations apply to a line (traceability's Decisions): the line
// itself; the comment block directly above it; the comment block directly
// above each line that encloses it, by indentation; and the file's opening
// comment block. And of each of those lines, only its comment text cites
// ([ei5]): a string, a fixture's contents or an identifier never does. A
// textual rule, the same for every language, with no parser.

/** What a comment line begins with, after its indentation. */
export const COMMENT_MARKERS: readonly string[] = ["//", "/*", "*", "#", "--", ";", "<!--"];

/**
 * Whether text, from its first non-blank character, is a comment line. A `*` is one only as a
 * block's continuation, followed by whitespace, `/` or nothing: Markdown's `**bold**` and `*emphasis*`
 * begin the same way and are prose.
 */
function isCommentLine(trimmed: string, markers: readonly string[]): boolean {
  return markers.some((m) => trimmed.startsWith(m) && (m !== "*" || /^\*(?:\s|\/|$)/.test(trimmed)));
}

/** For a file's lines, a function from a 1-based line to the 1-based lines in its scope, in order. */
export function scopeOf(lines: readonly string[], markers: readonly string[] = COMMENT_MARKERS): (line: number) => readonly number[] {
  const text = (i: number): string => lines[i] ?? "";
  const blank = (i: number): boolean => text(i).trim() === "";
  const comment = (i: number): boolean => {
    return isCommentLine(text(i).trimStart(), markers);
  };
  const indent = (i: number): number => text(i).length - text(i).trimStart().length;
  const blockAbove = (i: number): number[] => {
    const out: number[] = [];
    for (let j = i - 1; j >= 0 && !blank(j) && comment(j); j -= 1) out.push(j);
    return out;
  };
  const opening: number[] = [];
  let k = 0;
  while (k < lines.length && blank(k)) k += 1;
  while (k < lines.length && comment(k)) {
    opening.push(k);
    k += 1;
  }

  return (line) => {
    const i = line - 1;
    const scope = new Set<number>([i, ...blockAbove(i), ...opening]);
    if (!blank(i)) {
      let level = indent(i);
      for (let j = i - 1; j >= 0 && level > 0; j -= 1) {
        if (blank(j) || comment(j) || indent(j) >= level) continue;
        for (const b of blockAbove(j)) scope.add(b);
        level = indent(j);
      }
    }
    return [...scope].sort((a, b) => a - b).map((n) => n + 1);
  };
}

/** What can begin a comment after code on the same line. `--` and `;` end statements in too many languages. */
const TRAILING_MARKERS: readonly string[] = ["//", "/*", "#", "<!--"];

/**
 * The comment text of a line ([ei5]): all of it when it is a comment line, and otherwise what
 * follows the first trailing marker that stands outside every quoted run and at the line's start
 * or after whitespace. A line with no comment text returns "".
 */
export function commentOf(line: string, markers: readonly string[] = COMMENT_MARKERS): string {
  const trimmed = line.trimStart();
  if (isCommentLine(trimmed, markers)) return trimmed;
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line.charAt(i);
    if (quote !== null) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    const before = i === 0 ? " " : line.charAt(i - 1);
    if (/\s/.test(before) && TRAILING_MARKERS.some((m) => line.startsWith(m, i))) return line.slice(i);
  }
  return "";
}
