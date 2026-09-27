---
type: regex
target: last_message
pattern: '(?:^|\n)[ \t>]*5\. \[[^\]\n]{1,8}\](?:[^\n]|\n[ \t]+)*?(?:bed|sofa)'
match: contains
weight: 1
---

The requirement reaches the spec as its fifth criterion, numbered and with an ID: the arm never carries
anything over the dog bed or the sofa.
