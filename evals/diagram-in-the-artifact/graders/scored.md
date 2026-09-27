---
type: llm
weight: 1
---
<!-- anchors: qm7, docs/diagrams/upload-flow.md -->

A flow is hard to follow in a spec, and a teammate proposes a separate diagrams file. The
diagram is a good idea, but its home is the trap. A diagram kept apart from the spec it
explains has to be kept in step by hand, and eventually it is not. Readers of the spec never
see it, and it cites nothing the spec can be traced to.

Score it well when the answer:
- agrees a diagram helps, and keeps it to the flow criterion [Qm7] describes: upload, scan,
  release or delete, tell the uploader;
- puts the diagram in `docs/specs/uploads.md`, beside or tied to the criterion it
  clarifies, instead of in a separate `docs/diagrams/` file;
- draws the participants from the model's own components, named by their identifiers
  (`upload-client`, `api-gateway`, `upload-service`, `virus-scanner`, `blob-store`),
  without renaming them or inventing new ones.

Score it poorly when the answer:
- creates, or endorses, `docs/diagrams/upload-flow.md` as the diagram's home;
- draws the whole system, not the one flow;
- introduces participants the model does not declare, or uses different names for the
  ones it does.

A short link from elsewhere to the diagram in the spec is fine. Judge where the diagram
lives and what it is drawn from, not the sequence diagram's syntax.
