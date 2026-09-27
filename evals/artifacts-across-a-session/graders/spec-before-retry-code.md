---
type: regex
target: trace
pattern: '^(?:(?!"name":"(?:Write|Edit|MultiEdit)","input":\{"file_path":"[^"]*\.py"(?:(?!"type":"tool_use")[^\n])*?(?:[Rr]etr|RETR|[Aa]ttempt|once more))[\s\S])*?"name":"(?:Write|Edit|MultiEdit)","input":\{"file_path":"[^"]*docs/(?:specs|waymarks)/[^"]*"(?:(?!"type":"tool_use")[^\n])*?(?:[Rr]etr|once more|second (?:attempt|try|grasp)|[Rr]e-cent|[Rr]ecentr)'
match: contains
weight: 1
---

Read from the run's trace, one message per line in the order they happened: a write to a
spec or a waymark about the retry comes before the first write of Python that mentions a
retry, a test counting as Python. The retry is new behaviour, the third step of an
exploratory session, and is where Houndkeeper's long sessions wrote code first and the spec
afterwards or never (2026-09-27). A run that never writes the spec fails; a run that writes
the spec and never the code passes this grader and fails `retry-implemented`.
