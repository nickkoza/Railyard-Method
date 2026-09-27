#!/usr/bin/env bash
# Writes the repository this case works in: a small grasp simulation with its spec.
# The harness runs it with the run's sandbox as the working directory, under --scaffold.
set -euo pipefail
mkdir -p .railyard docs/specs sim

cat > .railyard/method.json <<'EOF'
{ "method": "1.0.0" }
EOF

cat > README.md <<'EOF'
# Tidybot

A robot that picks up what is left on the floor at night. `sim/` simulates its grasp.
Run it with `python3 sim/grasp.py`; test it with `python3 -m unittest discover sim`.
EOF

cat > docs/specs/sim-grasp.md <<'EOF'
# Grasp simulation

**ID:** [Gs0]

## Acceptance criteria

1. [Gs1] A run of trials with a seed gives the same outcomes for the same seed and code.
2. [Gs2] Each trial ends in success or exactly one failure reason: `missed` or `slipped`.
3. [Gs3] A run prints its success rate over all its trials.

## Decisions

1. [Gs4] **The jaws open 6 cm.** The travel of the first printed gripper.

## Tests

| Criterion | Test | Status |
|---|---|---|
| [Gs1] (same seed, same outcomes) | `sim/test_grasp.py` | Passing |
| [Gs2] (one outcome per trial) | `sim/test_grasp.py` | Passing |
| [Gs3] (prints the success rate) | `sim/test_grasp.py` | Passing |
EOF

cat > sim/grasp.py <<'EOF'
"""Grasp simulation: one trial per item left on the floor."""
import random
import sys

JAW_OPENING_CM = 6.0
SLIP_CHANCE = 0.35


def run_trial(rng):
    """Return "success", "missed" or "slipped" for one grasp."""
    width = rng.uniform(2.5, 7.0)
    offset = abs(rng.gauss(0.0, 1.2))
    if width + offset > JAW_OPENING_CM:
        return "missed"
    if rng.random() < SLIP_CHANCE:
        return "slipped"
    return "success"


def run(trials=400, seed=1):
    rng = random.Random(seed)
    return [run_trial(rng) for _ in range(trials)]


def success_rate(outcomes):
    return sum(o == "success" for o in outcomes) / len(outcomes)


if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    outcomes = run(seed=seed)
    print(f"success {success_rate(outcomes):.0%} over {len(outcomes)} trials")
    for reason in ("missed", "slipped"):
        print(f"  {reason}: {outcomes.count(reason)}")
EOF

cat > sim/test_grasp.py <<'EOF'
import os
import random
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import grasp  # noqa: E402


class GraspTest(unittest.TestCase):
    def test_same_seed_same_outcomes(self):
        self.assertEqual(grasp.run(seed=7), grasp.run(seed=7))

    def test_one_outcome_per_trial(self):
        for outcome in grasp.run(trials=200, seed=3):
            self.assertIn(outcome, ("success", "missed", "slipped"))

    def test_success_rate(self):
        self.assertEqual(grasp.success_rate(["success", "missed"]), 0.5)


if __name__ == "__main__":
    unittest.main()
EOF

git init -q 2>/dev/null && git add -A 2>/dev/null && git commit -qm "Grasp simulation" 2>/dev/null || true
