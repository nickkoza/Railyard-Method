// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [o7Y]: the method version a repository was built under, and what a skill does about the one it
// finds.
//
// A skill arriving in a repository cannot know from its contents which version of the method laid
// it out — the layout reads the same either way, and guessing is how one side's change becomes the
// other's silent misreading. This is [QBm]'s argument about the symbols format, applied to the
// repository. What differs is the response: a reader of a document that meets an unknown version
// stops, because it is being asked to read; a skill that meets an OLDER version does the work,
// because it is being asked to carry a repository forward.
//
// The marker's own path can never move. Everything else is migratable because the version says
// how; the version has to be found before anything is known, so it is fixed once.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

/** The marker is written by one tool and read by another, which is a process boundary: it is
 * validated rather than asserted about. Loose, so a field added later is ignored rather than fatal. */
const Marker = z.looseObject({ method: z.string().min(1) });

/** Fixed once, permanently: the one path that cannot be migrated, because it is what says how. */
export const MARKER = ".railyard/method.json";

/**
 * The version of the method this skill works to. Semantic versioning, on the same terms the
 * symbols format already uses (`FORMAT.md`, Compatibility): while the major version is zero the
 * minor version is the compatibility unit. The convention is shared with the format rather than
 * chosen afresh because consistency is the whole of its value — two version schemes in one
 * repository is two things to learn and one to get wrong.
 */
export const METHOD_VERSION = "1.0.3";

/** What a skill should do about the version it found, and the facts it needs to do it. */
export type Plan =
  | { readonly do: "nothing" }
  | { readonly do: "record"; readonly to: string }
  | { readonly do: "upgrade"; readonly from: string; readonly to: string }
  | { readonly do: "refuse"; readonly why: string };

/** `major.minor.patch`, each a number, and nothing else: an order this can actually reason about. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * The version the repository at `root` records, or null where it records none — which is a
 * repository the skill has not worked in, not an error. A marker that cannot be read as the record
 * it should be is treated the same way: the repository is telling us nothing, and [epm] says ask
 * only for what cannot be found.
 */
export function readMethodVersion(root: string): string | null {
  const path = join(root, MARKER);
  if (!existsSync(path)) return null;
  try {
    const found = Marker.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return found.success ? found.data.method : null;
  } catch {
    return null;
  }
}

/** Records `version` as the repository's, making the marker's directory if it is not there yet.
 * Every other field in the marker is the repository's, and is kept. */
export function writeMethodVersion(root: string, version: string): void {
  const path = join(root, MARKER);
  mkdirSync(dirname(path), { recursive: true });
  let kept: object = {};
  try {
    const fields: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof fields === "object" && fields !== null && !Array.isArray(fields)) kept = fields;
  } catch {
    // No marker, or one that is not JSON: there is nothing of the repository's to keep.
  }
  writeFileSync(path, `${JSON.stringify({ ...kept, method: version }, null, 2)}\n`);
}

/** How `version` orders against `mine`, or null where either is not a version at all. */
function ordered(version: string, to: string): number | null {
  const found = SEMVER.exec(version);
  const mine = SEMVER.exec(to);
  if (found === null || mine === null) return null;
  for (let at = 1; at <= 3; at += 1) {
    const theirs = Number(found[at]);
    const ours = Number(mine[at]);
    if (theirs !== ours) return theirs < ours ? -1 : 1;
  }
  return 0;
}

/**
 * What to do about the repository at `root`, for a skill working to `to` (this one's version, but
 * for a test of an upgrade built before the version it belongs to is released). The four answers are [o7Y]'s: record where there is
 * nothing, do nothing where it matches, upgrade where it is older, and refuse where it is newer or
 * unreadable — a version from the future is a layout whose rules this skill has not been told, and
 * a version that is not a version cannot be ordered against anything.
 */
export function plan(root: string, to: string = METHOD_VERSION): Plan {
  const found = readMethodVersion(root);
  if (found === null) return { do: "record", to };
  const order = ordered(found, to);
  if (order === null) {
    return { do: "refuse", why: `${MARKER} records "${found}", which is not a version this can order against ${to}` };
  }
  if (order > 0) {
    return { do: "refuse", why: `${MARKER} records ${found}, which is newer than the ${to} this skill works to; its rules are not ones this skill has been told` };
  }
  return order < 0 ? { do: "upgrade", from: found, to } : { do: "nothing" };
}
