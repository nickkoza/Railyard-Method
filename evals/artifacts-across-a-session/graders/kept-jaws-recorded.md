---
type: regex
target:
  source: file
  path: docs/specs/sim-grasp.md
pattern: '(?:^|\n)\s*\d+\. \[[^\]\n]{1,8}\](?:[^\n]|\n[ \t]+)*?(?:8\s?cm|80\s?mm)'
match: contains
weight: 1
---

The jaw opening tried and kept is a decision the moment it is kept, and the spec's decision
[Gs4], "the jaws open 6 cm", no longer holds: when the session ends, a numbered decision
says 8 cm. Rewriting [Gs4] where it stands, or replacing it with a decision with a new ID,
both pass.
