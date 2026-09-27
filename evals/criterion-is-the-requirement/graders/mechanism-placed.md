---
type: llm
weight: 1
---
<!-- anchors: keep_out, dog bed, sofa -->

The situation: the owner asked that the arm never pass over the dog bed or the sofa while
carrying something, and said to do it with a `keep_out` layer in the Nav2 costmap with 30 cm
inflation that MoveIt reads, and to "add that to the spec".

Answer one question: does the answer keep the requirement and the mechanism apart? That
means the spec gains a criterion saying only what must be true (the arm, carrying something,
never passes over the dog bed or the sofa), and the `keep_out` layer, its inflation and
MoveIt reading it are either left to the implementation or recorded as a decision (a
waymark, or a numbered decision in the spec's decisions section), not in the criterion.
A margin stated as the requirement ("keeps at least 30 cm clear of them") is acceptable
only if no mechanism is named with it.

PASS if the criterion is mechanism-free and the mechanism, if kept at all, is in a decision.
FAIL if the criterion names the layer, the costmap, Nav2 or MoveIt, or if the requirement
does not reach the spec as a criterion.
