---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Skill, Read, Glob, Grep, Write, Edit, "Bash(node:*)", "Bash(python3 -m unittest:*)"]
runs: 3
---

Covers: Links from the code to what it implements

I've decided we're dropping emailed reports. Nobody uses them, and I'd rather people just
download what they need from the reports page. Please take the feature out of this repository
completely: the spec, and every piece of code that exists only for it. Keep the monthly CSV
and the downloads working, and make sure `python3 -m unittest discover reports` passes at the
end.

When you're done, list every file and function you removed or changed.
