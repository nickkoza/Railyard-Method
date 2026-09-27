// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [MVi]: what a repository says about itself, as against what the method fixes for everyone.
//
// The conventional paths are the method's and are not configurable (`paths.ts`). This is the other
// half: the facts that are genuinely one repository's. A repository keeps documents that record a
// moment — a review, a spike, an open question, a register whose subject IS a set of numbers — and
// those must be left exactly as they were written. Rewriting a dated entry to say what is true now
// would falsify it, which is why the citation checks skip them.
//
// Which directories those are is not something the method can know. Railyard has `docs/reviews/`
// and `docs/spikes/`; another repository will have its own, or none. So the repository names them,
// in the same marker that records its method version — one file holding what this repository says
// about how it uses the method.
//
// A repository that names none is not assumed to have any. Nothing is skipped that was not asked
// for: over-skipping is a check quietly not running, which is worse than a finding.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { MARKER } from "./version.ts";

/** Read at a process boundary, and loosely: a field this does not know is another reader's. */
const Marker = z.looseObject({ dated: z.array(z.unknown()).optional() });

/**
 * The paths this repository says record a moment, as it wrote them. A trailing `/` means a
 * directory and everything under it; anything else is one file. Entries that are not usable paths
 * are dropped rather than failing the list, so one bad line does not turn every check off.
 */
export function datedPaths(root: string): readonly string[] {
  const path = join(root, MARKER);
  if (!existsSync(path)) return [];
  try {
    const found = Marker.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!found.success) return [];
    return (found.data.dated ?? []).filter((entry): entry is string => typeof entry === "string" && entry !== "");
  } catch {
    return [];
  }
}

/**
 * Whether `file` — a path relative to the repository's root — is one of the documents this
 * repository says records a moment. A directory entry matches what is inside it and not a sibling
 * whose name merely begins the same way.
 */
export function recordsAMoment(root: string, file: string): boolean {
  return datedPaths(root).some((dated) => (dated.endsWith("/") ? file.startsWith(dated) : file === dated));
}

/** Read loosely, like the dated list: a field this does not know is another reader's. */
const Repositories = z.looseObject({ repositories: z.record(z.string(), z.unknown()).optional() });

/**
 * The repositories this one cites by name ([Bvq]), from its marker: each short name to the URL
 * it was declared with. A name whose URL is not a non-empty string is left out, and a citation of
 * it is then said to be undeclared rather than guessed at.
 */
export function repositoriesOf(root: string): ReadonlyMap<string, string> {
  const path = join(root, MARKER);
  if (!existsSync(path)) return new Map();
  try {
    const found = Repositories.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!found.success) return new Map();
    return new Map(Object.entries(found.data.repositories ?? {}).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
  } catch {
    return new Map();
  }
}
