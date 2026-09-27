// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard-trace ([QBm]): which artifacts caused a line, and which
// source positions trace to an artifact. It reads one commit of a repository,
// and answers as text or as JSON, with no daemon and no desk. Its exit status
// is 0 when it answered, untraced included; 1 when it could not answer; and 2
// when it was used wrongly.
import { stampBuild } from "./build-hash.ts";
import { GitFailure } from "./git.ts";
import { indexCommit } from "./indexing.ts";
import { lookUp } from "./lookup.ts";
import { TraceRefusal } from "./model.ts";
import { traceBackward, traceForward } from "./query.ts";
import { renderBackward, renderForward, renderIndexed, renderStamped, renderSymbols } from "./render.ts";

const USAGE = [
  "usage: railyard-trace <file>:<line> | <ID> [--repo <dir>] [--at <commit>] [--json]",
  "       railyard-trace backward <file>:<line>[:<column>] [--repo <dir>] [--at <commit>] [--json]",
  "       railyard-trace backward <file>:<line>[:<column>] --symbols <dir> [--build <hash>]",
  "                                [--built <dir>] [--root <dir>] [--json]",
  "       railyard-trace forward <artifact> [--repo <dir>] [--at <commit>] [--json]",
  "       railyard-trace index --symbols <dir> [--repo <dir>] [--at <commit>] [--build <hash>]... [--json]",
  "       railyard-trace stamp <path>... [--json]",
  "",
  "  <file>:<line>, <ID>     backward from a position, and forward from an artifact's ID ([Ay4], or Ay4)",
  "  backward <file>:<line>  the artifacts that caused the line; the file is relative to the repository's root.",
  "                          With --symbols it is answered from the symbols file, reading no repository",
  "  forward <artifact>      the source positions that trace to an artifact, named by its stable ID as it is",
  "                          cited ([Ay4], or Ay4), by its file and its ID (docs/specs/x.md#Ay4), by its path",
  "                          (docs/specs/x.md), or a model's node by its file and unique-id (docs/architecture/y.json#node)",
  "  index                   writes the commit's symbols into a symbols directory, from what backward reads",
  "  stamp <path>...         computes the hash of the build made of those files and directories, and writes",
  "                          it into each file whose kind has a place for it. It prints the hash",
  "  --repo <dir>            the repository (default: the working directory)",
  "  --at <commit>           the commit to read (default: HEAD); the working tree is never read",
  "  --symbols <dir>         the symbols directory; index makes it when it is not there",
  "  --build <hash>          the build whose version answers; index takes it more than once, and",
  "                          backward takes one. Without it the newest version answers",
  "  --built <dir>           the built output the file is in; its source map takes the position back to",
  "                          its source. Code with no source map is traced at its own positions",
  "  --root <dir>            the tree the symbols file's paths are relative to (default: the root the",
  "                          symbols directory records), against which a mapped source is named",
  "  --json                  the answer as JSON",
].join("\n");

class UsageError extends Error {}

type Options = { readonly repo: string; readonly at: string | undefined; readonly json: boolean };

type Command =
  | { readonly command: "help" }
  | (Options & {
    readonly command: "backward";
    readonly path: string;
    readonly line: number;
    readonly column: number | undefined;
    /** When given, the answer comes from the symbols file rather than from the repository. */
    readonly symbols: string | undefined;
    readonly build: string | undefined;
    readonly built: string | undefined;
    readonly root: string | undefined;
  })
  | (Options & { readonly command: "forward"; readonly reference: string })
  | (Options & { readonly command: "index"; readonly symbols: string; readonly builds: readonly string[] })
  | { readonly command: "stamp"; readonly paths: readonly string[]; readonly json: boolean };

/** Options that take a value; `--build` may be given more than once, and for the rest the last given wins. */
const VALUED: readonly string[] = ["--repo", "--at", "--symbols", "--build", "--built", "--root"];
/** What each command takes. An option a command does not take is a usage error, never quietly ignored. */
const TAKES: Readonly<Record<string, readonly string[]>> = {
  backward: ["--repo", "--at", "--json", "--symbols", "--build", "--built", "--root"],
  forward: ["--repo", "--at", "--json"],
  index: ["--repo", "--at", "--json", "--symbols", "--build"],
  stamp: ["--json"],
};

function parse(argv: readonly string[]): Command {
  if (argv.includes("--help") || argv.includes("-h")) return { command: "help" };
  const positional: string[] = [];
  const given = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--json") {
      given.set(arg, []);
    } else if (VALUED.includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined) throw new UsageError(`${arg} needs a value`);
      given.set(arg, [...(given.get(arg) ?? []), value]);
      i += 1;
    } else if (arg.startsWith("-")) {
      throw new UsageError(`unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  // A query as it is written ([QBm]): a position asks backward, an ID forward, with no command word.
  const first = positional[0] ?? "";
  if (TAKES[first] === undefined) {
    if (/^\[?[A-Za-z0-9]{3}\]?$/.test(first)) positional.unshift("forward");
    else if (/^.+:\d+(?::\d+)?$/.test(first)) positional.unshift("backward");
  }
  const [command, target, ...rest] = positional;
  if (command === undefined) throw new UsageError("a command is needed");
  const takes = TAKES[command];
  if (takes === undefined) throw new UsageError(`unknown command ${command}`);
  for (const option of given.keys()) {
    if (!takes.includes(option)) throw new UsageError(`${command} does not take ${option}`);
  }
  const options = { repo: given.get("--repo")?.at(-1) ?? process.cwd(), at: given.get("--at")?.at(-1), json: given.has("--json") };
  if (command === "stamp") {
    const paths = positional.slice(1);
    if (paths.length === 0) throw new UsageError("stamp takes the files and directories the build is made of");
    return { command, paths, json: options.json };
  }
  if (command === "index") {
    if (target !== undefined) throw new UsageError("index takes no argument; it reads the whole commit");
    const symbols = given.get("--symbols")?.at(-1);
    if (symbols === undefined) throw new UsageError("index needs --symbols <dir>");
    return { command, symbols, builds: given.get("--build") ?? [], ...options };
  }
  if (target === undefined || rest.length > 0) throw new UsageError(`${command} takes one ${command === "backward" ? "<file>:<line>" : "<artifact>"}`);
  if (command === "forward") return { command, reference: target, ...options };
  const position = /^(.+?):(\d+)(?::(\d+))?$/.exec(target);
  if (position === null) throw new UsageError(`${target} is not <file>:<line>`);
  const symbols = given.get("--symbols")?.at(-1);
  const column = position[3] === undefined ? undefined : Number(position[3]);
  if (symbols === undefined) {
    for (const option of ["--build", "--built", "--root"]) {
      if (given.has(option)) throw new UsageError(`${option} is read with the symbols, so it needs --symbols <dir>`);
    }
    if (column !== undefined) throw new UsageError("a column is answered from a symbols directory, so it needs --symbols <dir>");
  } else if (given.has("--repo") || given.has("--at")) {
    throw new UsageError("backward from a symbols directory reads no repository, so it takes neither --repo nor --at");
  }
  return {
    command: "backward",
    path: position[1] ?? "",
    line: Number(position[2]),
    column,
    symbols,
    build: given.get("--build")?.at(-1),
    built: given.get("--built")?.at(-1),
    root: given.get("--root")?.at(-1),
    ...options,
  };
}

function answer(command: Exclude<Command, { readonly command: "help" }>): string {
  if (command.command === "backward") {
    if (command.symbols !== undefined) {
      const read = lookUp({ symbols: command.symbols, build: command.build, path: command.path, line: command.line, column: command.column, built: command.built, root: command.root });
      return command.json ? `${JSON.stringify(read, null, 2)}\n` : renderSymbols(read);
    }
    const found = traceBackward({ repo: command.repo, at: command.at, path: command.path, line: command.line });
    return command.json ? `${JSON.stringify(found, null, 2)}\n` : renderBackward(found);
  }
  if (command.command === "index") {
    const done = indexCommit({ repo: command.repo, at: command.at, symbols: command.symbols, builds: command.builds });
    return command.json ? `${JSON.stringify(done, null, 2)}\n` : renderIndexed(done);
  }
  if (command.command === "stamp") {
    const stamped = stampBuild(command.paths);
    return command.json ? `${JSON.stringify(stamped, null, 2)}\n` : renderStamped(stamped);
  }
  const found = traceForward({ repo: command.repo, at: command.at, reference: command.reference });
  return command.json ? `${JSON.stringify(found, null, 2)}\n` : renderForward(found);
}

export function main(argv: readonly string[]): number {
  let command: Command;
  try {
    command = parse(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`railyard-trace: ${error.message}\n${USAGE}\n`);
    return 2;
  }
  if (command.command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  try {
    process.stdout.write(answer(command));
    return 0;
  } catch (error) {
    // Git failing where the query could not go on is said in words, never thrown raw (traceability's Decisions).
    if (!(error instanceof TraceRefusal) && !(error instanceof GitFailure)) throw error;
    process.stderr.write(`railyard-trace: ${error.message}\n`);
    return 1;
  }
}

