---
max_turns: 8
allowed_tools: [Skill]
runs: 5
---

Covers: Bringing the method to a repository

A home-robot project keeps its specs under `docs/specs/`, its waymarks under
`docs/waymarks/`, and `.railyard/method.json` holds `{ "method": "1.0.0" }` and nothing
else. There is a `docs/findings/` folder with nothing in it yet. Two artifacts matter here.

`docs/specs/sim-grasp.md`:

```markdown
## Acceptance criteria

1. [Jw4] A trial parks beside the item, grasps it and reports success or one failure reason.
2. [Pk7] The robot parks within 3 cm of the spot the reach map gives for the item.

## Non-functional requirements

- Grasp success is at least 80% over 200 simulated trials, measured by `sim/suite/run grasp`.

## Tests

| Criterion | Test | Status |
|---|---|---|
| [Jw4] (a trial reports one outcome) | `sim/test_grasp.py` | Passing |
| [Pk7] (parks within 3 cm) | `sim/test_parking.py` | Failing |
| Grasp success over 200 trials | `sim/suite/run grasp` | Planned |
```

`docs/waymarks/0004-parking.md` holds decision `[Hd2]`: **approach the item head-on, then
shuffle in sideways at 0.25 m/s**, chosen over a side approach. It ends: "The side
approach measured 1.7 to 7.8 cm parking error; head-on is not yet measured."

Last night's simulation run, on the Go1 stand-in, 200 trials, measured:

- head-on parking error: 0.9 to 2.6 cm, in 5 of 5 stops;
- grasp success: 62% (124 of 200); cloth items 31%;
- the robot tipped in 3 trials, all while leaning past 14 degrees.

The owner says: "Write last night's numbers down somewhere we'll find them."

Say which files you change and write out exactly what you add or change in each. Do not
edit any file.
