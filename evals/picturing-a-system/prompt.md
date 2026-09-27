---
max_turns: 8
allowed_tools: [Skill]
runs: 5
---

Covers: Architecture diagrams

A project keeps its specs under `docs/specs/`, with a system spec at `docs/specs/shop.md`, and
an architecture model at `docs/architecture/shop.json`. The model declares `customer`,
`web-shop`, `checkout`, `cart`, `catalogue`, `search-index`, `orders-db`, `payments-api`,
`mailer` and `warehouse-feed`, with connections between them. The system spec has a Purpose,
acceptance criteria and a Tests table.

You are asked to add a gift-card feature to `checkout`, whose spec is `docs/specs/checkout.md`.

Say what you would do, in which files and in what order. Do not edit any file.
