# The skill

**Type:** Capability spec · **Status:** Draft · **Source:** the owner, 2026-09-20 to 2026-09-23; the first repositories worked with the skill alone, 2026-09-24 to 2026-09-27, Houndkeeper among them; [I8O], [Bsh], [epm] · **ID:** [C6F]

## Purpose

The skill is the method written for an agent to read: `skills/spec-driven-change/SKILL.md`.
It is how an agent working in a repository knows how work is done there, and it is the
on-ramp for a person: install it, work that way, and the repository can be read by any tool
that follows the method, with nothing set up.

It is prose, so it grants nothing, enforces nothing, and has no compiler. What this spec
holds it to is the part of prose that can be held: what it covers, what it must never
carry, and evaluations that measure whether it changes what an agent does.

## Acceptance criteria

1. [J8n] **The method ships one skill, and it carries the method.** An agent working with it
   arrives knowing how work is done: artifacts before code, the requirement found before
   the artifact is written, a criterion cited by its stable ID, every criterion carrying a
   test, and a divergence between an artifact and the code reported rather than quietly
   resolved. It grants nothing and enforces nothing; it is the difference between an agent
   that guesses at the method and one that knows it.

2. [YV9] **The skill is the method, never one project's rules.** What travels is what holds
   in any repository. A project's own instructions (its gate, its batch discipline, its own
   spec corpus) stay in that project, and a person's standing coding opinions stay wherever
   that person keeps them. Content that lands in the wrong file is read by people it was not
   written for and ignored by the ones it was.

3. [IKA] **It is installed with the environment, not by the agent.** Anything installed by
   hand is eventually not installed, and an agent working without the method does not
   announce itself: it produces work that looks like work. It is versioned with the method,
   and an agent can say which version it has, so a change to the method is visible in what
   the agent did after it rather than inferred from the result.

4. [MJE] **What must hold is never in the skill.** Prose is advisory at any tier ([I8O]): an
   agent may misread it, skip it, or run out of context before reaching it. A rule that must
   hold goes in a hook, a permission, a check or a test ([Bsh]), and the skill carries what
   informs judgement instead. The test for a candidate rule is what happens when an agent
   ignores it: where the answer is "the work is wrong and nothing catches it", it does not
   belong in a skill.

5. [ZNz] **A repository worked in with the skill alone is readable by any tool that follows
   the method, with nothing set up.** Someone installs the skill, works that way for months
   on a repository no tool has seen, and then points a tool at it, Railyard among them: its
   specs, waymarks, principles and architecture are found, and its code traces back to the
   criteria that caused it. Nothing is imported, converted or registered ([epm]).

   This is what makes the conventional paths load-bearing rather than tidy, and **the skill
   names every one of them**: a skill that left the layout to the agent would have each
   repository invent its own, and every one would need converting at the door. The same
   goes for stable IDs and the symbols directory: a criterion cited by an ID a tool can
   resolve, and a symbols directory checked in beside the source ([QBm]), are what let a
   tool say anything about a repository it did not watch being built.

6. [o7Y] **A repository says which version of the method it was built under, and a newer
   skill upgrades it.** The version is recorded in the repository and read again on the way
   in. Meeting an older one, the changes that version needs are made (a path that has
   moved, a form that has been retired) and the new version written once they are. Meeting
   one it does not know, it says so and changes nothing, because a version from the future
   is a layout whose rules it has not been told.

   This is [QBm]'s argument about the symbols format, applied to the repository: a reader
   that is not the writer cannot know from context what it is looking at. The difference is
   what each does about it. A symbols reader meeting an unknown version stops, because it is
   being asked to read; the skill meeting an *older* version does the work, because it is
   being asked to carry a repository forward. Only a newer one stops both.

   **The marker's own path is the one thing that can never move.** Everything else can be
   migrated because the version says how; the version itself has to be found before
   anything is known, so it is fixed permanently at `.railyard/method.json`. A repository
   with no marker is one the method has not worked in yet: it is written on the way out,
   not demanded on the way in. The upgrade command, run where there is none, writes it at
   its own version and says so.

   **An upgrade moves what the method owns, and reports what it does not.** It moves the
   artifacts whose conventional path changed, and checks every move can be made before it
   makes any, so a refused upgrade leaves the repository exactly as it was. It does not
   rewrite the repository's other files where they name an old path: those are the
   repository's, and a scripted rewrite across them is exactly the change nobody reviews.
   It lists each such file instead, leaving out what git ignores and the documents the
   repository says record a moment. The marker keeps every field the repository wrote in
   it; only the version changes.

   **0.2.0 is the first version to move anything**: every artifact
   now lives under `docs/`, so `architecture/` moves to `docs/architecture/`, and
   `docs/adr/` moves to `docs/waymarks/`, named for what it holds.

   **1.0.0 carries Tests rows and decisions to IDs** ([Xtd], [8g5]). A convention that
   changes is a version, or the marker cannot tell a repository whose Tests rows name
   criteria by ID, and whose decisions are numbered, from one whose rows name them by number
   and whose decisions are bullets, and the upgrade says there is nothing to do. Upgrading
   from an earlier version carries every row as the migration does ([R6P]), and every
   decision as its migration does ([RVv]), and both are checked before anything is moved:
   where a row or a section of decisions cannot be carried, the upgrade is refused, naming
   each and why, and nothing is changed. What it carried, and the links it left to confirm,
   it says as the migrations do.

   **The version a skill works to is never older than the newest upgrade it carries.** A
   marker records the version that laid a repository out, so a skill whose own version is
   behind an upgrade it carries writes that older version into every repository it starts,
   and reads every repository still at it as current: the upgrade never runs.

7. [xCF] **The skill ships with evaluations, and they are how it is tested.** Until prose is
   run against an agent, "this is clearer" and "this changes what the agent does" are
   indistinguishable. Each case states a task the method should change the handling of,
   and graders saying what a good answer looks like. Every `## ` section of the skill is
   covered by a case. The cases are part of the skill, versioned with it, and run before it
   changes. A rule about the order of what an agent does across a session is held by a case
   that gives it a repository and the tools to change it over several steps, graded on the
   order of its writes rather than on its account of them: asked what it would do, an agent
   names the right order even where, working, it does not. One command runs every case as
   its own files say it must be run, so a case that needs a repository or tools gets them
   without a person remembering to ask, and no other case is given what it does not list.

8. [fcg] **Every section of the skill is measured by its ablation delta, and every
   measurement is recorded.** A run scores the same cases once with the skill and once
   without it, and the difference is what the skill is worth on that case; each run's scores
   are kept in the repository (the Decisions). This is [I8O] made measurable. It is
   measured, not enforced: nothing fails a change, or removes a rule, for a nil delta, and
   what a nil delta means depends on the arm without the skill.
   - **A nil delta against a perfect baseline measures nothing.** Where the arm without the
     skill already scores full marks, the agent already does what the rule asks, and there
     is no room for the skill to show in: the case is too easy, and the rule under it has
     not been tested at all. It is not evidence that the rule is useless, nor that it works.
   - **A nil delta against a baseline that falls short is evidence.** The rule is not
     informing the agent's judgement, whatever it reads like. On a rule that must hold,
     that is [MJE]'s case, and a signal to move the rule, not to argue; the eval is what
     finds it instead of an incident later.

9. [6HK] **A case is scored over repeated runs, and the threshold is stated.** An agent is
   not deterministic, so one passing run says almost nothing; a case runs several times and
   is scored across them, and the bar a suite must clear is written down. Falling below it
   stops the change, as a failing test does.
   - **A suite states what size of effect it can see, and does not report one smaller.** A
     case over three runs lands on nought, a third, two thirds or one: its resolution is a
     third, and a delta below that is arithmetic, not evidence. Run enough that the
     resolution is finer than the effect being looked for, or say it is not measurable here.
   - **A grader that gives opposite verdicts to answers with the same substance is the
     instrument failing, not the agent varying,** and no number of runs repairs it. Fix the
     grader before reading anything else the suite reports.

10. [jT0] **The skill carries how architecture is documented for people** ([6aC], [7m8],
    [CC6]). Before drawing a diagram an agent asks who it is for and what it must accomplish
    (teaching, documenting a boundary for whoever changes it, or analysing a property) and
    draws the view that answers that, with only the elements it needs. It places the view in
    the artifact it clarifies, and draws it from the model's elements by their IDs, never
    inventing a component the model lacks. Its vocabulary is the SEI's *Documenting Software
    Architectures: Views and Beyond*: module views for how the code is divided,
    component-and-connector views for what runs and how it talks, allocation views for where
    it is deployed and who builds it. And it keeps the system comprehensible without being
    asked: a model of more than one component comes with an overview in the system spec, and
    a change to the model changes the views that should show it ([CLM]).

11. [18E] **Installing the skill is all it takes.** The skill's folder carries the tools it tells an agent to run (to take
    and resolve identifiers, to trace, to check, to upgrade, and to carry Tests rows and
    decisions to IDs) as files it runs with the
    Node and the git that are already there, so a person who installs the skill has nothing
    else to install, bar one thing: `check` validates an architecture model with the CALM CLI
    ([L7b]), and the skill and the README both say so, and how to install it, rather than
    promise Node alone. The package stays, for a repository that consumes the method as
    code, as Railyard does.

12. [obW] **A repository the method has not worked in is started from the skill alone.** An
    agent asked to bring the method to a repository with no artifacts has nothing to copy:
    no other repository is on the machine of someone who installed the skill. From the skill
    alone it writes the marker, and specs in the shape the tools read: an ID on the spec's
    own line, each criterion as `N. [ID]`, and a Tests table whose statuses are the method's
    words ([98I]). A set of specs arrives with the rest of what describes the system:
    - **the architecture model**, whenever the repository has more than one component, since
      a spec that describes a boundary or an interface is describing the model. It too is in
      the shape the tools read: its own ID in its metadata, and each component owning its
      code through a `source-path`, one path or a list ([C4P], [L7b]). The skill shows one,
      and a test holds the example to the checks;
    - **a waymark for each forced fact** the specs rest on, with its date and version, and
      not a measurement kept in a Tests row, where it goes stale unseen.
    - **what the system is for**, once, in the system spec's Purpose, and **the principles**
      in the shape the tools read: an ID for the file and one for each numbered principle.

13. [HPg] **The skill carries traceability as it is practised** ([CS8], [G0i]). Before
    changing a file, an agent asks what its code implements. As it writes a function, it
    links it to the criteria or decisions it implements, and a test to the criterion it
    tests, naming the test by its title and quoting it for the shell. When the scan reports a link
    suspect, missing or absent, it answers in the same turn. A file edited with no scan
    running is left untracked, and `check` says so rather than showing it as traced.

14. [4Ec] **Told to, the skill installs itself in the project, once, and the scan is on in
    every session after.** One command, run from wherever the skill is:
    - copies the skill into the project's `.claude/skills/`, where it is committed with
      the repository, unless it is already running from there. A copy already there is
      replaced whole wherever any file of it differs, so a file the skill no longer carries
      is gone from the copy too, and a symbolic link there is replaced by a copy, since a
      link to a folder outside the repository is not committed with it ([oHv]);
    - says, when it copies the skill in, that `.claude/skills/` holds generated files a
      linter should skip, and the bundled tool it copies carries a header that turns a
      linter's rules off for itself;
    - records the method in the repository, as the upgrade does where nothing is recorded;
    - adds the scan to the project's Claude Code settings, on every write, a shell
      command's as well as a file tool's, with the permissions the skill and its tool
      need, keeping everything else those settings hold; a project installed before the
      shell was scanned gains that scan when `install` runs again;
    - and says what it changed, and whether the session running it will run the scan. Run
      again, it changes nothing and says so. Settings it
      cannot read are refused, naming the file, and nothing is changed, because settings
      written over are a person's configuration lost.

    The scan is the project's, not the session's: every session in the project runs it,
    whether or not the skill is invoked, and so does anyone who clones the repository. A
    project that has not installed it is one the skill tells its agent to install it in.
    The README installs it the same way, by running `install`, and never by copying the
    folder by hand: a copy installs no scan.

15. [BCc] **What the owner says in conversation lands in the artifacts, in the same turn.**
    A requirement the owner states becomes a criterion, with its Tests row; a choice among
    alternatives becomes a waymark, with the evidence it rests on cited; a rule becomes a
    principle; a change of structure changes the model. Nothing the owner decided stays
    only in the conversation, and the agent says which files changed.

16. [knA] **A measurement is evidence, and has one home.** What an agent measured (a
    success rate, a parking error, a latency) goes in the waymark or the decision it is
    evidence for, dated and with how it was measured. Where it supports no decision yet, it
    goes in a findings document the repository names in `.railyard/method.json`'s `dated`
    list. It never goes in a criterion's text, a non-functional requirement's text or a Tests
    row's status: those say what must hold, and a number kept there reads as the requirement
    and goes stale unseen. The skill says what `dated` is: the list of documents that record
    what was true on a date, which the checks and the upgrade leave as they were written.

17. [3BW] **The skill shows a waymark's shape, and a waymark is corrected where it stands**
    ([SYK]). A waymark carries a title, its ID, a date and a source on its metadata line, a
    Context, and numbered Decisions each with its own ID, so any one decision can be cited.
    When a decision stops holding, the agent rewrites or deletes it in the waymark that holds
    it and updates what cites it. It never marks a waymark Superseded, and never writes a new
    one that supersedes an old one: a chain makes every reader walk it to learn what holds
    now, and git already keeps what changed.

18. [7L6] **Artifacts come before code for the whole of a session, not only its first
    request.** Many steps into an exploratory session (try something, measure it, keep it if
    it works), each new behaviour still has its artifact changed before the code that
    implements it, a test counting as code, and a design kept is recorded as a decision
    when it is kept. Before it says the work is done, the agent reads the skill's done list
    again and holds everything the session changed to it, not only the last request.

19. [xTV] **A criterion states only the requirement.** Its text is what must be true,
    observable from outside: no mechanism (a library, a parameter, a layer, a file), no
    account of who asked for it or when, and no narrative of how it came about. A mechanism
    that must be pinned is a decision; who decided and why is the decision's source, or
    git's. A criterion carrying them is read as requiring the mechanism, and its history
    outlives the reason it was written.

## Decisions

1. [TA4] **Evaluations are `claude plugin eval` cases, laid out as that command expects.** Forced:
   observed in Claude Code 2.1.278 on 2026-09-20 and 2.1.280 on 2026-09-23. It is a fact about
   someone else's software and it expires.

   - Cases live under `evals/`, the directory the plugin manifest's `experimental.evals`
     names, one directory per case holding a `prompt.md` and a `graders/` directory.
     `prompt.md` carries `max_turns`, `allowed_tools` and optionally `runs` in its
     frontmatter, and the task in its body. A grader carries `type` and `weight`.
   - `--ablation with-without` is what [fcg] rests on: a no-plugin baseline arm and the score
     delta. Graders marked `with-only`, `tool_used: Skill` among them, say the skill fired at
     all, and are an indicator rather than part of the score.
   - `--threshold <0..1>` is [6HK]'s bar, and exits non-zero below it. **The bar is 0.8.** The
     number is a convention: it is written here so that moving it is a decision somebody
     makes, not a flag somebody edits.

2. [zSJ] **A case that works in a repository** ([xCF]'s multi-step case). Forced: observed in
   Claude Code 2.1.283 on 2026-09-27. Its repository is written by a `scaffold_script`, which
   only a `case.yaml` beside the `prompt.md` can name, which runs with the sandbox as its
   working directory and no path to the case, and which runs only under `--scaffold`; without
   it the case runs in an empty directory. The tools it writes with must be in its
   `allowed_tools` and granted with `--allow-tools`. A `regex` grader with `target: trace`
   reads every message of the run, one per line in order, each tool call with its input, so
   the order of writes can be read from it; `tool_order` compares the first call of one tool
   with the first of another, and cannot say "any write to a spec before any write to code".
   `{source: file, path}` reads a file as the run left it, including one that was there
   before it. The two flags are the command's, not a case's, so `npm run evals` reads them
   from the cases: `--scaffold` where a case names a `scaffold_script`, and `--allow-tools`
   with each gated tool (`Bash`, `Write`, `Edit`, `WebFetch`, `mcp__*`) a case's
   `allowed_tools` lists. A grant is a second key on a tool the case already lists, and
   `--scaffold` runs only the scripts cases name, so passing both for the whole suite gives
   no other case anything.

3. [2aw] **The plugin folder must hold no hard-linked file, ignored or not.** Hard-won: `claude plugin eval`
   scans the whole folder, not what git tracks, and refuses every case if any file has a
   second name (2026-09-23). Cargo's `target/` is full of them, so `npm run evals` clears
   `index/target/` first.

4. [APb] **An `llm` grader's judge does not count.** Hard-won: Haiku, the default, passed a diagram of all 28
   components grouped into subgraphs as "collapsed", with a rubric that named the count
   (2026-09-23). A property that can be counted is scored by a `regex` grader (`match:
   contains | not_contains | count:N`, over `target: last_message`), and the judge is left
   the part that needs judgement.

5. [ppd] **The default judge is not good enough to trust, and the suite runs with Sonnet.** Hard-won: Haiku
   also failed, two votes of three, an answer that met every point of its rubric, and passed
   weak baseline answers, hiding most of the skill's effect (2026-09-23). `npm run evals`
   passes `--judge-model sonnet`. A judge's wrong verdict looks exactly like an agent's wrong
   answer, so a case that flips is read before either is blamed.

6. [vOA] **Every `llm` grader declares its anchors, and a test holds them to the prompt.** Hard-won: A
   grader written for one version of a prompt keeps scoring for it after the prompt is
   rewritten, and nothing fails: it happened on 2026-09-20 and twice on 2026-09-23. Each
   grader opens with a line such as `<!-- anchors: force-push, shared branch -->`, and
   `skills/skill.test.ts` fails when an anchor is missing from the prompt or from the
   grader's own text. Replayed against the two drifted graders, it fails on both.

7. [6mi] **A case whose effect is small runs ten times, set on the case.** Hard-won: At three runs, a rule
   that misses one run in five fails the suite about half the time.

8. [QUi] **What the skill measurably does is in `evals/RESULTS.md`, not here.** A requirement says what
   has to hold; each run's scores are a record of what did. Measured 2026-09-23, judged by
   Sonnet over twelve cases, the mean delta was +0.31: reporting a divergence +1.00, upgrading
   first +1.00, scoping a diagram +0.90 at ten runs, drawing a diagram from the model +0.67,
   holding an artifact under pressure +0.33, and six cases at 0.00 because the baseline already
   does the right thing. An earlier finding that the skill showed no delta (2026-09-20) was
   largely the default judge passing weak baseline answers.

9. [ZRx] **A suite is repaired one case at a time, and each repair is proved before the next.**
   `--case <name>` runs one, and `--runs <n>` buys resolution on it. A grader repair is proved
   by agreement within one arm (answers of the same substance scoring the same), not by the
   delta, which measures the grader and the skill at once. The full suite confirms at the end;
   it does not diagnose at the start.

10. [0g8] **A run costs money and runs as whoever starts it.** Each case is a full Claude Code child
   on that person's credential. So the suite runs when the skill changes, not on every commit.

11. [jXA] **The repository shows that the evaluations run, not what the agents said** (the owner,
   2026-09-23). `evals/RESULTS.md` keeps every run's date, Claude Code version, cost, and each
   case's score with the skill and without it; `npm run evals:summary` folds a new run into it.
   The full reports, with the agents' transcripts and the paths of the machine that ran them,
   stay on that machine: `evals/results/` is ignored. The summary is a record of what happened,
   so it is dated ([epm]) and never rewritten by a check.

12. [DBb] **The tests run in CI on every push and pull request; the evaluations still run by hand**
   (the owner, 2026-09-23; landed 2026-09-27). `.github/workflows/ci.yml` runs `npm ci`, `tsc
   --noEmit`, `npm test` and `npm run check`, on Node 24. The evaluations are the half of the
   plan not yet landed: they cost real money on an API key, so a maintainer runs them by hand
   against a change that touches the skill or its cases, rather than on every push.

13. [3K9] **The version stays below 1.0 until the public release, which is 1.0.0, and the history is
   squashed before it** (the owner, 2026-09-23). Squashing gives every commit a new hash, so a
   repository that pins the method by commit, or cites it as `[method@commit:ID]`, has to move
   both to the new history in the same change, or every such citation becomes unresolvable at
   once. Railyard is one.

14. [Ktu] **The scan is installed in the project's settings, not in the skill's frontmatter** ([4Ec]).
   Hard-won, observed 2026-09-24 on Claude Code 2.1.281: a hook in a skill's frontmatter is
   registered only when the skill is invoked, and runs from then to the end of the session, so
   every edit made before an agent invokes it goes unscanned, and a skill that declares a hook
   asks permission to be invoked, which a `-p` run refuses with only "Execute skill: <name>".
   A hook in `.claude/settings.json` is loaded by every session in a trusted folder, and
   Claude Code reloads the settings when they change, so the scan `install` adds runs from the
   next write in the session that ran it (observed 2026-09-25, 2.1.281: "Settings changed from
   projectSettings, updating app state"). But a session reads the settings of the folder it was
   started in, and no other: a session started in a person's home folder and working in a
   repository below it never runs that repository's scan. The first repository installed this
   way was worked in so, and its agent, told the scan started next session, scanned by hand and
   fell behind. So `install` finds where the running session was started, from its process's
   working directory where the system shows it, and says plainly when that is not the project.
   The skill declares no hook of its own: with both, every write would be scanned twice. The
   settings run the same command after a write by `Write`, `Edit` or `MultiEdit` and after a
   `Bash` command, each under its own matcher: a hook is given the tool's input, which names
   the file for a file tool and only the command line for the shell (Claude Code's documented
   hook input, as of 2026-09-27; the shell's is not yet held end to end, as the file tools' was
   on 2.1.281), so the scan reads which it was from the input. Two more facts shape the
   command the settings run:
   - `${CLAUDE_SKILL_DIR}` does not expand in a hook's command, and `${CLAUDE_PROJECT_DIR}`
     does, so the hook runs the tool from the project's copy of the skill;
   - a `-p` run in a folder nobody has trusted ignores the project's settings, permissions and
     hooks alike, and says so on its first line; a headless run passes `--allowedTools`, or
     runs where the folder is trusted.

   The hook never refuses an edit and always exits cleanly: a scan that fails costs visibility,
   never the agent's ability to work ([G0i]).

   Held end to end on 2026-09-24, in a toy repository with the skill installed as a person would
   install it, by Claude Code 2.1.281 asked only to implement a spec: the skill registered its
   hook, the agent linked every function and test it wrote to what it implements, and a second
   session asked to change behaviour changed the spec first, re-linked what it changed, and left
   every link current.

15. [caA] **How the skill carries its tools** ([18E]). Conventional, with one hazard paid for. For
   whoever changes the tools: this repository's own tooling builds the commands into one file in
   the skill's folder, which is all an agent runs.

   ```mermaid
   %% view-of: docs/architecture/method.json
   flowchart LR
     repository-tooling --> commands
     agent --> commands
   ```

   - The tools are one file, `skills/spec-driven-change/tools/railyard.mjs`, run as
     `node <the skill's folder>/tools/railyard.mjs <command>`, with the commands `check`,
     `trace`, `ids-take`, `ids-resolve` and `upgrade`. It is bundled with esbuild, its one
     dependency inside it, for Node 24. One file, because each command bundled on its own
     would carry its own copy of that dependency.
   - It is committed, because a skill is installed by copying its folder, and a test rebuilds
     it and fails when the committed file differs from what its source builds.
   - **No module runs itself when it is imported.** A command decides it is "the program" by
     comparing its own URL with the script it was started as, and in a bundle every module
     shares one URL, so bundling one command would start every other one it imports. Each
     command exports `main`, and a file under `bin/` calls it.

16. [oHv] **What `install` is shaped by** ([4Ec]). Hard-won, each paid for once, in the
   first repositories worked with the skill alone:
   - **A copy that differs in any file is replaced whole, and a link by a copy.** Copying only
     when the skill's text or its tool changed missed a change to its notices alone; copying
     over what was there left files the skill had dropped; and over a symbolic link it did
     nothing, leaving a link to a folder outside the repository that is never committed
     (2026-09-27).
   - **The bundle turns a linter off for itself.** `eslint .` at a project's root read the
     726 KB bundle it had copied in (2026-09-27, Railyard).
   - **The shell is scanned as well as the file tools.** An agent graded on 2026-09-27 wrote
     through the shell ten times as often as through the file tools, none of it scanned.
   - **The README installs by running `install`.** It once said to copy the folder, which
     installs no scan (2026-09-26).

## Tests

| Criterion | Test | Status |
|---|---|---|
| [J8n], [YV9], [MJE] (one skill carrying the method; the method and no project's rules; nothing that must hold) | the evaluations in `evals/` [eval], each case covering the section it names | Written, as far as an evaluation reaches: it measures what the skill changes, and cannot prove a rule is absent |
| [IKA] (installed with the environment; versioned with the method) | `release.test.ts` [2], installing the packed package and running its commands | Partial. The package installs and its commands run; which version an agent has is not yet something it can be asked |
| [ZNz], the skill names the paths (every conventional path is named in the skill) | `skills/skill.test.ts` [1] | Written. There is one list, `CONVENTIONAL_PATHS` |
| [ZNz], read whole (a repository built with the skill alone is read by a tool with nothing set up) | — | Planned. It needs a repository no tool has seen, which the release is where to get |
| [o7Y] (the version read, recorded and acted on; newer and unreadable refused with nothing changed) | `method/version.test.ts` [1] | Written |
| [o7Y], the marker written where there is none (the upgrade command writes it at its own version, and says so) | `method/upgrade.test.ts` [1]; `skills/tools.test.ts` [2] | Written |
| [o7Y], the upgrades themselves (every move checked first, a refusal changing nothing; to 1.0.0, the Tests rows carried to IDs and the decisions numbered with IDs, and a row or a section of decisions that cannot be carried refusing the upgrade, naming it, with nothing changed; the repository's own files naming an old path listed, never rewritten, dated and ignored files left out; the marker's other fields kept) | `method/upgrade.test.ts` [1]; `release.test.ts` [2], through the installed command | Written |
| [o7Y], the version a skill works to (never older than the newest upgrade it carries) | `method/upgrade.test.ts` [1] | Written |
| [xCF] (every section covered by a case, and every case covering a section that exists; every grader anchored to its prompt) | `skills/skill.test.ts` [1] | Written |
| [xCF], [6HK], the record (every run summarised with its scores and none of its transcripts; a run added once; the summary kept when the full reports are gone) | `tools/eval-summary.test.ts` [1] | Written |
| [fcg] (every section measured by its ablation delta, and every measurement recorded) | `npm run evals`, `--ablation with-without` [eval]; `tools/eval-summary.test.ts` [1], the record | Measured, not enforced: nothing fails a change or removes a rule for a nil delta, and a nil delta against a perfect baseline is read as untested, not as useless |
| [6HK] (each case scored over repeated runs against a stated threshold) | `npm run evals`, `--threshold 0.8` [eval] | Written, and run by hand: CI (the Decisions) runs the tests on every push, but nothing yet stops a change from merging without the evaluations having run |
| [jT0] (how architecture is documented: reader and purpose first, one scoped view, in its artifact, drawn from the model; an overview kept without being asked, and changed with the model) | `evals/diagram-scoped-to-a-reader/`, `evals/diagram-in-the-artifact/`, `evals/diagram-from-the-model/`, `evals/keeping-the-picture/` [eval] | Written. Scoping measured at ten runs: 0.90 with the skill, 0.00 without |
| [18E] (the skill's folder carries its tools, and they run from there with nothing else installed) | `skills/tools.test.ts` [2]: the committed bundle is what its source builds, and each command runs from a copy of the skill's folder alone | Written |
| [obW] (a repository started from the skill alone: the marker, specs in the shape the tools read, the model with the specs and in the shape the tools read, a waymark for each forced fact) | `evals/starting-a-repository/` [eval]; `skills/skill.test.ts` [1], the skill's example model passing the checks and `calm validate` | Written |
| [HPg] (the skill carries traceability: links asked before an edit, asserted as code is written, the scan answered in the same turn) | `evals/leaving-the-trail/` [eval]; `skills/hook.test.ts` [2], the scan run as the installed hook runs it | Written |
| [4Ec] (installed once, told to: the scan added after a shell command as well as a file tool's write, and added to a project installed before it; the skill copied into the project, a copy that differs in any file replaced whole and a link there replaced by a copy, a linter told to skip it and the bundle carrying a header that turns one off, the method recorded, the scan and its permissions added to the project's settings, everything else kept; a second run changes nothing; unreadable settings refused, nothing changed; whether the session running it will run the scan, said) | `method/install.test.ts` [1]; `skills/tools.test.ts` [2], from a copy of the skill outside the project; `evals/starting-a-repository/` [eval] | Written |
| [4Ec], the README (it installs with `install`, never a copy by hand, and shows every command the tool carries) | `skills/skill.test.ts` [1] | Written |
| [BCc] (what the owner says lands in the artifacts in the same turn: a stated requirement a criterion, a choice a waymark citing its evidence) | `evals/owner-decides-in-conversation/` [eval] | Written |
| [knA] (a measurement goes in the decision it supports or a dated findings document, never in a criterion, an NFR or a status; what `dated` is) | `evals/measurement-home/` [eval] | Written |
| [3BW] (a waymark's shape; a decision that stops holding rewritten or deleted where it stands, never superseded) | `evals/waymark-correction/` [eval] | Written |
| [7L6] (artifacts before code across a long exploratory session; the done list read again before done) | `evals/artifacts-across-a-session/` [eval], graded on the order of the writes in its trace | Written, not yet validated: no run has read its trace yet, because its shell cannot run inside a sandbox, where the release's evaluations ran. It needs `--scaffold` and `--allow-tools`, which `npm run evals` passes from the case's own files; without them it runs in an empty directory and scores nothing in either arm |
| [xTV] (a criterion states only the requirement: no mechanism, no who or when) | `evals/criterion-is-the-requirement/` [eval] | Written |
| [xCF], the multi-step case (a rule about order graded on the order of the writes) | `evals/artifacts-across-a-session/` [eval] | Written, not yet validated (the row above) |
| [xCF], every case run as its files say (`--scaffold` where a case names a scaffold script; `--allow-tools` with each gated tool a case lists, and none it does not; a case needing neither adding nothing; what the person passes kept) | `tools/evals.test.ts` [1] | Written |
