---
type: regex
target: last_message
pattern: '## Decisions\s*\n(?:\s*\n)*\s*\d+\. \[[^\]\n]{1,8}\][^\n]*\n(?:[^\n]*\n){0,12}?\s*\d+\. \[[^\]\n]{1,8}\]'
match: contains
weight: 1
---

The waymark written out keeps its shape: numbered decisions, each with its own ID, so each
can be cited on its own.
