# Principles

**ID:** [33r]

The rules every other decision in the method answers to. They are the slowest-moving
artifact here, and still mutable: nothing in a repository that follows the method is
immutable, these included ([SYK]).

They constrain the method itself: the skill, the tools and the conventions they carry.
The rules the method teaches an agent live in the skill and the specs, and most of them
are these principles applied. A principle is rarer than a waymark by a wide margin: when
they arrive monthly, they are decisions wearing the wrong label.

---

## What the artifacts are

1. [SYK] **Artifacts are desired state, and the delta is the work.** An artifact says what
   should be true. The code, and the system it runs as, is what is actually true. Neither
   is a record of the other: the gap between them is the work, and an agent's job is to
   read that gap and close it. This is the shape declarative infrastructure made ordinary
   (a declaration of the intended world, and a reconciler that converges on it) applied to
   specs, to the architecture model, and to everything below them.

   **So nothing is immutable.** Desired state that cannot be edited is a contradiction: it
   stops saying what should be true and starts saying what someone once believed, while the
   system it governs moves on. Every artifact is corrected where it stands (principles,
   specs, the model and waymarks alike) and git holds what changed. An immutable record with
   a supersession chain answers *what did we believe, and when*, which git already answers
   better. The question an artifact exists to answer is *what should be true now*, and only a
   file that can be edited answers it.

   What this gives up is that a reader cannot tell a long-settled artifact from one
   corrected an hour ago without reading its history. That is the right trade: a stale
   artifact reads as current either way, and a mutable one can at least be fixed by whoever
   notices.

2. [clO] **Artifacts change first, and code follows.** A change to what the system should do
   starts as a change to the artifact that says so, and the code is brought to it. Editing
   the code and reconciling the artifacts afterwards is the way of working the method exists
   to replace: an artifact written to match code it was meant to constrain has stopped
   constraining it.

3. [yBq] **Each kind of knowledge has its own artifact.** Principles, the architecture model,
   specifications and waymarks each hold one kind of thing and change for one kind of
   reason. A document that holds everything changes for every reason, and soon nobody can
   tell which parts still bind.

4. [cwb] **A spec says what, never how, and is written for the person who has to decide
   whether it is right.** A spec states behaviour someone could observe from outside, and
   the measurable requirements on it. The inside of the box is the implementer's business,
   and the tests hold whatever it chose. Where a *how* has to be written down, it is a
   waymark; when unsure which, ask whether anyone outside the capability would care.

   Its first reader is a person building a picture of the capability, and what the
   machinery wants (numbered criteria, a Tests table) serves that reader. Length is not a
   cost: split where the picture splits, never to keep a file short. It says what happens
   when things fail, not only when they work.

   **A non-functional requirement is a *what*,** if it can be observed from outside and
   tested without knowing the implementation; it becomes a *how* the moment it names a
   mechanism. "p99 under 1s at 12 concurrent runs", not "uses connection pooling"; "state
   survives a restart", not "persists to SQLite". Each states its measurement conditions
   (load, concurrency, percentile, where it is measured), because a bare number is argued
   about rather than verified. And each is written only where it matters: if nothing breaks
   when the number doubles, it only narrows the implementation and makes a test fail for
   nothing. The ones most often forgotten are what happens when a dependency is
   unavailable, ordering and duplicates, latency on a path everything waits on, and how
   the system behaves with less than its full capability.

5. [rZB] **The architecture model is the authority.** The model says what the components
   are, where their boundaries run and how they may talk, and the code is held to it.
   Where they disagree the model is right by default, and changing the model is a
   deliberate act, never a way of making a finding go away.

6. [ONJ] **Most technical decisions are business decisions nobody has finished thinking
   through.** Taken back far enough, a technical choice often resolves into a requirement
   about value: what the product is for, what its operator needs, what must be true for
   someone to trust it. Once that requirement is stated plainly the choice beneath it
   usually stops mattering: several mechanisms would satisfy it, the tests hold whichever
   is chosen, and the argument that felt important turns out to have been about an
   unstated requirement.

   So: **find the requirement before writing anything down.** Ask why until the chain
   reaches value, a business decision or a fundamental commitment, and cut it just above
   implementation. Above the cut is a functional requirement, a non-functional one, or the
   architecture model. Where the chain runs out, where the honest answer is "it seemed
   neater", drop the rule rather than document it more carefully.

   **Below the cut, ask once more: could two competent implementations differ here, and
   would it matter?** Four answers, and only the first is silence:

   - **No, and no.** The implementer's business. Writing it down narrows the solution space
     for nothing. Most of what falls below the cut.
   - **Forced.** Only one thing works, because software nobody here controls decides it.
     Record it with the date and version it was observed at, because it is a fact about
     someone else's software and it expires: an experiment run in September is not evidence
     in December. When that software's version changes, the observation is run again.
   - **Conventional.** Many work, none is better, and everyone must pick the same one.
     Record it because consistency is its whole value; it is load-bearing *because* it is
     arbitrary.
   - **Hard-won.** Several routes look fine and some are traps, the cost arriving later and
     not where anyone was looking. Record the hazard, what it costs and the evidence. This
     is the one place a *how* belongs in an artifact.

   These last three are waymarks: marks left on a route for whoever comes next. **Post a
   hazard on the terrain, never on one traveller.** A trap written as a property of the
   caller that first met it is a sign at one trailhead, and the next route in finds the
   same drop.

   **This is a hypothesis, and it is under test.** Taking Railyard's own decision record
   back through it dissolved 147 of 173 records, most of them requirements already stated
   elsewhere or only in a test row. What would falsify it: a steady run of decisions that
   survive the questioning with nothing above them; requirements that cannot be written
   without naming the mechanism; or a waymark directory that grows faster than the specs.

## How the method holds itself

7. [rFT] **A criterion without a test is a wish.** Every acceptance criterion names the test
   that holds it, in the spec itself. A criterion added without one leaves the artifact
   claiming something nothing checks. A prohibition is tested by asserting the thing does
   not work (a negative-space test): most suites only prove that things do, and where the
   rule is "never", what does not happen is the whole requirement.

8. [Bsh] **What must hold is enforced mechanically, never by prose or review.** Prose is
   advisory to every reader, human or agent: it is read, weighed and sometimes skipped. A
   rule that has to hold goes in a check, a test, a hook or a type, and the method's own
   rules are held by the same means. Where the answer to "what happens if this is
   ignored?" is "the work is wrong and nothing catches it", the rule is in the wrong place.

9. [vKz] **References survive editing.** Every artifact, and every numbered item inside one,
   carries an identifier set once and never changed, and a reference is that identifier.
   A position moves the moment something is inserted above it, and a name moves the day it
   is renamed; either way the reference still resolves, to the wrong thing. An identifier
   does not move, so renumbering, renaming and splitting become safe edits, which is what
   lets the artifacts be corrected where they stand ([SYK]).

10. [AUx] **A divergence is reported, never quietly resolved.** When an artifact and the code
    disagree, which one is wrong is a judgement, and it is made in the open. Resolving it
    silently, in either direction, destroys the evidence that there was a question.

11. [Phs] **Review discovers; checks hold.** Conformance is verified in layers, each holding
    only what the one before cannot: the model validated against its schema; then
    deterministic checks of the code against the model and the artifacts against
    themselves; then an agent's review of the residue that needs judgement. The review is
    advisory: a clean one means nothing was found, never that all is well ([Fqh]). It runs
    as standing adversarial passes, by an agent with no context from what is checked,
    graded on what it finds, and reporting rather than fixing ([AUx]). A reviewer that
    reports "all consistent" every time is broken. Anything it finds that a check could have
    caught is two findings, the problem and the missing check, and the check is written, so
    the checks grow and the review's share shrinks.

12. [WCb] **Regenerability is a diagnostic, not a promise.** If a component cannot be
    rebuilt from its artifacts alone so that it passes its own tests, the artifacts are
    incomplete, and what the rebuilt version gets wrong is exactly what they failed to say.
    Rebuilding a component in isolation from time to time is how that is found. Byte-level
    regeneration is not the aim: a spec detailed enough to fix the output would be the
    code in prose.

## What the tools may claim

13. [Sxu] **Present evidence, not conclusions.** A link says how it is known: recorded
    alongside the code, cited, exercised by a test, or confirmed by a person. A mention is
    never presented as proof. A verdict without its evidence removes the reader's ability
    to catch the tool being wrong.

14. [UJ8] **An agent's own account is not evidence.** What an agent says it was doing is kept,
    and weighed as a comment is. It is never what confirms a link, passes a check or clears
    a finding. Only a person confirms.

15. [Fqh] **Nothing verifies itself.** The implementer does not grade its own work, and an
    evaluation's judge is not the agent it judges. A clean report means nothing was found,
    never that the artifacts and the code agree.

16. [9p5] **Absence of signal is not evidence of health.** A check that reads zero files
    passes; a grader that cannot count passes everything. Every check shows that it saw
    something before its silence means anything.

17. [Wuq] **Never answer less while looking complete.** A tool that cannot read part of what
    it was asked about says so, naming what and why. A partial answer presented as a whole
    one is the failure the rest of these principles exist to prevent.

18. [2sV] **Never persist what can be observed.** Whether an artifact is in sync, what a
    link's state is, what an index holds: each is derived from the repository when it is
    asked for, never recorded as a claim that can go stale. What is kept for speed is
    throw-away, and rebuilt from what it was derived from.

## How it meets a repository

19. [epm] **Conventions, not configuration, and opinions stated as opinions.** The method
    fixes where artifacts live, how they are cited and how a repository says which version
    of it laid the repository out, so any repository that follows it is readable by every
    tool that does, with nothing to set up. It carries one way of building software and
    says so plainly, rather than presenting defaults a reader discovers later. Changes to it
    are carried to existing repositories by an upgrade, never left to each one to follow.

20. [I8O] **Opinionate an agent as lightly as the work allows.** Every rule the method gives an
    agent spends some of the judgement the agent would otherwise use, so it has to be worth
    what it costs. Prefer context to instruction: telling an agent what the work is for
    leaves its reasoning intact, while telling it how to write the code replaces the model's
    judgement in the place the model is most likely to be better. A rule earns its place by
    naming what fails without it, and is measured in an evaluation run with the rule and
    without it, to see whether it changes what an agent does. A long instruction file loses adherence,
    so a paragraph added weakens every paragraph beside it.
