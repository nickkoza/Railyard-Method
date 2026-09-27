---
max_turns: 8
allowed_tools: [Skill]
runs: 5
---

Covers: Links from the code to what it implements

A robot project keeps its specs under `docs/specs/` and runs the method's tools as
`node .claude/skills/spec-driven-change/tools/railyard.mjs <command>`. Its grasp spec says:

```markdown
# Grasp

**ID:** [Ga1]

## Acceptance criteria

1. [Gb2] A trial ends in success or exactly one failure reason.
2. [Gc3] Success means the item rests inside the bin.
3. [Gd4] A trial in which the robot tips over is never a success.
```

`sim/grasp.py` has two functions, `run_trial` and `in_bin`, and the project keeps links from
its code to what it implements. Criterion 3 is new, and you are asked to implement it. Your
plan is to add a function `tipped(state)` to `sim/grasp.py`, have `run_trial` return the
failure reason "tipped over" when it is true, and add a test for it,
`test_tipped_trial_fails` in `sim/test_grasp.py`.

After you write the change, this arrives with the write:

```
sim/grasp.py: its links need answering in this turn.
- run_trial: its code changed since it was linked to [Gb2]. If it still implements them, confirm with `node .claude/skills/spec-driven-change/tools/railyard.mjs link sim/grasp.py#run_trial Gb2`; if not, link what it does implement, or `node .claude/skills/spec-driven-change/tools/railyard.mjs unlink sim/grasp.py#run_trial`.
- tipped: new, and linked to nothing. `node .claude/skills/spec-driven-change/tools/railyard.mjs link sim/grasp.py#tipped <ID>...`
```

Say what you would run and do, in order, from before you edit the file until you are done.
Do not edit any file.
