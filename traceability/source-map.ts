// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Source maps ([BKY]): a position in
// what was built maps to its source position through the map the build already
// makes. Only the standard is read — ECMA-426's version, sources, sourceRoot
// and mappings, decoded as base64 VLQ — so nothing here assumes a language, a
// framework or a build tool. An index map, one with sections, is refused in
// words rather than half-read. Lines and columns are 1-based on the way in and
// on the way out, as they are everywhere else in this package.
import { z } from "zod";
import { TraceRefusal } from "./model.ts";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function digits(): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  for (let value = 0; value < BASE64.length; value += 1) out.set(BASE64.charAt(value), value);
  return out;
}
const DIGITS: ReadonlyMap<string, number> = digits();
/** The bit that says another digit follows, and the width of a digit's value. */
const CONTINUES = 32;
const WIDTH = 32;

const Document = z.looseObject({
  version: z.unknown().optional(),
  sourceRoot: z.string().optional(),
  sources: z.array(z.string().nullable()).optional(),
  mappings: z.string().optional(),
  sections: z.array(z.unknown()).optional(),
});

/** A source position a generated one maps to: the source as the map names it, and a 1-based line and column. */
export type SourceMapping = { readonly source: string; readonly line: number; readonly column: number };

export type SourceMap = {
  /** Where the map was read from, as messages name it. */
  readonly from: string;
  /** The sources it names, with its sourceRoot before each. */
  readonly sources: readonly (string | null)[];
  /** The source position a 1-based generated position maps to; null where the map gives none. */
  at(line: number, column: number): SourceMapping | null;
};

/** One segment of a line, all 0-based as the format has them; a source of -1 is a generated position with no origin. */
type Segment = { readonly column: number; readonly source: number; readonly line: number; readonly sourceColumn: number };

function refuse(what: string): never {
  throw new TraceRefusal(what);
}

/** The numbers one base64 VLQ field holds. Arithmetic, not bit shifts, so a wide value is read whole. */
function decode(field: string, from: string): number[] {
  const out: number[] = [];
  let value = 0;
  let weight = 1;
  for (const character of field) {
    const digit = DIGITS.get(character);
    if (digit === undefined) refuse(`${from} cannot be read: ${JSON.stringify(character)} is not a base64 VLQ digit`);
    value += (digit % CONTINUES) * weight;
    if (digit >= CONTINUES) {
      weight *= WIDTH;
      continue;
    }
    const magnitude = Math.floor(value / 2);
    out.push(value % 2 === 1 ? -magnitude : magnitude);
    value = 0;
    weight = 1;
  }
  return out;
}

/** The segments of each generated line. The source, its line and its column run on from line to line; the generated column does not. */
function segmentsOf(mappings: string, from: string): Segment[][] {
  const lines: Segment[][] = [];
  let source = 0;
  let line = 0;
  let sourceColumn = 0;
  for (const group of mappings.split(";")) {
    let column = 0;
    const segments: Segment[] = [];
    for (const field of group.split(",")) {
      if (field === "") continue;
      const numbers = decode(field, from);
      const [generated, ofSource, ofLine, ofColumn] = numbers;
      if (generated === undefined) continue;
      column += generated;
      if (ofSource === undefined || ofLine === undefined || ofColumn === undefined) {
        segments.push({ column, source: -1, line: 0, sourceColumn: 0 });
        continue;
      }
      source += ofSource;
      line += ofLine;
      sourceColumn += ofColumn;
      segments.push({ column, source, line, sourceColumn });
    }
    lines.push(segments);
  }
  return lines;
}

/** The standard puts sourceRoot before each source, with a separator where it has none. */
function rooted(root: string, source: string): string {
  if (root === "") return source;
  return root.endsWith("/") ? `${root}${source}` : `${root}/${source}`;
}

export function readSourceMap(from: string, text: string): SourceMap {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    refuse(`${from} cannot be read: it is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = Document.safeParse(raw);
  if (!parsed.success) refuse(`${from} cannot be read: ${parsed.error.issues.map((i) => `${i.path.map(String).join(".")} ${i.message}`).join("; ")}`);
  const map = parsed.data;
  if (map.sections !== undefined) refuse(`${from} is an index map: it has sections, which this reader does not read. Give it one of the maps the sections name`);
  if (map.version !== 3) refuse(`${from} is a source map of version ${JSON.stringify(map.version ?? null)}; this reader reads version 3`);
  if (map.mappings === undefined) refuse(`${from} cannot be read: a source map has mappings, and this has none`);
  if (map.sources === undefined) refuse(`${from} cannot be read: a source map has sources, and this has none`);
  const root = map.sourceRoot ?? "";
  const sources = map.sources.map((source) => (source === null ? null : rooted(root, source)));
  const lines = segmentsOf(map.mappings, from);
  return {
    from,
    sources,
    at(line, column) {
      const segments = lines[line - 1] ?? [];
      const found = segments.filter((segment) => segment.column <= column - 1).sort((a, b) => a.column - b.column).at(-1);
      if (found === undefined || found.source < 0) return null;
      const source = sources[found.source];
      if (source === undefined || source === null) return null;
      return { source, line: found.line + 1, column: found.sourceColumn + 1 };
    },
  };
}
