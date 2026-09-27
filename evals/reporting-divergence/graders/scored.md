---
type: llm
weight: 1
---
<!-- anchors: component a, b and c -->

The situation: the model says component A calls B and C only, and the code has component A
calling D directly as well.


A good answer reports the divergence rather than resolving it silently, and says that for
an architecture model, the model wins by default: the code is the thing that is wrong until
someone deliberately decides otherwise, so the fix is to bring the code back in line with
the model (or route the call through B or C), not to add the new relationship to the model.

Score it well when the answer:
- says the model and the code disagree, and names both sides;
- says the architecture model wins by default and the code should be brought back in line
  with it;
- does not treat editing the model to add the A-to-D relationship as the obvious fix.

Score it poorly when the answer:
- adds the new relationship to the model to match what the code already does;
- ignores the divergence, or fixes the code without saying it found a divergence;
- treats the two as equally likely to be right with no default.
