// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// CALM node `trace-library`: what the package exports for another tool to call, and the only
// public surface of traceability. The queries are [QBm]'s.
export { defaultAdapters, traceBackward, traceForward } from "./query.ts";
export type { BackwardQuery, ForwardQuery } from "./query.ts";
export { Artifact, BackwardAnswer, EVIDENCE, Evidence, ForwardAnswer, Link, Position, SOURCES, Source, State, TraceRefusal, Unreadable, Version } from "./model.ts";
export type { Adapter, Readings, Snapshot, SourcePath, TestNamed } from "./model.ts";
export { railyardAdapter } from "./railyard-adapter.ts";
export { calmAdapter } from "./calm-adapter.ts";
export { COMMENT_MARKERS, commentOf, scopeOf } from "./scope.ts";
export { renderBackward, renderForward, renderIndexed, renderSymbols } from "./render.ts";
// The symbols file itself, producing one, and answering from one ([LRA], [LPv], [QBm]).
export { FORMAT, FORMAT_VERSION, readSymbols, SymbolLink, VERSION_FORMAT, writeVersion } from "./symbols.ts";
export type { Place, Resolved, SymbolPosition, Symbols, Written } from "./symbols.ts";
export { lookUp, SymbolsAnswer } from "./lookup.ts";
export type { LookupQuery } from "./lookup.ts";
// The build hash: the one thing that rides in a built artifact ([DHL]).
export { BUILD_HASH, buildHash, stampBuild, StampAnswer, stampInto, stampOf, SYMBOLS_VERSION, versionOf } from "./build-hash.ts";
export type { BuildFile } from "./build-hash.ts";
// Mapping what was built back to its source ([BKY]).
export { readSourceMap } from "./source-map.ts";
export type { SourceMap, SourceMapping } from "./source-map.ts";
export { traceAll } from "./query.ts";
export type { AllAnswer, AllQuery, Traced } from "./query.ts";
export { IndexAnswer, indexCommit } from "./indexing.ts";
export type { IndexQuery } from "./indexing.ts";
