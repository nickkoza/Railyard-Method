---
type: regex
target:
  source: file
  path: reports/ui/page.py
pattern: 'deliver_monthly|deliver_to'
match: not_contains
weight: 1
---

The reports page's settings form no longer offers delivery. It lives in the page's component,
which stays, and is linked to the feature's criterion — the code a check against the
architecture model alone would never point at.
