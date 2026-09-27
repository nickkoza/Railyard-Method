# Contributing

This repository is built with its own method. A change to it follows the same rules the
method asks of any repository it is installed in.

## Before you write code

1. **Read the skill**: `skills/spec-driven-change/SKILL.md`. It is not background reading —
   it is the process this repository holds every change to, including changes to itself.
2. **Find which artifact your change belongs to, and change that first.** New or changed
   behaviour is an acceptance criterion in `docs/specs/`, with its own stable ID. A new
   component or a changed boundary is `docs/architecture/`. A rule that constrains every
   future decision is `docs/principles/`. A mechanism that has to be pinned — forced by
   something outside this repository, conventional, or hard-won — is a waymark in
   `docs/waymarks/`, or the spec's own `## Decisions`. If you can't tell which, open an
   issue and ask rather than guessing: the whole value of the separation is that everyone
   puts things in the same place.
3. **Mint IDs before you write them**: `npm run --silent ids:take <n>` prints that many free
   ones (`--silent` matters — npm's own banner otherwise lands in the count). Never invent
   one and never reuse a retired one.

## Making the change

- **Test first, and watch it fail.** A test that passes the moment it's written proves
  nothing.
- **Every acceptance criterion has a Tests row and a test.** A criterion with no test is a
  wish.
- Before committing, all of these must be clean:
  - `npx tsc --noEmit`
  - `npm test`
  - `npm run check` — every rule the method holds this repository to; it should report no
    findings (a notice is fine and is printed, not failed, on)
- **One commit per change**, staging the files that change by name.

## Sending it

Open a pull request against `main`. CI (`.github/workflows/ci.yml`) runs `npm ci`, `tsc
--noEmit`, `npm test` and `npm run check` on every push and pull request; all four have to
pass before a maintainer looks at it.

## What CI does not run

`npm run evals` scores the skill's own instructions against real Claude Code sessions, with
an ablation baseline (skill present vs. absent) and a scored threshold. It costs real money
and runs on a maintainer's own API credential, so it is not wired into CI and does not run
on every push — a maintainer runs it by hand against a change that touches the skill
(`skills/spec-driven-change/SKILL.md`) or its cases (`evals/`), and the result is recorded in
`evals/RESULTS.md`. If your change touches either, say so in the pull request; a maintainer
will run the evaluations before merging.

## Licence

Contributions are made under this repository's licence (MIT, see `LICENSE`). Third-party
code bundled into the skill's tools carries its own notice in
`skills/spec-driven-change/THIRD_PARTY_NOTICES.md` — add to it if your change bundles
something new.
