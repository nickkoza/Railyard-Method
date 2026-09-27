# [MSW] — The index core is Rust, it lives in the method's repository, and what ships is WASM

**Status:** Accepted · **Date:** 2026-09-21 · **Source:** the owner, 2026-09-21: "pin down the layout and convert to Rust within Railyard-method, knowing we'll eventually probably split it to Railyard-cli as we want to expand its features", and "don't ship Rust in the skill. Ship the WASM" · **Builds on:** [8rB], [QBm], [lWl] · **ID:** [MSW]

## Context

[8rB] puts a derived index between the record and the queries. This decides what writes and
reads it, where that code lives, and what a consumer receives.

The measurements that bound it, all 2026-09-21 on this machine: a query must answer inside
50 ms with start-up counted; Node starts in 22 ms and pays 26 ms more to strip types at run
time; Python starts in 9 ms, 17 ms with the modules this design needs; importing the schema
validator costs 67 ms, which the index's layout removes by needing no validation at all.
Against that budget, language choice is worth about 20 ms and the format is worth 1.6
seconds — which is why [8rB] was decided first and separately.

So this is not a decision the numbers force. The owner's reason is a preference plainly
stated — JavaScript where the UI makes it make sense, and away from it where it does not —
and a preference about the language one works in every day is a real requirement, not a
lesser kind of one. What the numbers do is set the floor: whatever is chosen has to make
50 ms comfortably, and Rust makes it by an order of magnitude.

**The reader has three callers**, which is what made this more than picking a language: the
CLI, the daemon, and the browser tool that [QBm] already promises. One implementation
serving all three is why the reader is TypeScript today. Rust compiles to a native binary
*and* to WebAssembly, so it keeps that property rather than splitting it — and the browser
tool needs WebAssembly whether or not the CLI does.

## Decisions

1. [e4q] **The index is built and read by Rust.** Building and querying the derived index
   is the whole of its scope. The record itself — walking git, reading artifacts, writing
   the JSON — stays where it is for now; [qHR] already separates making the record from
   answering from it, and this decision follows that seam rather than cutting a new one.

2. [bsU] **It lives in the method's repository, and is expected to leave.** Not because the
   two belong together permanently, but because a cycle is easier to avoid than to break: a
   separate repository would depend on the method to be developed in, while the method
   depends on its build artifact to ship. That is a bootstrap — soluble by versioning each
   against the other's previous release — and it is not worth paying for until the CLI has
   features of its own to justify it.

   When it leaves, the pinned layout is what makes the move mechanical. That is the second
   reason the layout is written down where the format is, rather than left to the code.

3. [gR2] **What the package ships is WebAssembly, not Rust and not a native binary.** A
   consumer installing the skill gets one portable artifact that runs wherever Node runs.
   Shipping source would need a Rust toolchain on their machine; shipping native binaries
   would need one build per platform triple and a mechanism to pick among them. WebAssembly
   is one file for every platform, which is the property being bought — the same property
   that makes the browser tool possible at all.

   A native binary is a better answer for someone who wants the CLI on its own, and that is
   a distribution to add when there is a CLI to distribute, not a reason to hold this.

4. [Ah3] **The TypeScript reader stays until the Rust one has out-argued it, and the two are
   tested against each other.** Two implementations of one pinned layout, run over the same
   corpus and required to agree, is stronger evidence than either alone: a disagreement is
   a defect in one of them and there is no third thing to blame. Keeping it is also what
   makes the WebAssembly optional rather than required — a consumer without it still gets
   answers, slowly.

   This is temporary by construction. Two implementations is a cost, and it is paid to
   retire one of them.

5. [WfO] **Nothing here is built until a toolchain is present, and its absence is said
   rather than worked around.** An agent that meets a machine without Rust and quietly
   writes the TypeScript version instead has made a decision this record says was already
   made differently; it says so and stops.

   Installed on this machine 2026-09-21: rustc 1.98.1, cargo 1.98.1, with the
   `wasm32-unknown-unknown` target — which is the one [gR2] needs, and is worth naming
   because a toolchain that builds natively and cannot build the shipped artifact is a
   toolchain that is not present for this purpose.

## Consequences

The gate gains a second toolchain, and the build gains an artifact that is compiled rather
than interpreted. A WebAssembly file checked into the method's package is a build output in
a repository — the thing [LeJ] just refused for the index — and the difference has to be
held to: the index is derived per machine and throw-away, while this is built once by a
release and shipped. It is reproducible from the source beside it, and that is what makes
it defensible rather than the same mistake.

`railyard-method` stops being a package anyone can read end to end in one language. That is
a real loss for a repository whose point is that its method is legible, and it is the price
of the reader being fast enough to run from a keystroke.
