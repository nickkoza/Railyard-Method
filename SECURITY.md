# Security

This repository ships a Claude Code skill and a small set of CLI tools that read and write
files in a repository they are run in. It runs no server and holds no user data of its own.

## Reporting a vulnerability

If you find a security issue — anything from a path that escapes the repository it was
given, to a bundled dependency with a known CVE — please report it privately rather than
opening a public issue:

- Use GitHub's [private vulnerability reporting](https://github.com/nickkoza/Railyard-Method/security/advisories/new)
  for this repository, if it is enabled, or
- Email the maintainer directly with the details, what you expected, and what you found
  instead — enough to reproduce it.

Please do not open a public issue or pull request for a vulnerability before it has been
triaged.

## What to expect

We'll acknowledge a report within a few days, confirm whether it's in scope, and let you
know the plan for a fix. Once a fix ships, we'll credit the report unless you'd rather stay
anonymous.

## Scope

In scope: the CLI tools (`ids-take`, `ids-resolve`, `check`, `trace`, `upgrade`, the skill's
bundled `railyard.mjs`), how they read and write files, and the bundled third-party
dependency (`zod`). Out of scope: Railyard itself, the owner's separate application that
consumes this method — report issues in that project to its own repository.
