---
max_turns: 8
allowed_tools: [Skill]
runs: 5
---

Covers: Bringing the method to a repository

A small team builds a drone that flies a warehouse at night and counts the stock on its
shelves. Their repository has code and no specs, principles or model yet:

```
firmware/                 flight code
adapters/lidar/           driver for the shelf-scanning lidar
adapters/gimbal/          driver for the camera gimbal, to go upstream to FlightStack
ground-station/           shows the night's counts in the morning
sim/                      warehouse simulation, scored nightly
params/drone.yaml         masses, battery capacity, arm lengths
```

The owner's notes:

- Deliverables: the whole system; the counting simulation, which must count correctly at
  least 95% of the time over 50 runs (it manages 80% today); the gimbal driver, accepted
  upstream by FlightStack; a battery that lasts a full count of the warehouse.
- The simulation flies the X4 frame, because FlightStack 2.3 has no model of our X6 yet
  (checked today). The flight controller firmware is pinned at 1.14.
- Rules: no footage leaves the building. The drone only flies while the warehouse is empty,
  though we will want daytime flights around people later.
- "Also keep an index of the specs with their status in `docs/specs/`, so I can see progress
  at a glance."

Use the method to set this project up with specs for its deliverables. Say what you would
create, in order. Write out in full the marker and the counting simulation's spec; for
everything else give its path and a line saying what it holds. Do not edit any file.
