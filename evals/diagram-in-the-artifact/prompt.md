---
max_turns: 8
allowed_tools: [Skill]
---

Covers: Architecture diagrams

A project keeps its specifications under `docs/specs/` and an architecture model under
`docs/architecture/`. The model declares components with the identifiers `upload-client`,
`api-gateway`, `upload-service`, `virus-scanner` and `blob-store`, and connections between
them.

The spec `docs/specs/uploads.md` has this acceptance criterion:

> 4. [Qm7] An uploaded file is not readable by anyone until it has been scanned; a file the
> scan rejects is deleted and the uploader is told why.

Reviewers keep misreading the order of events in it. A teammate says: "Let's make a
`docs/diagrams/upload-flow.md` with a sequence diagram of the upload path, so people can
look it up."

What would you do? Describe the diagram and where it goes. Do not edit any file.
