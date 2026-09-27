# [8rB] — The record stays legible; a derived index answers the queries

**Status:** Accepted · **Date:** 2026-09-21 · **Source:** the owner, 2026-09-21, after the profile of `forward` and `backward`: "We keep the symbols file legible because multiple agents may write to it at the same time. What if at read time we parsed it into a flat binary format that we can randomly seek? Spend 200ms after updates to automatically flatten it again, then spend 10s of ms to do individual look ups" · **Builds on:** [QBm], [qHR] · **ID:** [8rB]

## Context

[qHR] takes git out of the query path, and the NFR puts the whole command inside 50 ms at
p95 with start-up counted. Neither is reachable by reading the record as it stands.

**What a query needs, against what it reads.** One `backward` needs one file's positions:
a median of 2 KB, 23 KB at p95. To get them it parses and validates `index.json` at
11.8 MB and a version document at 3.5 MB. Measured 2026-09-21: 1.7 s, of which 18% is
building link objects, 20% is schema validation and 16% is garbage collection.

**Why the record is the shape it is.** It is JSON, one document per version, checked in
beside the source. That is not an accident and it is not up for reconsideration here:
several agents write to it at once, and a text record is one that merges, conflicts
visibly, and can be read by a person looking at a diff. A binary record would make every
concurrent write a conflict nobody can resolve.

**The other half of the budget.** 137 ms of the current command is start-up before a byte
of the record is read: 44 ms stripping types at run time, 67 ms importing the schema
validator. A format that needs no validation at read time is what removes the second, and
it is the larger of the two.

So the record is right and reading it is wrong, which is what a derived index is for.

## Decisions

1. [fCG] **The JSON record stays authoritative, legible and checked in.** Nothing here
   changes what is written or how. It is what agents write concurrently, what merges, and
   what a person reads in a diff.

2. [yZH] **A derived index answers the queries, and is never authoritative.** It is built
   from the record, laid out to be seeked rather than parsed, and holds no fact the record
   does not. Anything that disagrees with the record is a bug in the index, never a
   finding about the code.

3. [LeJ] **It is throw-away, and lives in scratch space rather than in the repository.**
   Not checked in, and not sitting untracked in the working tree either: a cache in the
   tree is one that gets committed by an agent running `git add -A`, shows up in every
   `status`, and has to be explained to everyone who sees it. A binary file in git would
   also conflict on every concurrent write, which is the problem [fCG] exists to avoid
   reintroduced one directory along.

   It goes where throw-away things go — the user's cache directory, keyed by which
   repository and which symbols directory it was built from, since one cache holds several.
   Being throw-away is a property to lean on rather than apologise for: it can be deleted
   at any moment by anyone, and the only consequence is that the next query rebuilds it.
   A fresh clone, a cleared cache and a machine that has never run this are the same case,
   and it is the case the code has to handle well because it is the common one.

4. [z3s] **The index carries a witness of what it was built from, and a reader checks it
   before trusting it.** This is the whole risk of the design. A stale index answers
   *plausibly and wrongly* — the shape of answer this project calls its worst failure,
   because nothing about it says anything is wrong.

   The check must cost microseconds or it eats the budget it exists to protect: hashing
   15 MB to verify costs more than parsing it did. So the witness is the size and
   modification time of every file the index was built from, and checking it is a `stat`
   per version file — nine of them here.

   **A reader that finds the witness stale does not answer from the index.** It rebuilds,
   answers, and says that it rebuilt. It never answers from a stale index, and it never
   quietly falls back to the slow path and calls that success: a command that is
   occasionally 1.7 s and never says why is one whose NFR cannot be measured.

5. [mmQ] **The query path validates nothing at read time, and that is what the layout
   buys.** A schema validator exists because a document's shape is not guaranteed. The
   index's shape is guaranteed by the program that wrote it moments earlier, against a
   witness already checked. Dropping the validator from this path is worth 67 ms of the
   50 ms budget, which is to say the budget is not otherwise reachable.

6. [3By] **The index is replaced atomically, and a build never leaves a half-written one.**
   Written to a temporary name and renamed over the old one, so a reader either sees the
   whole previous index or the whole new one. Agents write while other agents read, and a
   torn read of a binary file is not something a reader can detect from its contents.

## Consequences

The first query after an update pays the rebuild — about 200 ms on this repository, against
1.7 s for the query it replaces. It is paid once per update rather than once per query,
which is the trade: the work moves from every read to every write, and there are far more
reads. The same 200 ms is paid on a fresh clone and after a cache is cleared, which is what
being throw-away costs and it is the right price for never having a stale record in the
tree.

`index` gains a second output and a second way to be wrong. Its tests have to cover the
witness going stale — a file touched, a version added — because that path is the one whose
failure is silent.

**What this does not fix.** 44 ms of run-time type-stripping stays, and 20 ms of interpreter
start-up under that. Against a 50 ms budget with a rebuilt index, those two are most of
what is left, so the query path has to be shipped already compiled. That is a packaging
decision and it is not made here.
