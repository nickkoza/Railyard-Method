// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";

// What a position names, rather than where it sits ([LdF]).
//
// A link held by a file and a line is destroyed by an edit anywhere above it, and that is why
// most links rot for a reason carrying no information. A link held by the name of the thing it
// falls inside survives an edit above it, a reformat, and a move within the file.
//
// **A tolerant scan and not a parser** (`traceability`'s Decisions). It runs on every write
// inside 200 ms, so it cannot load a grammar per language, and it does not need to be exact:
// where two things share a name the witness hash tells them apart, which is what lets the
// resolver stay naive. It therefore looks at SHAPE — a declaring word, a name, an opening
// bracket — and at indentation, which nearly every language uses to mean containment even
// where it does not require it.
//
// What it gets wrong, it gets wrong by answering `span`: no name rather than a wrong one. A
// wrong name is worse than none, because a reader believes it.

/** What a position names: a thing with a name, or a span of text with nothing to name it by. */
export type Anchor =
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "span" };

/** A declaring line: a word that introduces a named thing, then the name.
 *
 * `function spin(`, `class Yard`, `def spin(`, `func Spin(`, `fn spin(`, and the `const spin =`
 * form that much modern code is written in. The list is not a language's grammar and does not
 * try to be one; it is the shapes that recur across the languages this is likely to meet. */
const DECLARING = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  // A binding, but only one that holds a FUNCTION. Granularity stops at the function
  // (`traceability`'s Decisions), so `const kind = kindOf(path)` is a local inside whatever
  // encloses it and names nothing; `const settle = (n) => …` is a thing and names itself.
  // Without the right-hand side this matched every local variable in the repository.
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?(?:function\b|\(|<|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_$][\w$]*)\s*\(/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)\s*\(/,
  /^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?(?:type|interface)\s+([A-Za-z_$][\w$]*)/,
  // A method: a name, an argument list and an opening brace, with no declaring word at all.
  // Last, so that anything above wins, and required to end in `{` so a call is not mistaken
  // for a declaration — `spin(3);` ends in a semicolon and never matches.
  /^\s*(?:(?:public|private|protected|static|async|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*(?::[^;{]*)?\{\s*$/,
] as const;

/** How far a line is indented, a tab counting as one level like a space. */
function indent(line: string): number {
  return line.length - line.trimStart().length;
}

/** Words that take an argument list and a brace and declare nothing.
 *
 * `if (ready) {` has exactly the shape of a method, and without this a position inside a
 * conditional is named "if" — a wrong name, which is worse than none because a reader
 * believes it. Found by running this over the repository rather than over its own fixtures. */
const NOT_A_NAME = new Set(["if", "for", "while", "switch", "catch", "do", "else", "try", "finally", "return", "with", "case", "match", "when", "func", "fn", "def", "function", "class"]);

/** A test: `test("…")`, `it('…')` or `describe(`…`)`, with `.only`, `.skip` or `.todo`, named by its title.
 *
 * A test runner's call declares nothing a language would call a name, yet a test links to what it
 * tests like any other code (`traceability`'s Decisions). The title is what the runner already
 * reports it by. A title that is not a plain string, one with `${…}` or one `.each` fills in,
 * names nothing: a name the scan cannot read the same way twice is worse than none. */
const TEST_CALL = /^\s*(?:test|it|describe|suite)(?:\.(?:only|skip|todo))?\s*\(\s*(?:"((?:[^"\\\n]|\\.)+)"|'((?:[^'\\\n]|\\.)+)'|`([^`$\\\n]+)`)\s*,/;

/** The name a line declares, or undefined where it declares nothing. */
function declared(line: string): string | undefined {
  const test = TEST_CALL.exec(line);
  if (test !== null) return test[1] ?? test[2] ?? test[3];
  for (const pattern of DECLARING) {
    const found = pattern.exec(line);
    const name = found?.[1];
    if (name !== undefined && !NOT_A_NAME.has(name)) return name;
  }
  return undefined;
}

/**
 * The thing `line` falls inside, counting lines from 1.
 *
 * The nearest declaring line at or above it that is indented less than it — or the line itself,
 * where the line is the declaration. Less-indented rather than any: an earlier sibling at the
 * same depth encloses nothing, and naming a position after the function above it would be a
 * wrong name, which is worse than none.
 * @param text the file's whole text
 * @param line the line to name, from 1
 */
export function anchorAt(text: string, line: number): Anchor {
  const lines = text.split("\n");
  const at = line - 1;
  if (at < 0 || at >= lines.length) return { kind: "span" };
  const own = declared(lines[at] ?? "");
  if (own !== undefined) return { kind: "name", name: own };
  let depth = indent(lines[at] ?? "");
  for (let i = at - 1; i >= 0; i -= 1) {
    const here = lines[i] ?? "";
    if (here.trim() === "") continue;
    if (indent(here) >= depth) continue;
    const name = declared(here);
    if (name !== undefined) return { kind: "name", name };
    // A less-indented line that declares nothing is a brace, a control structure or a
    // continuation. It does not name the position, but it does not hide what encloses it
    // either: keep going outward from its depth. Stopping here named a position inside a
    // conditional `span` when the function around it was two lines further up.
    depth = indent(here);
  }
  return { kind: "span" };
}

/** A named thing in a file: its qualified name, the lines it spans (from 1, inclusive), and a witness of its own lines. */
export type NamedThing = { readonly name: string; readonly start: number; readonly end: number; readonly witness: string };

/** A line that closes a block at its opener's depth, and so still belongs to it. */
const CLOSER = /^\s*(?:[}\])]|end\b)/;

/**
 * Every named thing in `text`, in order, each with the lines it spans and a witness ([5jT]).
 *
 * A thing runs from its declaring line to the last line before the next one indented no deeper
 * than it, and takes that line too where it only closes the block. Its name is qualified by
 * what encloses it (`Arm.reach`), and a second thing of the same name is `name~2`. Its witness
 * hashes its own lines with trailing space removed, less the lines of anything named inside it:
 * so an edit to a method leaves its class current, and an edit above a thing, or a move, leaves
 * the thing's own witness as it was.
 */
export function namedThings(text: string): NamedThing[] {
  const lines = text.split("\n");
  const spans: { name: string; depth: number; start: number; end: number; parent: number | undefined }[] = [];
  lines.forEach((line, i) => {
    const name = declared(line);
    if (name === undefined) return;
    const depth = indent(line);
    let end = i;
    for (let j = i + 1; j < lines.length; j += 1) {
      const here = lines[j] ?? "";
      if (here.trim() === "") continue;
      if (indent(here) <= depth) {
        if (CLOSER.test(here)) end = j;
        break;
      }
      end = j;
    }
    let parent: number | undefined;
    for (let k = spans.length - 1; k >= 0; k -= 1) {
      const outer = spans[k];
      if (outer !== undefined && outer.start <= i && outer.end >= i && outer.depth < depth) { parent = k; break; }
    }
    spans.push({ name, depth, start: i, end, parent });
  });
  const qualified = spans.map((s) => s.name);
  spans.forEach((s, k) => { if (s.parent !== undefined) qualified[k] = `${qualified[s.parent] ?? ""}.${s.name}`; });
  const seen = new Map<string, number>();
  return spans.map((s, k) => {
    const children = spans.filter((c) => c.parent === k);
    const own = lines.slice(s.start, s.end + 1).filter((_, n) => !children.some((c) => s.start + n >= c.start && s.start + n <= c.end)).map((l) => l.trimEnd());
    const base = qualified[k] ?? s.name;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return {
      name: count === 1 ? base : `${base}~${String(count)}`,
      start: s.start + 1,
      end: s.end + 1,
      witness: createHash("sha256").update(own.join("\n")).digest("hex").slice(0, 16),
    };
  });
}
