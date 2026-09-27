---
type: regex
target: last_message
pattern: '```mermaid\s*\n\s*%%\s*view-of:\s*docs/architecture/\S+\.json'
match: contains
weight: 1
---

The diagram is written as a view of the model: a Mermaid block whose first line names the
model it is drawn from, so the check can hold every component and connection it draws to that
model. A picture drawn in the model's spirit, with nothing naming the model, is one no check
can tell from a picture drawn beside it.
