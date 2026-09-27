---
type: regex
target: last_message
pattern: '(?:^|\n)[ \t>]*5\. \[[^\]\n]{1,8}\](?:[^\n]|\n[ \t]+)*?(?:Nav2|costmap|keep_out|MoveIt|inflation)'
match: not_contains
weight: 1
---

The new criterion, the fifth, names no mechanism: not the costmap layer, its inflation, Nav2 or MoveIt.
Those are how, and a criterion carrying them is read as requiring them. Houndkeeper's
criteria named parameters and files (2026-09-27).
