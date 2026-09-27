---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Skill, Read, Glob, Grep, Write, Edit, "Bash(python3 sim/grasp.py:*)", "Bash(python3 -m unittest:*)"]
runs: 5
---

Covers: While you write code

Grip success in the grasp sim is poor and I'd like to push it up tonight. Work through
this in order, in this repository:

1. Run `python3 sim/grasp.py` and tell me where we are.
2. The new printed jaws open to 8 cm. Try the sim with the jaws at 8 cm, and if success
   goes up, keep it.
3. Then, when a grasp slips, have the robot re-centre and try once more. Never more than
   one retry per trial. Keep it if it helps.

Make sure `python3 -m unittest discover sim` passes at the end, and tell me the success
rate after each step.
