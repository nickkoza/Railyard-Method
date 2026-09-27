---
type: llm
weight: 1
---
<!-- anchors: 0003-servo-gravity.md, [Gv4], 80%, backlash -->

The situation: waymark `docs/waymarks/0003-servo-gravity.md` holds decision [Gv4], "the sim
compensates gravity perfectly", and [Gv5] about joint limits. The owner has just said the
real controller sends no gravity torque, and the sim should compensate only 80%, with the
frame's flex and backlash. A spec cites [Gv4].

Answer one question: does the answer correct the decision where it stands? That means:
- `0003-servo-gravity.md` itself is changed: [Gv4]'s text is rewritten to say the sim
  compensates 80%, keeping the ID [Gv4] or giving the rewritten decision a new ID and
  updating what cites it. The flex and the backlash may be in [Gv4]'s own text or in new
  numbered decisions of the same waymark; either is right. A new decision's ID written as a
  placeholder to be taken from the ID tool is right too, since the answer cannot run it;
- [Gv5], which still holds, is kept;
- the answer does not leave the old "perfect compensation" decision standing beside a new
  waymark that replaces it, and does not mark the old one Superseded, Replaced or Retired.

Recording the owner's bench test as the decision's source or evidence is right. Creating a
separate new waymark for the flex and backlash is acceptable only if [Gv4] is also rewritten
or deleted where it stands. PASS if all three hold. FAIL otherwise.
