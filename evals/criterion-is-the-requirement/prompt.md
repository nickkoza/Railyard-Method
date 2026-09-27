---
max_turns: 8
allowed_tools: [Skill]
runs: 5
---

Covers: Before you write code

A home robot tidies a living room at night while the family's dog sleeps. Its spec
`docs/specs/tidy.md` has acceptance criteria numbered `1. [Td1]` to `4. [Td4]` and a Tests
table; the arm's motion is planned with MoveIt, and the house map lives in a Nav2 costmap.

The owner, this morning: "Last night the arm swung a sock right over Biscuit's bed and woke
him. That can't happen again. After the chair incident on the 24th we said the same about
the sofa, so it's both now: the arm never passes over the dog bed or the sofa while carrying
something. Do it with a `keep_out` layer in the Nav2 costmap, a 30 cm inflation round each,
and have MoveIt read it. Add that to the spec."

Write out exactly what you add to `docs/specs/tidy.md`, and anything else you would write
down and where. Do not edit any file.
