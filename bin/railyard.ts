#!/usr/bin/env node
// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard <command>: every command the skill tells an agent to run, in one entry point, which is
// what the skill carries bundled in its folder ([18E]). Each command is only called, never started
// by being imported: in a bundle every module shares one URL, so a module that ran itself when it
// was the program would run whenever any command did.
import { main as trace } from "../traceability/cli.ts";
import { main as idsTake } from "../ids/cli.ts";
import { main as idsResolve } from "../ids/resolve.ts";
import { main as check } from "../method/check-cli.ts";
import { main as upgrade } from "../method/upgrade-cli.ts";
import { main as links } from "../method/links-cli.ts";
import { main as install } from "../method/install.ts";
import { main as testsById } from "../method/tests-by-id.ts";
import { main as decisionsById } from "../method/decisions-by-id.ts";
import { quietWhenTheReaderGoes } from "./pipe.ts";

quietWhenTheReaderGoes();

const COMMANDS: Readonly<Record<string, (argv: readonly string[]) => number | Promise<number>>> = {
  check: (argv) => check(argv),
  trace,
  "ids-take": idsTake,
  "ids-resolve": idsResolve,
  upgrade,
  install,
  links: (argv) => links("links", argv),
  link: (argv) => links("link", argv),
  unlink: (argv) => links("unlink", argv),
  scan: (argv) => links("scan", argv),
  "tests-by-id": testsById,
  "decisions-by-id": decisionsById,
};

const USAGE = `usage: railyard <command> [...]\n  commands: ${Object.keys(COMMANDS).join(", ")}\n`;
const [command = "", ...rest] = process.argv.slice(2);
if (command === "--help" || command === "-h") {
  process.stdout.write(USAGE);
  process.exitCode = 0;
} else {
  const run = COMMANDS[command];
  if (run === undefined) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
  } else {
    process.exitCode = await run(rest);
  }
}
