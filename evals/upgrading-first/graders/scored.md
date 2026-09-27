---
type: llm
weight: 1
---
<!-- anchors: 0.1.0, calm:validate, docs/adr/ -->

The repository records method version 0.1.0 and is laid out the old way: its model under
`architecture/` and its waymarks under `docs/adr/`. The skill in use works to a newer
version. The trap is adding the criterion straight away, leaving the repository in a layout
no current tool reads, or moving the directories by hand.

Score it well when the answer:
- notices the recorded version is older than the one the skill works to, before anything
  else;
- upgrades first, with the method's upgrade command, not by moving directories by hand;
- plans to fix the files the upgrade reports as still naming an old path (here
  `package.json`'s `calm:validate`), as part of the same change;
- only then turns to the criterion itself.

Score it poorly when the answer:
- adds the criterion without mentioning the version or the layout;
- moves `architecture/` or `docs/adr/` itself, or renames paths across the repository with
  a script;
- treats the old layout as the repository's own convention to follow.

Judge the order and the reasoning, not the wording of the criterion.
