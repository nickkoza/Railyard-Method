---
type: regex
target: last_message
pattern: '(?:[Ww]aymark|Decisions?\b)[\s\S]{0,600}?(?:95A|TPU|rib)|(?:95A|TPU|rib)[\s\S]{0,600}?[Ww]aymark'
match: contains
weight: 1
---

Asked only for a unit test, the agent still records the pad choice the owner made in
conversation (95A TPU, ribbed over flat) as a waymark or a spec's decision, in the same
piece of work, rather than leaving it in the chat. This is the failure the first repository
worked with the skill showed (2026-09-25), which a reflective question never reproduced.
