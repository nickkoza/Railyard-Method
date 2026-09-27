---
type: regex
target: last_message
pattern: '"method"\s*:'
match: contains
weight: 1
---

The marker records the version under `method`, the key every tool reads. Every run of this
case wrote `"version"` before the skill showed the marker (2026-09-24), which a tool reads
as no marker at all.
