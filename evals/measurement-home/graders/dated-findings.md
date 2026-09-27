---
type: regex
target: last_message
pattern: '"dated"\s*:\s*\[[^\]]*findings'
match: contains
weight: 1
---

The grasp success rate supports no decision yet, so it goes in a findings document, and
that document is named in `.railyard/method.json`'s `dated` list, which the prompt's
marker does not have yet. Nothing in the prompt names `dated`: it comes from the skill.
