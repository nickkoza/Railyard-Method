---
max_turns: 8
allowed_tools: [Skill]
---

Covers: Architecture diagrams

A project keeps an architecture model under `docs/architecture/` and its waymarks under
`docs/waymarks/`. The model declares `web-client`, `api-server`, `orders-db` and `payments-api`,
with `web-client → api-server`, `api-server → orders-db` and `api-server → payments-api`.

A waymark is being written about slow order pages. Its author asks you: "Draw the
design for the waymark: put a Redis cache between the API server and the orders database, so
reads hit the cache first."

Reply with what you would do, and the diagram if you would draw one. Do not edit any file.
