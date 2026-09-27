// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `npm run ids:take` ([9pu]): supply a free stable ID — three characters of [A-Za-z0-9]
// that appear nowhere in the repository, and never did.
//
// Uniqueness is kept by checking rather than by a register: generate one, look for those
// three bare characters, and re-roll on any hit. A false positive costs one re-roll, so
// the search is deliberately naive and deliberately over-eager — it reads the whole
// repository and its history, generated files included. Measured 2026-09-16: 76% of the 238,328 possible
// IDs are free here, so an ID costs about 1.3 draws.
//
// It writes nothing. Taking an ID is the author's act; this only says which are free.

export type Drawn = { readonly id: string; readonly draws: number };

/**
 * More draws than an unexhausted space could plausibly need. With three quarters of the
 * space free a single run of this many hits has probability around 10^-125, so reaching
 * the cap means the space is exhausted — or `present` says everything is taken — and
 * either way the honest answer is to refuse rather than spin.
 */
const CAP = 1000;

/**
 * The first drawn ID that `present` does not hold, and what it cost in draws.
 *
 * It judges nothing about the shape of what it draws: the draw source owns the alphabet,
 * and this owns only the question of which are free. The caller owns what "taken" means,
 * which is how an ID drawn earlier in the same run counts as taken before anything is
 * written down, and `present` may answer at once or later: a consumer's own rule may have
 * to read something to know. When `present` fails, nothing is offered.
 */
export async function freeId(present: (id: string) => boolean | Promise<boolean>, draw: () => string): Promise<Drawn> {
  for (let draws = 1; draws <= CAP; draws += 1) {
    const id = draw();
    if (!(await present(id))) return { id, draws };
  }
  throw new Error(`no free ID in ${String(CAP)} draws; the three-character space is exhausted, or everything reads as taken`);
}
