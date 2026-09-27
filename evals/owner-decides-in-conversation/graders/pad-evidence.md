---
type: regex
target: last_message
pattern: '(?:[Cc]ite|[Ss]ource|[Dd]atasheet|[Rr]eference)[^\n]{0,200}(?:0\.6|friction|95A)|(?:0\.6|friction)[^\n]{0,200}(?:[Cc]ite|[Ss]ource|[Dd]atasheet|[Rr]eference)'
match: contains
weight: 1
---

The friction figure the pads rest on is recorded with where it came from, not left as a
bare number in the code.
