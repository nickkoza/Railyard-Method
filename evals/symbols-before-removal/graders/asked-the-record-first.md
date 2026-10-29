---
type: regex
target: trace
pattern: '^(?:(?!"name":"(?:Write|Edit|MultiEdit)","input":\{"file_path":"[^"]*\.py")[\s\S])*?(?:railyard\.mjs[^"\n]*\b(?:trace|links)\b|symbols/links/)'
match: contains
weight: 2
---

Read from the run's trace: before its first write to any Python file, the session asked the
link records what implements the feature — the skill's `trace` or `links`, or reading a file
under `symbols/links/` directly. This is the rule under test ("The links are how you find
your way in the code. Reach for them first."): on 2026-10-28 an agent removing a subsystem
planned the removal from the architecture model and never asked the record, which would have
missed the code woven into components that remain.
