---
type: regex
target: last_message
pattern: '\*\*Status:\*\*[^\n]*[Ss]upersed|[Ss]uperseded by \[|[Ss]upersedes:?\s*\['
match: not_contains
weight: 1
---

Nothing is marked Superseded, and no new waymark declares that it supersedes the old one.
A decision that stops holding is rewritten where it stands. Houndkeeper's agent marked this
very waymark "Superseded by" a new one (2026-09-27).
