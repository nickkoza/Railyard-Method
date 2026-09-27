---
type: regex
target: last_message
pattern: '(?<![\w-])links sim/grasp\.py'
match: contains
weight: 1
---

Before changing the file, the agent asks what it implements, with the `links` command: those
are the requirements the change can break. Nothing in the prompt shows that command. However it is run counts: an answer that shortens the tool to `T` or `railyard` still asks (2026-09-24, two such answers were scored as not asking).
