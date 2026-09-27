// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Producing a symbols file ([LRA], [LPv]): a version of a symbols directory, written from exactly what the backward
// query already knows. It adds no evidence of its own — nothing is inferred,
// nothing is proposed, and no criterion's tests are run — so it is criterion
// 9's backfill of what was built before traceability existed. Consecutive lines
// whose links are the same become one position, and a line that traces to
// nothing is not written at all.
import { relative, resolve, sep } from "node:path";
import { z } from "zod";
import { Sha, Unreadable, Version } from "./model.ts";
import type { Adapter, Link } from "./model.ts";
import { traceAll } from "./query.ts";
import type { Traced } from "./query.ts";
import { writeVersion } from "./symbols.ts";
import type { SymbolPosition } from "./symbols.ts";
import { anchorAt } from "./anchor.ts";
import { openRepository } from "./git.ts";

export type IndexQuery = {
  /** A directory in the repository to read. */
  readonly repo: string;
  /** The commit to read; `HEAD` when absent. */
  readonly at?: string | undefined;
  /** The symbols directory to write; it is made when it is not there. */
  readonly symbols: string;
  /** The build hashes this version answers for. */
  readonly builds?: readonly string[] | undefined;
  readonly adapters?: readonly Adapter[] | undefined;
};

const WrittenAnswer = z.strictObject({
  written: z.boolean(),
  commit: Sha,
  file: z.string().min(1).nullable(),
  base: Sha.nullable(),
  positions: z.number().int().nonnegative(),
  links: z.number().int().nonnegative(),
  builds: z.array(z.string().min(1)),
});

export const IndexAnswer = z.strictObject({
  query: z.literal("index"),
  at: Version,
  symbols: z.string().min(1),
  /** The files that carry at least one position. */
  files: z.number().int().nonnegative(),
  written: WrittenAnswer,
  unreadable: z.array(Unreadable),
});
export type IndexAnswer = z.infer<typeof IndexAnswer>;

type Run = { readonly path: string; readonly start: number; readonly end: number; readonly endColumn: number; readonly key: string; readonly links: readonly Link[] };

/** Consecutive lines of one file whose links are the same are one position, ending past the last line's last character.
 *
 * Each position also records what it NAMES ([LdF]): the function, class or binding its first line
 * falls inside. A position held by a file and a line is destroyed by an edit anywhere above it;
 * one that names the thing it is in survives that. `textOf` answers the file's text at the commit,
 * or undefined where it cannot be read — and a position whose text is unavailable records no
 * anchor rather than a guessed one. */
function merge(entries: readonly Traced[], textOf: (path: string) => string | undefined): SymbolPosition[] {
  const out: SymbolPosition[] = [];
  let run: Run | undefined;
  const flush = (): void => {
    if (run === undefined) return;
    const text = textOf(run.path);
    const anchor = text === undefined ? undefined : anchorAt(text, run.start);
    out.push({
      path: run.path,
      start: { line: run.start, column: 1 },
      end: { line: run.end, column: run.endColumn },
      links: run.links,
      ...(anchor === undefined || anchor.kind === "span" ? {} : { anchor }),
    });
  };
  for (const entry of entries) {
    const key = JSON.stringify(entry.links);
    if (run !== undefined && run.path === entry.path && entry.line === run.end + 1 && run.key === key) {
      run = { ...run, end: entry.line, endColumn: entry.length + 1 };
      continue;
    }
    flush();
    run = { path: entry.path, start: entry.line, end: entry.line, endColumn: entry.length + 1, key, links: entry.links };
  }
  flush();
  return out;
}

/**
 * Writes the commit's symbols into the directory, as a delta against its newest version. When the commit's positions
 * are what that version already says, no file is written and the build hashes join it instead.
 */
export function indexCommit(query: IndexQuery): IndexAnswer {
  // [QBm]: a symbols directory checked into the repository it describes is the index, not source. Walking
  // it would index the output of the last run, and indexing would never converge.
  const within = relative(resolve(query.repo), resolve(query.symbols)).split(sep).join("/");
  const inside = within !== "" && within !== ".." && !within.startsWith("../");
  const all = traceAll({ repo: query.repo, at: query.at, adapters: query.adapters, exclude: inside ? [within] : [] });
  // One file is read once, however many positions fall in it: the anchor scan is cheap and the
  // read is not.
  const repository = openRepository(query.repo);
  const texts = new Map<string, string | undefined>();
  const textOf = (path: string): string | undefined => {
    if (!texts.has(path)) texts.set(path, repository.read(all.at.commit, path));
    return texts.get(path);
  };
  const positions = merge(all.entries, textOf);
  // [LRA]: the directory names the tree it describes, by where it sits in it. A directory in the root of
  // the tree records "..", and one beside the tree the path back to it.
  const root = relative(resolve(query.symbols), resolve(query.repo)).split(sep).join("/") || ".";
  const written = writeVersion(query.symbols, all.at, positions, query.builds ?? [], root);
  return IndexAnswer.parse({
    query: "index",
    at: all.at,
    symbols: query.symbols,
    files: new Set(positions.map((p) => p.path)).size,
    written,
    unreadable: all.unreadable,
  });
}
