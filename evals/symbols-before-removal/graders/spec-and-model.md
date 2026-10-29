---
type: regex
target:
  source: file
  path: docs/specs/reports.md
pattern: '[Ee]mail'
match: not_contains
weight: 1
---

The spec no longer requires the feature: its criterion is deleted, and its Tests row with it.
