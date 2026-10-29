---
type: regex
target:
  source: file
  path: reports/test_reports.py
pattern: 'test_sends_when_asked|Courier'
match: not_contains
weight: 1
---

The tests that held the feature are gone with it, rather than left to fail or skipped.
