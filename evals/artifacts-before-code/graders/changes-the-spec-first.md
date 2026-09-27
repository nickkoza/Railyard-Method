---
type: llm
weight: 1
---
<!-- anchors: how long it took -->

The situation: a user wants the desk to show how long it took when a run finishes, and no
spec mentions it yet.


A good answer says that the specification changes first — that a new acceptance criterion
is added to the spec that owns this behaviour, together with a test for it — and that
implementation code follows afterwards.

Score it well when the answer:
- puts the artifact change before the code, explicitly and in that order;
- says the new criterion needs a test, rather than leaving the criterion alone;
- identifies which spec should own the behaviour, or says it would ask when it cannot tell.

Score it poorly when the answer:
- goes straight to implementation, or describes code first and documentation afterwards;
- treats updating the spec as something to do "as well", at the end, or when convenient;
- adds a criterion with no mention of a test.

Judge only the ordering and the reasoning. Do not reward length, and do not penalise an
answer for being brief if it gets the order right.
