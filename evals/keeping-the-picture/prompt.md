---
max_turns: 8
allowed_tools: [Skill]
runs: 5
---

Covers: Architecture diagrams

A home-robot project keeps an architecture model at `docs/architecture/robot.json`, declaring
`owner`, `robot-base`, `arm`, `arm-adapter`, `nav`, `camera-streams`, `tidy-skill`, `local-vlm`
and `house-network`, and the connections between them. Its system spec is
`docs/specs/robot.md`.

The owner asks for a new feature: "The robot should put itself on its charging dock between
nights. The dock has its own small controller that the robot's navigation talks to."

Say what you would change, in which files and in what order. Do not edit any file.
