---
max_turns: 8
allowed_tools: [Skill]
runs: 5
---

Covers: What the owner decides in conversation

A home-robot project keeps its waymarks under `docs/waymarks/`. One of them,
`docs/waymarks/0003-servo-gravity.md`, reads in full:

```markdown
# The sim's arm servos hold their own weight

**Status:** Accepted · **Date:** 2026-09-25 · **Source:** sim tuning, 24 Sep 2026 · **ID:** [Gv3]

## Context

The arm's servos sag under the gripper's weight when nothing compensates for gravity, and
the grasp sim's success rate fell by half when they did.

## Decisions

1. [Gv4] **The sim compensates gravity perfectly at every joint**, so a commanded pose is
   the pose reached.
2. [Gv5] **Joint limits come from the servo datasheet**, not from the printed frame.
```

`docs/specs/sim-arm.md` cites `[Gv4]` in one of its criteria.

The owner, after bench-testing the real arm today: "The real controller sends no gravity
torque at all. The sim is lying to us. Make the sim compensate only 80%, and add the frame's
flex and a degree of backlash, so it sags the way the real arm does."

Say which files you change, and write out in full every artifact you create or change. Do
not edit any file.
