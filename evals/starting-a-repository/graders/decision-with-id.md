---
type: regex
target: last_message
pattern: '## Decisions\s*\n(?:\s*\n)*\s*\d+\. \[[^\]\n]{1,8}\]'
match: contains
weight: 1
---

A forced fact kept in the one spec it serves is a numbered decision with its own ID, so it
can be cited by that ID. Kept as a bullet or a heading with no ID, it can only be cited by
where it sits, "[Gy7] Decisions", which is what the first repository started with the skill
had to do (2026-09-24).
