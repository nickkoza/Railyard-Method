# [MVi] — The method ships as one repository: the skill, the artifact system and the symbol system

**Status:** Accepted · **Date:** 2026-09-21 · **Source:** the owner, 2026-09-21, asked what it would take to release the skill separately and decided the shape: "they ship as one, as they're foundationally linked. It is basically the Railyard development skill, which includes all our opinions." · **Builds on:** [QBm], [J8n], [YV9] · **ID:** [MVi]

## Context

Three things built here are usable without Railyard, and the owner wants to use two of
them on other work before Railyard's own application is ready.

- **The skill** (`skills/spec-driven-change/SKILL.md`) carries the method: artifacts
  before code, the requirement found before the artifact is written, a criterion cited by
  its stable ID, every criterion carrying a test, a divergence reported rather than
  quietly resolved ([J8n]). It names Railyard nowhere — no paths, no npm scripts, no
  citations — because [YV9] says what travels is the method and not this project's rules.
- **The artifact system**: stable IDs, the grammar for citing them, the tools that mint
  and resolve them, and the checks that hold both.
- **The symbol system**: `packages/traceability`, which records what each position in the
  source traces back to. [QBm] already requires that its format be open and its tools
  stand alone, and two conformance checks hold it: nothing in that directory depends on
  Railyard's other code, and a query reads only the repository it is pointed at.

That last point is why this is a small job rather than a large one. The separability was
specified and mechanically enforced before anyone wanted it, so it is a fact rather than
a hope: the package has no imports outside itself, its own `package.json` and `bin`, its
own MIT licence against Railyard's Elastic 2.0, and a JSON Schema whose `$id` already
names its own format and version.

The question the owner answered is not whether to release but in what shape. Two
repositories would let the symbol system — the more finished of the two — go first, and
it does not import the ID tooling, so nothing technical binds them.

**What the release is for** is the owner's next sentence, and it sets the bar: install the
skill in Claude Code, work that way on a repository Railyard has never seen, and later
point Railyard at it and have it fully functional and understood. The skill is the on-ramp
to Railyard, not a description of it. That is written as [ZNz], and it decides the shape of
everything below — most of all what may be configured and what may not.

## Decisions

1. [lWl] **The three ship as one repository, and it is the development skill.** Not a
   library that happens to have a skill beside it: the skill is the thing, and the
   artifact system and the symbol system are what it needs to be followed. They are
   foundationally linked — the method says cite by stable ID, so the ID tooling is how
   that is done; the method says report a divergence between an artifact and the code, so
   the symbol system is what sees one. Split apart, each half is a tool whose reason has
   been left in the other repository.

2. [x9j] **It carries the opinions, and says they are opinions.** What ships is not a
   neutral toolkit. It is how this owner thinks software should be built, and a reader
   deciding whether to adopt it is owed that plainly rather than discovering it in the
   defaults. [YV9]'s line stays exactly where it is: the method travels, Railyard's own
   project rules do not, and `CLAUDE.md` — Railyard's own standing project instructions,
   the coding opinions and workflow rules particular to that repository — is not in the
   release.

3. [OWt] **The released repository is MIT; Railyard stays Elastic 2.0.** The release exists
   so that people work with the skill and their repositories later drop into Railyard
   ([ZNz]) — adoption is the mechanism and not a side effect, so a licence that gives a
   reader pause works against the only thing the release is for. [QBm] already commits that
   the symbol format is open "so that any tool can produce and read it", and a format others
   cannot freely implement is not open. Elastic 2.0's protection is that the software may
   not be offered as a hosted or managed service: that protects Railyard — the daemon, the
   desk, the containers — and has nothing to bite on in a written method and a CLI.

   The cost is accepted rather than overlooked. Someone can build on the method and the
   format, including something that competes; the method is prose published in order to be
   copied, so that was true the moment it went out.

4. [dXi] **Railyard consumes it as a dependency, and keeps no copy.** The extraction is
   a move, not a copy. A copy means two records of the same rules drifting apart, which is
   the failure [SYK] names — an artifact and the running system disagreeing — reproduced
   at the level of whole repositories. Railyard's own conformance checks then run against
   the published tools, which is also the only honest test that the release works.

5. [Lj3] **The conventional paths travel with the method; only what is particular to this
   repository becomes configuration.** `docs/architecture/*.json`, and `docs/specs/`,
   `docs/waymarks/` and `docs/principles/` are not facts about where Railyard happens to put
   things — they are the contract that lets a repository built with the skill be read by
   Railyard with nothing set up ([ZNz]). They are load-bearing precisely because they are
   arbitrary: the whole of their value is that everyone picks the same ones, so the skill
   names them and Railyard expects them.

   What does become configuration is what is genuinely this project's: the exclusion lists
   naming `docs/archive/`, `docs/research/`, `docs/reviews/`, `docs/spikes/` and a path in
   the daemon, and `docs/architecture/railyard.json` by name. `railyard-adapter.ts` is where the
   artifact grammars live and stays the extension point, shipping as the reference adapter
   — for a repository that has already chosen differently, not as an invitation to.

   **This reverses what this decision first said.** It read "what is Railyard's layout
   becomes configuration", which would have let every repository invent its own and then
   need converting at the door — the opposite of the thing being built.

   Fixing the paths this way is only safe because [o7Y] makes them changeable: a repository
   records the method version it was built under, so a later skill can move a path and
   carry existing repositories across. Without that the convention would harden into
   something nobody could correct, since moving a path would silently orphan every
   repository already laid out the old way. The release ships both or neither.

## Consequences

Railyard depends on a published package for something it uses on every commit, so a
release that breaks the checks breaks Railyard's own gate.

Done 2026-09-22. Two of Railyard's controls did not survive the move and should not have:
that the piece imports nothing of Railyard's is now held by the repository boundary rather
than by a check, and that it reads git only is held by a test in the method's repository,
where the code is. A repository cannot hold a control over code it does not contain.

The move could only be made once the package was installable, and it was not: Node refuses
to strip types under `node_modules`, so a package shipping TypeScript does not run once
installed. It builds to JavaScript now, and a test installs the packed tarball into an empty
project and uses it from there. That is the point of decision
[dXi] and it is also its cost: the release cannot be careless, because this repository is
the first thing it breaks.

The evaluations travel as they are. Evaluations are an ordinary part of a Claude Code
skill, laid out where that tooling expects them, and someone running a skill's eval suite
knows they are running a test suite. They are also not on most people's path at all: using
the skill never runs them, and [fcg] is what brings a contributor to them.
