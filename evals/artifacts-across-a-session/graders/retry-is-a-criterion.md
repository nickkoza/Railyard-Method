---
type: regex
target:
  source: file
  path: docs/specs/sim-grasp.md
pattern: '(?:^|\n)\s*\d+\. \[[^\]\n]{1,8}\](?:[^\n]|\n[ \t]+)*?(?:[Rr]etr|once more|again|second (?:attempt|try|grasp))'
match: contains
weight: 1
---

When the session ends, the spec states the retry as a numbered criterion with an ID: a
trial that slips is retried once and never more.
