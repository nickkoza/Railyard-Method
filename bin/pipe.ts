// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// A command whose reader stops reading, as `links <file> | head` does, stops quietly (traceability's
// failure behaviour). Node reports the closed pipe as an unhandled 'error' event on stdout, a stack
// trace an agent reads as the command failing; here it is the reader's choice, and nothing to say.
// Everything else stays loud.

/** What a write to a pipe whose reader has gone reports: the closed pipe, and every write after it. */
const GONE: ReadonlySet<string> = new Set(["EPIPE", "ERR_STREAM_DESTROYED"]);

/** Lets the command finish its work, with its own exit status, once its output has no reader. */
export function quietWhenTheReaderGoes(): void {
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (!GONE.has(error.code ?? "")) throw error;
    });
  }
}
