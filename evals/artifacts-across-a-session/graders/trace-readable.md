---
type: regex
target: trace
pattern: '"name":"(?:Write|Edit|MultiEdit)","input":\{"file_path":"[^"]*sim/grasp\.py"'
match: contains
arm: with-only
weight: 1
---

An indicator that the instrument works, not part of the score: a write to `sim/grasp.py`,
which every run that does the work makes, is found in the trace in the shape
`spec-before-retry-code` reads. If this fails on a run whose `retry-implemented` passes, the
trace's shape has changed and the order grader is reading nothing.
