---
type: regex
target:
  source: file
  path: sim/grasp.py
pattern: '[Rr]etr|RETR|attempt'
match: contains
weight: 1
---

The retry was built: the session did the work, rather than stopping at the spec.
