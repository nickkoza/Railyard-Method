// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `railyard-ids-take [count]`: print free stable IDs, one per line.
//
// The rule an ID is judged by — every tracked file as it stands, every version of every file
// any ref reaches, and every commit message ([9pu]) — lives in `mint.ts`, exported so whatever
// else mints an ID reads the same answer. `freeId` owns only the question of which draws are
// free, refusing any that reads as an objectionable word ([LeX]), and judges neither the corpus
// nor the alphabet.
//
// It writes nothing. Taking an ID is the author's act: this says which are free, and the
// author puts one in the artifact's header.
import { mentionsIn, mintIds, Unreadable } from "./mint.ts";
import type { Mentions } from "./mint.ts";

export { Unreadable };

const COUNT = /^[1-9][0-9]*$/;

/** Whether an ID is taken in the repository at `root`: anything there mentions it, or ever did ([9pu]). */
export async function takenIn(root: string): Promise<(id: string) => boolean> {
  const mentions: Mentions = await mentionsIn(root);
  return (id) => mentions.has(id);
}

const USAGE = "usage: railyard-ids-take [count]   — count is a whole number of 1 or more";

export async function main(argv: readonly string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const [asked = "1", ...rest] = argv;
  if (rest.length > 0 || !COUNT.test(asked)) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  let mentions: Mentions;
  try {
    mentions = await mentionsIn(process.cwd());
  } catch (e) {
    if (!(e instanceof Unreadable)) throw e;
    // Nothing is offered unsearched ([9pu]): an ID drawn without the search is one nobody checked.
    process.stderr.write(`railyard-ids-take: no ID offered, because an ID is free only once the repository and its history are searched: ${e.message}\n`);
    return 1;
  }
  const ids = await mintIds(mentions, Number(asked));
  process.stdout.write(`${ids.join("\n")}\n`);
  return 0;
}
