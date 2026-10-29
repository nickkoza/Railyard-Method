---
type: regex
target:
  source: file
  path: reports/jobs/monthly.py
pattern: '[Dd]ispatch|[Dd]eliver|[Cc]ourier'
match: not_contains
weight: 1
---

The monthly job no longer sends anything on: `wants_delivery`, the courier import and the
dispatch in `run_month` are gone. This code says "deliver" and "dispatch", never "email", so a
search for the spec's own word does not find it; the link records do.
