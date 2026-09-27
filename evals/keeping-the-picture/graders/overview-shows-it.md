---
type: regex
target: last_message
pattern: '(?:robot\.md[^\n]*(?:overview|view|diagram)|(?:overview|view|diagram)[^\n]*robot\.md|```mermaid\s*\n\s*%%\s*view-of:\s*docs/architecture/robot\.json[^`]*dock)'
match: contains
weight: 1
---

The system spec's overview is changed, or drawn, to show the dock, in the same piece of work.
Nothing in the prompt mentions a diagram: a component added to the model and to no view is
one nobody reading the system spec knows exists, and the check reports it ([CLM]).
