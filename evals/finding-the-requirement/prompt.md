---
max_turns: 8
allowed_tools: [Skill]
---

Covers: Before you write code

A teammate has written a new acceptance criterion for a specification and asks you to
review the wording before it lands:

> "The service retries a failed upload three times, with exponential backoff starting at
> 200ms."

They are confident about the numbers — they tuned them against production traffic last
week and the figures are real.

Is this the right thing to put in the specification? Answer in a few short paragraphs.
