// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard-check: every check the method holds a repository to, run in the repository it is
// started in ([f4v]). Exits 1 on any finding, and 2 when the checks cannot run at all: a check
// that could not look is never reported as one that found nothing ([9p5]).
import { checkRepository } from "./artifacts.ts";
import type { Finding } from "./artifacts.ts";

const USAGE = "usage: railyard check                             every finding the method holds this repository to, in the repository it is run in";

export function main(argv: readonly string[] = []): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  let found;
  try {
    found = checkRepository(process.cwd());
  } catch (e) {
    console.error(`The checks could not run: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  for (const f of found.filter((x) => x.notice !== true)) console.log(`${f.rule}  ${f.message}`);
  for (const f of found.filter((x) => x.notice === true)) console.log(`${f.rule}  notice: ${f.message}`);
  const line = summary(found);
  console.log(line === "No findings." ? line : `\n${line}`);
  return found.some((f) => f.notice !== true) ? 1 : 0;
}

/**
 * The check's closing line ([f4v]): how many findings, how many notices, and how many of those are
 * links a change left to answer ([G0i]), with the command that answers them. A bare count of
 * notices after "No findings" was read as a clean result.
 */
export function summary(found: readonly Finding[]): string {
  const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? "" : "s"}`;
  const failing = found.filter((f) => f.notice !== true).length;
  const notices = found.filter((f) => f.notice === true);
  const stale = notices.filter((f) => f.stale === true).length;
  const counted = notices.length === 0
    ? ""
    : `${plural(notices.length, "notice")}${stale === 0 ? "" : `, ${String(stale)} of them ${stale === 1 ? "a link" : "links"} a change left to answer: run \`links <file>\` on each file named, and confirm, re-link or unlink what it lists`}`;
  if (failing > 0) return `${plural(failing, "finding")}${counted === "" ? "" : `, and ${counted}`}.`;
  return counted === "" ? "No findings." : `No findings; ${counted}.`;
}
