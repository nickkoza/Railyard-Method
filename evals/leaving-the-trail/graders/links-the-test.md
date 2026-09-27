---
type: regex
target: last_message
pattern: "link '?sim/test_grasp\\.py#test_tipped_trial_fails'? \\[?Gd4"
match: contains
weight: 1
---

The new test is linked to the criterion it tests, [Gd4]. The scan's report shown in the prompt
names only `sim/grasp.py`, so this comes from the skill: a test links to what it tests. Quoting the target for the shell is the same link (2026-09-26: four answers that quoted it were scored as not linking).
