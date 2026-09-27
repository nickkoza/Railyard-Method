---
max_turns: 8
allowed_tools: [Skill]
---

Covers: Before you write code

You have been asked to add a new acceptance criterion to a repository's spec for its export
feature: exports over 10,000 rows run in the background and the user is emailed a link.

The repository looks like this:

```
.railyard/method.json      { "method": "0.1.0" }
architecture/app.json
docs/adr/004-queue.md
docs/specs/export.md
package.json               "calm:validate": "calm validate -a architecture/app.json"
src/export/...
```

Say what you would do, in order, before writing the criterion. Do not edit any file.
