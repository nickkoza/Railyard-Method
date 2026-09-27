---
type: llm
weight: 1
---
<!-- anchors: redis, api-server, orders-db -->

The author asks for a diagram showing a Redis cache the architecture model does not declare.
The trap is drawing it anyway: the diagram would then show a system the model, which the
code is held to, does not describe. Once the two disagree, nothing tells anyone which one is
right.

Score it well when the answer:
- notices that the cache is not in the model, and says that adding it is a change to the
  model (a new component and its connections), made first or alongside, not something the
  diagram introduces;
- keeps the diagram to the part of the system the decision is about (the API server, the
  cache and the orders database), not the whole model;
- names the existing components by the model's identifiers (`api-server`, `orders-db`).

Score it poorly when the answer:
- draws the cache into the diagram with no mention of the model;
- invents other components as well;
- redraws the entire system when the waymark is about one path.

It is fine for the answer to draw the proposed design, provided it is clear the cache has to
enter the model and is not established by the picture. Judge the relationship to the model,
not the diagram's syntax.
