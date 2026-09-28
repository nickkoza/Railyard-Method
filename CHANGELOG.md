# Changelog

This project's version tracks the method, not a release cadence: it stays below 1.0 until
the public release, and 1.0.0 is that release.

## [1.0.1] - 2026-09-27

### Fixed

- **Every bundled command answers `--help` and `-h` with its own usage, and does nothing
  else.** `upgrade` and `install` never received their arguments at all, so `upgrade --help`
  carried a repository forward instead of printing usage (found upgrading Railyard,
  2026-09-27); `install --help` would have installed for the same reason. `ids-take --help`
  read `--help` as an invalid count and exited 2; `ids-resolve --help` read it as an ID and
  reported that it named nothing.
- **`decisions-by-id` no longer changes an already-ID'd decision's own indentation.** It
  measured the whole marker of a numbered decision, ID included, instead of the ordinal
  alone, so a decision caught in the same rewrite as one still needing an ID had its
  continuation lines pushed from 3 spaces to 6.

## [1.0.0] - 2026-09-27

First public release.

### Added

- **The method as a Claude Code skill** (`skills/spec-driven-change`): artifacts change
  before code, every acceptance criterion carries a test, a citation is a stable ID and
  never a position, and a divergence between an artifact and the code is reported rather
  than silently resolved. Installs into a project with one command and needs nothing else
  set up.
- **Stable identifiers** for every artifact and every numbered item inside one — a spec, a
  criterion, a decision, a principle, an architecture node — minted by `ids-take` and
  looked up by `ids-resolve`, so a citation survives a rename, a renumber or a regrouping.
- **Traceability**: a published, versioned symbols format (`railyard-symbols`) recording
  what each position in the source traces back to, a CLI and a library that read and write
  it without a server, and a scan that runs after every write and tells an agent what its
  change did to the links it holds.
- **`railyard-check`**: every conformance rule the method holds a repository to, run in the
  repository it is started in — IDs that are missing, duplicated or unresolvable; a
  criterion with no Tests row; a stale citation; an architecture model out of step with
  its controls.
- **Continuous integration**: `npm ci`, `tsc --noEmit`, `npm test` and `npm run check` run
  on every push and pull request. The evaluations that hold the skill itself to its own
  ablation deltas remain a maintainer's own run, on their own credential, since they cost
  real money and only need to run when the skill or its cases change.

### Upgrading from 0.2

- **A Tests row names its criteria by ID, never by number.** `upgrade` carries every row
  that names criteria by number to their IDs, the criteria a row's notes cite by number
  among them, and lists each one it carried from a note for you to read. A row it cannot
  carry refuses the upgrade, naming the row, and nothing is changed; `tests-by-id
  --dry-run` shows the same before you start. Links to a spec whose rows it rewrote read as
  changed afterwards: `check` lists them.
- **Every decision is numbered, with an ID.** `upgrade` numbers each decision under
  `## Decisions`, in a spec or a waymark, written as a bullet or a bold paragraph, with a
  fresh ID, and indents what follows it inside it. A list after a decision, or a paragraph
  ending in a colon, may be read two ways; where it meets one, it refuses the upgrade, naming
  the place, and nothing is changed. `decisions-by-id --dry-run` shows the same before you
  start.
