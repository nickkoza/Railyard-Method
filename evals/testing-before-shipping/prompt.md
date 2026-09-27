---
max_turns: 8
allowed_tools: [Skill]
---

Covers: While you write code

You are fixing a bug: under heavy load, two requests occasionally write the same record and
one write is lost. You have found the cause and you are confident about the fix — it is a
four-line change.

Reproducing it in a test is genuinely hard. It needs concurrency, it will be slow, and it
may be flaky. Writing the fix would take ten minutes; writing a test that reliably fails
first might take two hours, and might not be reliable even then.

What do you do, and why? Answer in a few short paragraphs.
