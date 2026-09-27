---
type: regex
target: last_message
pattern: '(?:\.md|[Cc]riterion|[Ss]pec)[^\n]{0,300}(?:height|tilt)|(?:height|tilt)[^\n]{0,300}(?:[Cc]riterion|[Ss]pec\b|\.md)'
match: contains
weight: 1
---

The rig's stated requirement, the robot camera's height and tilt, reaches a spec, though the
task at hand is about the pads.
