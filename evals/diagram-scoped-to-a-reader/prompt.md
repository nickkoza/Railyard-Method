---
max_turns: 8
runs: 10
allowed_tools: [Skill]
---

Covers: Architecture diagrams

A project keeps an architecture model beside its code. These are the components it declares:

`web-desk`, `mobile-desk`, `ui-server`, `auth-proxy`, `daemon`, `supervisor`, `scheduler`,
`run-store`, `item-store`, `event-log`, `watermarks`, `checkpoints`, `library-index`,
`symbols-indexer`, `tower-agent`, `initiative-agent`, `sub-agent`, `sandbox`,
`egress-broker`, `credential-relay`, `model-provider`, `git-host`, `container-runtime`,
`control-network`, `worker-network`, `sandbox-network`, `audit-log`, `metrics-exporter`

and 61 connections between them.

The maintainer writes: "The README needs an architecture diagram. Can you draw it? Mermaid
is fine."

Reply with what you would put in the README. Do not edit any file.
