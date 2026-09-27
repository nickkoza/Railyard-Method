---
type: regex
target: last_message
pattern: '(?:docs/waymarks/[\w.-]*[Xx]4[\w.-]*\.md|## Decisions\s*\n(?:[^\n]*\n){0,12}?\s*\d+\. \[[^\]\n]{1,8}\][^\n]*X4)'
match: contains
weight: 1
---

The X4 stand-in is a waymark: a file under `docs/waymarks/`, or a numbered decision with an ID
in the counting spec's `## Decisions`. Either is right. This was an LLM question until the
judge failed four answers that held it exactly as asked (2026-09-24, Sonnet judge); it is
counted now, as [6HK] says an instrument that disagrees with itself must be fixed.
