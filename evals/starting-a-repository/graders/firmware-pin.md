---
type: regex
target: last_message
pattern: '(?:docs/waymarks/[\w.-]*(?:firmware|1-14|1\.14)[\w.-]*\.md|## Decisions\s*\n(?:[^\n]*\n){0,20}?\s*\d+\. \[[^\]\n]{1,8}\][^\n]*(?:firmware|1\.14))'
match: contains
weight: 1
---

The pinned firmware, 1.14, is a waymark: a file under `docs/waymarks/`, or a numbered decision
with an ID in a spec's `## Decisions`.
