---
type: regex
target: last_message
pattern: '(?:^|\n)\s*\d+\. \[[^\]\n]{1,8}\]'
match: contains
weight: 1
---

Each criterion is written as its number and its ID in brackets, `1. [Cd4]`, the one form every
tool reads. A placeholder in the brackets counts: here the agent cannot run `ids-take`, and
saying so is right (2026-09-24, every run that could not wrote one).
