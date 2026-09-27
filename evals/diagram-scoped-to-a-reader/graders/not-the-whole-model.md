---
type: regex
target: last_message
match: not_contains
pattern: "```mermaid(?=(?:(?!```)[\\s\\S])*watermarks)(?=(?:(?!```)[\\s\\S])*checkpoints)(?=(?:(?!```)[\\s\\S])*item-store)(?=(?:(?!```)[\\s\\S])*event-log)(?=(?:(?!```)[\\s\\S])*metrics-exporter)(?=(?:(?!```)[\\s\\S])*credential-relay)"
weight: 1
---

No single diagram names every detail-level component: the individual stores, the metrics
exporter and the credential relay. A README overview has no reason to name all six. A dump of
the whole model always does, however it is grouped. This is counted, not judged: an LLM judge
passed 28 grouped nodes as "collapsed" (2026-09-23, Haiku judge), which is the failure this
case exists to catch.
