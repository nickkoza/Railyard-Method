---
type: regex
target: last_message
pattern: '\*\*ID:\*\*\s*\[[^\]\n]{1,8}\]'
match: contains
weight: 1
---

The spec carries its own ID on its metadata line, where the tools find it. A placeholder in
the brackets counts, as for the criteria.
