---
type: regex
target: last_message
pattern: '(?:shop\.md[^\n]*(?:overview|view|diagram)|(?:overview|view|diagram)[^\n]*shop\.md|```mermaid\s*\n\s*%%\s*view-of:\s*docs/architecture/shop\.json)'
match: contains
weight: 1
---

A model of ten components with no view anywhere is one only its author can picture: the agent
notices, and draws or plans an overview in the system spec, drawn from the model. The first
two repositories worked with the method had 32 and 43 components and no view (2026-09-25).
