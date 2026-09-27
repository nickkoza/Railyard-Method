# Artifacts

**Type:** Capability spec · **Status:** Draft · **Source:** the owner, 2026-09-23; [vKz], [rFT], [Bsh] · **ID:** [XLT]

## Purpose

A repository's artifacts are held to the method by checks, not by review ([Bsh]). This spec
says what those checks hold: that every artifact and numbered item carries an identifier,
that a citation is that identifier, and that a spec's Tests table accounts for every
criterion. The architecture model's own rules are in the architecture spec ([iVr]); a
reference resolving exactly is traceability's ([BNb]).

## Acceptance criteria

1. [8g5] **Every artifact, and every numbered item in one, carries a stable ID:** three
   characters of `[A-Za-z0-9]`, set once and never changed. That is each spec, waymark,
   principles file and architecture model, and each acceptance criterion, each principle and
   each of a waymark's decisions. It is assigned when the thing is created, and nothing
   rewrites it afterwards: renaming, renumbering, moving between files, or deleting and
   restoring all leave it as it was. An ID no artifact carries is not reused, and no two
   carry the same one. A missing ID and a malformed one are reported apart, because they are
   different mistakes.

   A decision is a numbered item, `N. [ID] …`, whether it sits in a waymark or in the spec it
   serves, so every decision can be cited. One written any other way under a `## Decisions`
   heading, a bullet or a paragraph that opens in bold, carries no ID and is reported as a
   decision that carries none, naming its line; prose that introduces the decisions, and
   what is indented inside a numbered one, is not a decision. Found 2026-09-27: a repository
   started from the skill wrote 31 decisions across 10 specs as bullets, and the check,
   which read only numbered items, passed every one.

2. [pY5] **A citation of something that has an ID is written as the ID.** The forms that
   name a thing by where it sits (a spec's name and a criterion's number, a spec's path, a
   waymark's number, a waymark's decision by its number, a principle's number, a spec
   naming its own criterion by number) are
   reported wherever the thing they name exists and carries an ID, with the ID to write
   instead ([vKz]). Where the old form names something that no longer exists, there is no ID
   to write: that is a dead reference, and waits to be repaired where it stands, rather than
   making this check one nobody can satisfy. A form quoted to describe it, in a code span of
   two backticks or a fenced block, is not a use of it.

   **Nor does a tool print one.** What a tool says about an artifact is its ID, what kind of
   thing it is, and the file it is in (`[Ay4] (docs/specs/x.md)`), because a form a tool
   prints is a form its reader copies. Found 2026-09-26: `ids-resolve` and `trace` printed a
   spec's name and a criterion's number, and `trace`'s own usage offered a waymark's number.

3. [Xtd] **A spec's Tests table accounts for every criterion, by its ID** ([rFT], [vKz]). A
   row opens with the IDs of the criteria it covers, `[Aa1]`, several joined by commas or
   "and", and whatever follows them is a note; a row covering no one criterion, such as the
   non-functional requirements' or failure behaviour's, opens with words instead. Every
   criterion is named by at least one row. A row that opens with a criterion's number or a
   range of numbers is the retired form, and is reported with the IDs to write instead, for
   every number in its list, a note between two of them among it (`7 (composition), 19`),
   and with the command that carries every such row at once ([R6P]), since a repository
   with one such row usually has many (found 2026-09-27, grading a repository worked with
   the skill, whose agent carried rows by hand one finding at a time): a
   number names whichever criterion sits there now, so reordering the criteria moved a test
   onto another one and nothing noticed (found 2026-09-27, by an audit that swapped two
   criteria in a scratch repository). No reading of it during a migration is kept, because
   the migration ([R6P]) is one command. A row that cites a criterion by number anywhere else
   in it, `criterion 20` or `criteria 11, 13` in a note, is the same retired form, and is
   reported with the ID that number names today, to be written where it is the criterion
   meant: found 2026-09-27, 81 such in Railyard's rows, 23 of them already naming another
   criterion than the one meant after specs were merged. A number not written as a
   criterion's is not read as one: a count, a tier such as `[1]`, a date, or a number
   following another spec's name, which [pY5] reads. Every reader of a row reads it by one
   grammar, which the package exports, so a reader outside it reads a row as the check does
   rather than keeping a copy that drifts (found 2026-09-27: Railyard's library, which reads
   rows too, had to carry a copy of the grammar, since the package did not export it). A row that opens with an ID naming no criterion of
   its own spec is reported, saying what the ID names instead. No criterion is marked
   Written or Passing in one row and "Not yet written" in another that names it with no
   qualifier. A Tests section that claims "Every criterion has a test" has rows.

4. [98I] **A Tests row's status is one of the method's words** ([rFT]). Its status begins
   with Passing, Written, Failing, Partial, Planned, Not yet written, Measured or Withdrawn,
   and anything after that word is a note. A status in other words is a finding, naming the
   words: a status only a person can read is one no check can hold to anything, and a
   criterion marked "Not met" or "Not started" is as far from a test as one with no row.

5. [v0F] **A citation of another repository resolves where it says it does** ([Bvq]). A
   `[name@commit:ID]` whose name the repository has not declared, whose commit is not in
   the repository it names, or whose ID names nothing at that commit, is a finding: the
   citation says something that is not so. One whose repository cannot be reached, and
   whose commit no earlier fetch holds, is a notice naming what could not be checked and
   why: whether a repository can be reached depends on who is reading, a private one among
   them, and not on the repository being checked. So is one whose cited text has changed
   in that repository since the commit: someone should read what changed and move the
   citation forward, but the other repository moving on is not this one's defect.

6. [f4v] **One command runs every check the method holds a repository to.**
   The `check` command, run in a repository, reports every finding of the architecture checks
   ([iVr]) and of these, each naming its rule and its file, and exits non-zero when there is
   any. Where a check cannot run, that is a finding, never silence ([9p5]).
   Its closing line counts the notices it showed, and says how many of them are links a
   change has left to answer ([G0i]) and the command that answers them: a notice is not a
   finding, and never fails the check, but "No findings" is read as clean, and a count of
   notices with nothing to say what they are was read as nothing to do (found 2026-09-27,
   grading a repository worked with the skill: "No findings; 94 notices", 89 of them links
   to text that had changed since, none answered).

7. [9pu] **`ids-take` never offers an ID anything has ever mentioned** ([8g5]). An ID is
   taken when its three characters appear anywhere in a tracked file as it stands, edits not
   yet committed among them; in any version of any file reachable from any ref, a file since
   deleted among them; or in any commit's message. A citation outlives what it cites, in a
   commit message and in the history the trace reads ([LPv]), so an ID offered again would
   give every such citation a meaning its author never wrote. Where it cannot read the
   repository or its history, it offers nothing: it says why in one line and exits
   non-zero, since an ID drawn without the search is one nobody checked. **The rule is
   exported, not only run**, so whatever else mints an ID reads this rule's own answer
   instead of a second implementation of it: `mentionsIn` and `mentionsSince`
   (`railyard-method/ids/mint`) say what is taken, the latter incrementally for a process
   that mints more than once over its life, and `mintIds` draws free ones from what either
   says (found 2026-09-27: Railyard's daemon carried a second implementation of this same
   rule, unable to import the first, since the package's `exports` served only `./ids`, for
   reading what an ID names). The exported rule reads a bare repository too, where history
   and commit messages are the whole of what is taken, since there is no tracked tree to
   read, and its answer says whether a tracked tree was read (found 2026-09-27: a daemon's
   clones are bare by design, and the first export refused them). It reads without holding
   up the process that asked, so a long-running consumer goes on answering while it reads
   (found 2026-09-27: the first export read synchronously, and its first read over
   Railyard's history stalled a daemon for seconds). `mintIds` also refuses every ID a
   consumer's own rule says is taken, asked of each candidate and answered at once or later,
   so an ID a consumer holds outside git is never offered either (found 2026-09-27:
   Railyard's daemon must also refuse the IDs its open change records use).

8. [R6P] **A repository whose Tests rows name criteria by number is carried to IDs by a
   command** ([Xtd]). Pointed at a repository, it rewrites the numbers and ranges each Tests
   row opens with, before, between and after the parenthesised notes among them, to the IDs
   of the criteria those numbers name in that spec as it stands, keeps the rest of the row
   as it was written, and changes nothing else. The IDs go first, together, so the row is
   read as naming every one; where a note described one criterion of several, it says which
   by its ID: `7 (composition), 19` becomes `[Aa1], [Bb2] ([Aa1]: composition)`. It never
   carries part of a row: a criterion left behind as a number reads as untested (found
   2026-09-27, when five rows in Railyard were carried as their first criterion alone, one
   of them Passing). A row it cannot carry whole, because a number names no criterion, a
   criterion carries no ID, two criteria share a number, or a number outside a note follows
   its list and may be another criterion, it leaves as it was and names, with why, and it
   exits non-zero, so the rows a person must decide are the ones they are shown. A
   criterion a row cites by number in its text, `criterion 20` or `criteria 11, 13`, it
   carries to the ID that number names in its own spec, and lists each one carried, since a
   number in a note may have named another criterion before the list moved; one it cannot
   carry, a number no criterion has or one carrying no ID, it names and exits non-zero; one
   following another spec's name it names and leaves, as [pY5]'s. It says how many links
   name a spec it rewrote, and the command that lists them: each was made against the whole
   spec's text, which it has just changed, so each now reads as changed until someone
   confirms it (found 2026-09-27: Railyard's migration left 159 to confirm, unannounced).
   Run again, it changes nothing.
   Asked for a dry run, it says what it would change and writes nothing. It is a command of
   the skill's tool, `tests-by-id`, run in the repository as every other command is, so a
   repository that installed the skill has it (found 2026-09-27: Railyard, upgrading, could
   run it only from a clone of this repository, since neither the package nor the bundled
   tool carried it).

9. [RVv] **A repository whose decisions carry no IDs is carried to numbered decisions by a
   command** ([8g5]). Pointed at a repository, it rewrites each decision under a `## Decisions`
   heading, in a spec or a waymark, that is written as a bullet or a paragraph opening in bold,
   or numbered without an ID, as `N. [ID] …` with an ID taken by [9pu]'s rule, and keeps an ID a
   decision already carries. What follows a decision up to the next one, its further
   paragraphs, a table or a view among them, is indented inside it, so a view is still read as
   a view. The decisions of a section it rewrites are numbered from 1 in the order they stand,
   and nothing outside the Decisions sections changes. Where it cannot be sure what a decision
   is, it changes nothing in that section, names it, with why, and exits non-zero: a list that
   follows a bold or numbered decision at the margin may be that decision's detail or decisions
   of its own, a paragraph ending in a colon once decisions have begun may introduce the ones
   after it rather than belong to the one before, and a fenced block left open hides where the
   section ends. A person answers each by indenting the list under
   its decision, or numbering what are decisions of their own. It says how many links name an
   artifact it rewrote, as the carrying of Tests rows does ([R6P]). Run again, it changes
   nothing. Asked for a dry run, it says what it would change and writes nothing, and takes no
   ID. It is a command of the skill's tool, `decisions-by-id`, and an upgrade to 1.0.0 carries
   the decisions as it carries the Tests rows: checked before anything is moved, and refused
   whole where a section cannot be carried.

## Non-functional requirements

- `ids-take` answers within 5 s, wall clock from invocation to the IDs written, for a count
  of up to 10, on a repository of Railyard's size: 1,827 commits and 9,858 distinct file
  versions totalling 447 MB, with the page cache warm, on the owner's machine. It is run by
  hand, between thoughts; much longer and it is skipped, and an ID is made up instead.

- While `mentionsIn` or `mentionsSince` reads, the calling process's event loop is never
  held for more than 100 ms at a time, measured as the longest gap between the ticks of a
  5 ms timer running for the whole read, over a generated repository of at least 48 MB of
  distinct file versions. A consumer serving requests stalls for no longer than that, however
  long the read.
- Each answer `mentionsIn` starts, extended by `mentionsSince` however often, holds at most
  4 MiB, however large the repository: a consumer keeps one per repository it serves.
  Measured as the growth in the process's ArrayBuffer memory from holding eight answers at
  once.

## Decisions

1. [FUG] **What each status word means ([98I]).** Conventional: many vocabularies would do, and the
   value is that every repository, and every check, reads the same one. Passing: a test exists
   and passes. Failing: a test exists and does not pass, including a target it does not yet
   reach. Written: a test exists and holds the criterion, whether or not it was run just now.
   Partial: a test holds part of the criterion, and the note says which part. Planned: the
   criterion is not being built yet, so nothing tests it. Not yet written: it is being built
   and nothing tests it, which is a wish ([rFT]). Measured: a non-functional requirement with a
   measurement recorded but no test holding it. Withdrawn: the criterion no longer holds and
   the row says when. These are the words Railyard and this repository already wrote; the
   ones a new repository invented without them, such as "Not met", "Not started" and "Not
   tested", each mean one of these.

2. [hyL] **Where a citation is read.** Code in its comment text only, by the same rule traceability
   uses ([ei5]), so what counts as a comment is decided in one place. Markdown with its fenced
   blocks and code spans removed, because a document quoting an example ID (`[Ay4]`) is
   describing the scheme, not citing. An architecture model in the text of its names and
   descriptions, where a model's prose lives. Documents the repository says record a moment are
   left out entirely: rewriting a dated entry to a current ID would falsify it.

3. [J11] **A cross-repository citation is checked by [v0F], and by no other rule here.** `[ID]` means
   this repository ([BNb]); `[name@commit:ID]` is resolved against the named repository, as
   the traceability spec's Decisions describe.

4. [JjY] **Decision records are called waymarks.** A waymark is a mark left on a route (a blaze on a
   tree, a cairn, a painted stripe) so whoever comes next does not have to rediscover the
   ground. It is not a waypoint: a waypoint is somewhere you are going, and a waymark is left
   on the route, saying "this way is safe, that way drops". Each holds one of three things
   ([ONJ]): *forced*, an observation with a date and a version, which expires when that
   software changes; *conventional*, one choice among equals that everything downstream relies
   on; *hard-won*, a hazard, what it cost, and the evidence. Only the middle one is a decision,
   which is why "architecture decision record" was the wrong name: most are not architectural,
   since the model owns architecture; two of the three are not decisions; and the canonical ADR
   is an immutable entry in an append-only log, where a waymark is corrected where it stands
   ([SYK]). A hazard that cannot be edited is worse than none: the terrain changes, the sign
   stays, and the next traveller either walks into a drop the sign no longer marks or learns to
   distrust the signs.

5. [f7m] **An ID, rather than a name or a number, because both of those move** ([vKz]). Measured in
   Railyard on 2026-09-16: renaming one spec rewrote 65 references across 21 files by hand, and
   2,698 citations by criterion number sat across 391 files with nothing checking that a cited
   criterion existed. The ordinal stays on the page, because a spec is read in order and the
   sequence carries meaning; the ID is what anything that must survive an edit cites.

6. [boV] **Uniqueness is kept by checking, not by a register.** To take an ID, generate one, search
   the repository and its history for those three bare characters, and re-roll if they appear
   at all ([9pu]). A false positive costs one re-roll, so this needs no parser, allocator or
   register, and retirement falls out for free: an ID is available when nothing mentions it now
   and nothing ever did, so one that is retired stays retired. It works only while free IDs are
   plentiful. There are 62³ = 238,328; measured over Railyard's 22.73 MB on 2026-09-16,
   including 12 MB of symbols, 76% were free, so an ID costs about 1.3 draws. Measured over
   Railyard's whole history on 2026-09-27 (1,827 commits, 9,858 distinct file versions, 447 MB,
   and every commit message), 59,600 runs of three were taken, so 75% are still free: reading
   history costs almost nothing in draws.

7. [4DL] **History is read as every distinct file version once, not as diffs.** Hard-won: the obvious
   command is the slow one. Measured on Railyard 2026-09-27, git 2.43.0 on the owner's machine
   (an Intel i7-10750H): `git log --all -p` wrote 128 MB of diff in 11 s, too slow to run by
   hand, while listing every object any ref reaches and reading each distinct file version once
   took git 0.7 s. The whole of `ids-take 10` then took 3.7 to 4.2 s over three runs, most of it
   reading 447 MB for runs of three, which is what the non-functional requirement on `ids-take` is
   measured against.

8. [hxn] **A process that mints more than once reads history incrementally, by ref tips, once this
   was exported** ([9pu]). Hard-won: the read above is fast enough to run once by hand,
   but not fast enough to pay again on every mint in a process that lives longer than one
   command — reusing Railyard's own approach, since it is a second implementation of the same
   rule and had already paid for the mistake: `packages/daemon/supervisor/changes/item-ids.ts`
   (observed at railyard-method 06e635a, 2026-09-27) reads a repository's history once and after
   that only from a ref tip that has moved since. `mentionsSince` takes what a previous read
   found, which carries the ref tips it was read at, and reads only what changed: `git rev-list
   --objects --ignore-missing --stdin`, fed the tips that moved as revisions and the previous
   tips as `^`-prefixed exclusions, and `git log --format=%B --ignore-missing --stdin` over the
   same revisions for commit messages. `--ignore-missing` on both, because a tip read before and
   since gone from the answer being extended (a branch deleted, its objects pruned) is skipped
   rather than refused: excluding less only reads more, never less. Tracked, uncommitted files
   carry no ref tip to compare against, so they are re-read in full on every call regardless;
   what either read adds is never taken back, so an incremental answer is always at least as
   taken as a full one, matching this rule's over-eager, retirement-for-free design above.

9. [rC0] **The repository is found by its git directory, and its work tree only when it has one**
   ([9pu]). Forced: `git rev-parse --show-toplevel` fails in a bare repository with "fatal:
   this operation must be run in a work tree" (observed 2026-09-27, git 2.43.0), and a bare
   clone is what a long-running consumer keeps. `git rev-parse --absolute-git-dir
   --is-bare-repository --is-inside-work-tree` answers in both, and every history and message
   read runs against the git directory; the tracked files are read from the top level only
   when inside a work tree. A directory that is neither, such as a work tree's own `.git`,
   is refused as unreadable rather than read without its tracked tree.

10. [I33] **The exported read streams git's output, and nothing in it blocks** ([9pu]). Hard-won: a
   full read is seconds of git output, and the obvious synchronous spawn holds a long-running
   consumer's event loop for all of it, while buffering a whole `cat-file` answer in memory
   only moves the stall to the parse. Each git command is spawned asynchronously and its output
   read as it arrives, a file version's runs of three scanned chunk by chunk, so no single step
   holds the loop for longer than one pipe read's worth of scanning. `ids-take` runs the same
   read and awaits it: one implementation, not a synchronous twin. A tracked file is streamed
   too, never read whole: one 48 MB tracked file, read whole and scanned at once, held the loop
   for 391 ms. Measured on Railyard at cffc5ff7 on 2026-09-27 (git 2.43.0, Node 24.17.0, the
   owner's i7-10750H, page cache warm, three runs each): a first read took 2.85 to 2.96 s in
   its work tree (1,840 commits, 963 tracked files, 110 refs) and 2.62 to 2.76 s in a bare
   clone of it (1,712 commits, 73 refs), holding the event loop at most 25 and 33 ms at once;
   a later read with no tip moved took 285 to 393 ms in the work tree, which re-reads its
   tracked files, and 12 to 14 ms in the bare clone. The synchronous read it replaced took
   3.92 to 4.00 s for the first read and about 0.2 s for a later one, all of it holding the
   loop. What was seen is one bit per
   possible run of three bytes, 2 MiB, not one byte per run, which was 16 MiB for every
   repository a consumer holds an answer for.

11. [OcL] **Brackets, because Markdown already ignores them.** `[Ay4]` is Markdown's reference-link
   syntax and renders literally unless something defines it, and it tells a citation apart
   from the same three characters in a hash or a word. So the two checks are deliberately
   asymmetric: taking an ID is naive and over-eager, and a reference is matched only in its
   bracketed form ([BNb]), because a false link is expensive. Questioned on 2026-09-23, as not
   distinctive enough in software generally, and kept: links are moving out of code comments
   into the artifacts and the symbols, where a link is a field and needs no delimiter.

## Tests

| Criterion | Test | Status |
|---|---|---|
| [8g5] (every artifact and numbered item carries a well-formed, unique ID, a decision in a spec's own Decisions among them, which a citation resolves and `ids-resolve` names as that spec's decision; a decision under Decisions written as a bullet or a bold paragraph rather than a numbered item reported, in a spec and in a waymark, and introducing prose and what a numbered decision holds not) | `method/artifacts.test.ts` [1]; `ids/resolve.test.ts` [1] | Written |
| [pY5] (a citation of something with an ID is the ID, a spec's name in backticks or not, with or without the word spec; a spec naming itself reported once; a dead old form and a quoted one are not reported) | `method/artifacts.test.ts` [1] | Written |
| [pY5], what a tool prints (an artifact named by its ID, its kind and its file, by `ids-resolve` and by `trace`, and no retired form in `trace`'s usage) | `ids/resolve.test.ts` [1]; `ids/elsewhere.test.ts` [2]; `traceability/identifiers.test.ts` [2] | Written |
| [Xtd] (every criterion named by a Tests row, by its ID; a row by number reported with the IDs to write, a number after a note among them, and the command that carries every such row; a criterion cited by number anywhere in a row reported with the ID it names today, and a count, a tier, a date or another spec's criterion not; the grammar imported by the package's name; a row naming an ID that is no criterion of its spec reported; reordering the criteria moves no row; no criterion both done and not yet written; a claim with no rows) | `method/artifacts.test.ts` [1]; `release.test.ts` [2], as a consumer imports it | Written |
| [98I] (a status that is not one of the method's words is a finding naming them; a note after the word is read as a note) | `method/artifacts.test.ts` [1] | Written |
| [v0F] (a citation of another repository: undeclared, unknown commit or gone ID a finding; unreachable, with nothing cached to answer, a notice naming why; changed since a notice; a fetch never stops to ask) | `ids/elsewhere.test.ts` [2], against two fixture repositories with real git; `method/artifacts.test.ts` [2] | Written |
| [f4v] (one command, every finding, non-zero on any, notices shown and not failing; the closing line counting the links a change left to answer, with the command that answers them) | `method/artifacts.test.ts` [1]; `method/links.test.ts` [1], the closing line over a repository with links left stale; `release.test.ts` [2], through the installed command | Written |
| [9pu] (an ID in a tracked file, in a deleted file's history, or only in a commit message is never offered; outside a repository, one line and a non-zero exit; exported as `mentionsIn`/`mentionsSince`/`mintIds`, the incremental read excluding the previous tips and missing nothing new; a bare clone's history and messages read, and its answer saying no tracked tree was; the read returning a promise; `mintIds` refusing what a consumer's own rule, synchronous or not, says is taken) | `ids/cli.test.ts` [2], against scratch repositories with real git; `ids/mint.test.ts` [2], against scratch repositories with real git; `release.test.ts` [2], as a consumer imports it | Written |
| [R6P] (numbers and ranges carried to IDs, the note kept, numbers after a note carried with the rest and the note said of its criterion, a row with a number it cannot be sure of left whole, a criterion cited by number in a row's text carried to its ID and listed, one it cannot carry named, another spec's left, the links to a spec it rewrote counted and the command listing them named, a row it cannot carry left and named with a non-zero exit, nothing else changed, a second run changing nothing, a dry run writing nothing; the command the skill's tool carries) | `method/tests-by-id.test.ts` [1]; `skills/tools.test.ts` [2], from a copy of the skill's folder | Written |
| [RVv] (a bullet, a bold paragraph and a numbered decision without an ID carried to `N. [ID]` with fresh IDs, an ID already carried kept; what follows a decision indented inside it, a view among it still read; a section's decisions numbered from 1; nothing outside Decisions changed; a list after a bold or numbered decision, a paragraph ending in a colon and an unclosed fence refused, that section left and named with a non-zero exit; the links to a rewritten artifact counted; a second run changing nothing; a dry run writing nothing; the command the skill's tool carries; the upgrade to 1.0.0 carrying them, and refusing whole) | `method/decisions-by-id.test.ts` [1]; `method/upgrade.test.ts` [1]; `skills/tools.test.ts` [2], from a copy of the skill's folder | Written |
| NFR (the exported read never holds the event loop for more than 100 ms) | `ids/mint.test.ts` [2], over a generated repository and over one large tracked file | Written |
| NFR (an answer holds at most 4 MiB) | `ids/mint.test.ts` [2], with membership over the whole ID space unchanged | Written |
| NFR (`ids-take` within 5 s on a repository of Railyard's size) | By hand, `ids-take 10` in Railyard: 3.7 to 4.2 s over three runs, 2026-09-27; 3.26 to 3.50 s over three once the read streamed, at Railyard cffc5ff7, the same day | Measured |
