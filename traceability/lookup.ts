// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Answering a position from a symbols file ([BKY]). It reads the symbols directory, and the built output when
// it is given one, and nothing else: no repository, and no git. A position in
// what was built is mapped to its source position through the source map the
// build already made, and code with no source map is traced at its own
// positions. The answer says that it came from the symbols, names the version
// it read, and names the map it followed, so a link is never shown as belonging
// to a version, or a position, it does not. A position the version records
// nothing for is untraced, and nothing is guessed.
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { Sha, TraceRefusal } from "./model.ts";
import { readSourceMap } from "./source-map.ts";
import { readSymbols, SymbolLink } from "./symbols.ts";

const Line = z.number().int().positive();
const Place = z.strictObject({ line: Line, column: Line });
/** A position as it is asked about: a null column asks about the whole line. */
const Asked = z.strictObject({ path: z.string().min(1), line: Line, column: Line.nullable() });

/** Where a built position came from, when the answer followed a source map. */
const Mapped = z.strictObject({
  /** The source map followed. */
  through: z.string().min(1),
  /** The position in the built file that was asked about. */
  built: Asked,
  /** The source position the map gives, in the symbols file's terms; null when there is none. */
  to: z.strictObject({ path: z.string().min(1), line: Line, column: Line }).nullable(),
  /** Why there is no source position, when there is none. */
  why: z.string().min(1).nullable(),
});

export const SymbolsAnswer = z.strictObject({
  query: z.literal("backward"),
  /** Where the answer came from: the symbols file, rather than the repository. */
  from: z.literal("symbols"),
  /** The symbols directory read. */
  symbols: z.string().min(1),
  version: z.strictObject({ commit: Sha, generated: z.string().min(1), builds: z.array(z.string().min(1)) }),
  /** The source map followed, when the position was in a built file; null when none was. */
  mapped: Mapped.nullable(),
  /** The position looked up in the symbols file; null when a map was followed and gave none. */
  position: Asked.nullable(),
  traced: z.boolean(),
  /** Each position of the version that covers the one looked up, with its links. */
  positions: z.array(z.strictObject({ start: Place, end: Place, links: z.array(SymbolLink) })),
});
export type SymbolsAnswer = z.infer<typeof SymbolsAnswer>;

export type LookupQuery = {
  /** The symbols directory. */
  readonly symbols: string;
  /** The build hash whose version answers; the newest version when absent. */
  readonly build?: string | undefined;
  /** The file: one of the built output's when `built` is given, and otherwise one the symbols file names. */
  readonly path: string;
  /** 1-based. */
  readonly line: number;
  /** 1-based; the whole line when absent. */
  readonly column?: number | undefined;
  /** The built output the path is in. Its source map, where it has one, takes the position back to its source. */
  readonly built?: string | undefined;
  /** The root the symbols file's paths are relative to; the root the directory itself records when absent ([LRA]). */
  readonly root?: string | undefined;
};

type Followed = { readonly mapped: z.infer<typeof Mapped> | null; readonly position: z.infer<typeof Asked> | null };

/** The last `sourceMappingURL` comment of a built file, which is where a build leaves it. */
const SOURCE_MAPPING_URL = /\/\/[#@]\s*sourceMappingURL=(\S+)[ \t]*$/gm;
const DATA_URI = /^data:[^,]*?(;base64)?,([\s\S]*)$/;

function refuse(what: string): never {
  throw new TraceRefusal(what);
}

/** A source map named beside a built file, or carried in a data URI; its text, and the directory its sources are relative to. */
function mapBeside(file: string, url: string): { readonly from: string; readonly text: string; readonly beside: string } {
  const data = DATA_URI.exec(url);
  if (data !== null) {
    const payload = data[2] ?? "";
    const text = data[1] === undefined ? decodeURIComponent(payload) : Buffer.from(payload, "base64").toString("utf8");
    return { from: `the source map in ${file}`, text, beside: dirname(file) };
  }
  const path = isAbsolute(url) ? url : join(dirname(file), url);
  if (!existsSync(path)) refuse(`${path}, which ${file} names as its source map, is not there`);
  return { from: path, text: readFileSync(path, "utf8"), beside: dirname(path) };
}

/** A source the map names, as the symbols file would name it: relative to the root, and never outside it. */
function within(source: string, beside: string, root: string): { readonly path: string | null; readonly why: string | null } {
  const absolute = resolve(beside, source);
  const inside = relative(root, absolute);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    return { path: null, why: `${source} is ${absolute}, which lies outside ${root}, so the symbols file does not name it` };
  }
  return { path: inside.split(sep).join("/"), why: null };
}

/**
 * The position to look up: the source position a built position maps to, or the position as it was given. `recorded`
 * is the root the symbols directory names, which is what a mapped source is made relative to unless the caller named
 * another ([LRA]).
 */
function follow(query: LookupQuery, recorded: string): Followed {
  const asked = { path: query.path, line: query.line, column: query.column ?? null };
  if (query.built === undefined) return { mapped: null, position: asked };
  const file = join(query.built, query.path);
  if (!existsSync(file)) refuse(`${file} is not there, so the position in it cannot be mapped to its source`);
  const text = readFileSync(file, "utf8");
  SOURCE_MAPPING_URL.lastIndex = 0;
  const url = [...text.matchAll(SOURCE_MAPPING_URL)].at(-1)?.[1];
  // Code with no source map is traced at its own positions.
  if (url === undefined) return { mapped: null, position: asked };
  const { from, text: mapText, beside } = mapBeside(file, url);
  const map = readSourceMap(from, mapText);
  const at = map.at(query.line, query.column ?? 1);
  if (at === null) {
    return { mapped: { through: from, built: asked, to: null, why: `${from} maps nothing at ${query.path}:${String(query.line)}:${String(query.column ?? 1)}` }, position: null };
  }
  const root = resolve(query.root ?? recorded);
  const { path, why } = within(at.source, beside, root);
  if (path === null) return { mapped: { through: from, built: asked, to: null, why }, position: null };
  const to = { path, line: at.line, column: at.column };
  return { mapped: { through: from, built: asked, to, why: null }, position: { ...to } };
}

export function lookUp(query: LookupQuery): SymbolsAnswer {
  const symbols = readSymbols(query.symbols);
  const version = symbols.version(query.build ?? null);
  const { mapped, position } = follow(query, resolve(query.symbols, symbols.root));
  const found = position === null ? [] : version.at(position.path, position.line, position.column);
  return SymbolsAnswer.parse({
    query: "backward",
    from: "symbols",
    symbols: query.symbols,
    version: { commit: version.commit, generated: version.generated, builds: version.builds },
    mapped,
    position,
    traced: found.length > 0,
    positions: found.map((p) => ({ start: p.start, end: p.end, links: p.links })),
  });
}
