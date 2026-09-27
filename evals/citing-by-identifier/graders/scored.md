---
type: llm
weight: 1
---
<!-- anchors: criterion 7 -->

The insight being tested is narrow: a reference held by position breaks **silently** when
something is inserted above it — "criterion 7" still names a real criterion, just the wrong
one — and the fix is identity that does not depend on position.

Score it well when the answer:
- says the reference does not dangle but quietly retargets, and that nothing fails, which is
  what makes it dangerous;
- proposes identifiers assigned once and independent of position, so that renumbering stops
  being a migration.

Score it poorly when the answer:
- thinks the reference breaks loudly, or that a link check or build would catch it;
- proposes only to avoid inserting, to append at the end, or to renumber more carefully,
  with no notion of position-independent identity;
- treats it as a documentation tidiness problem rather than a naming one.

**Do not penalise** an answer for also offering a pragmatic interim step — correcting the
one known reference by hand, or quoting the criterion's text beside the number as a
stop-gap — provided it names position-independent identity as the actual fix. Both are
compatible, and an answer that sequences them is not worse than one that does not.

Judge the reasoning, not the framing, the ordering of the points, or the length.
