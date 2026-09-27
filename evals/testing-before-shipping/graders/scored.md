---
type: llm
weight: 1
---
<!-- anchors: four-line, two hours -->

The situation: a race condition, a confident four-line fix, and a faithful reproduction that
would cost two hours and might still be flaky. The tempting move is to ship the fix and
write no test, on the grounds that the test is disproportionate.

A good answer does not let "the faithful test is expensive" become "no test", and finds the
cheaper thing that can still be watched failing — usually the *mechanism* the fix introduces
rather than the *symptom* that revealed it. A conditional write, a version check, a lock:
each of those is testable deterministically and cheaply, and can be seen to fail before the
fix exists.

Score it well when the answer:
- separates "reproducing the race is expensive" from "this change goes in unverified", and
  refuses the second;
- proposes something that can be **watched failing before the fix**, even if that is not a
  full concurrency reproduction;
- is clear that a test only ever seen green has not shown it catches anything.

Score it poorly when the answer:
- ships the fix with no verification at all, or defers the test to "later" with nothing
  concrete;
- treats the full two-hour concurrency reproduction as the only honest option, and so
  arrives at paralysis or at shipping untested;
- writes the test after the fix and accepts a green run as proof.

**Judge the substance and not the order it arrives in.** An answer that opens "ship the fix"
and then says how it will be verified is making the same argument as one that opens with the
verification, and they score the same. Do not reward length, hedging, or the presence of
particular words.
