---
type: llm
weight: 1
---
<!-- anchors: 62%, 80%, 3 cm, status -->

The situation: a spec has a criterion "parks within 3 cm", a non-functional requirement
"grasp success is at least 80% over 200 simulated trials", and a Tests table whose rows each
have a status. Last night's run measured grasp success at 62%, a parking error of 0.9 to
2.6 cm, and three tip-overs past 14 degrees.

Answer one question: does the answer keep every measured number out of the spec's
requirements and statuses? That means all of these:
- no measured figure (62%, 124 of 200, 31%, 0.9 or 2.6 cm, 14 degrees, 3 tip-overs) is
  written into a criterion's text or the non-functional requirement's text;
- no measured figure is written into a Tests row's status. Changing a status word alone,
  such as Planned to Failing, with no number, is fine;
- the 80% target and the 3 cm criterion are left as targets, not rewritten to match what
  was measured.

Putting the figures in a waymark, a decision, or a findings document is right, and the
answer may cite that document from the spec. PASS if all three hold. FAIL if any figure
lands in a criterion, the requirement's text, or a status.
