// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [MVi]: the conventional paths, which travel with the method rather than being configured.
//
// `docs/architecture/*.json` is a model; `docs/specs/*.md`, `docs/waymarks/*.md` and
// `docs/principles/*.md` are a specification, a waymark and a principle. Every artifact is under
// `docs/`, and each directory is named for what it holds (0.2.0, the owner, 2026-09-23). Nothing deeper and nothing elsewhere is
// an artifact ([ZNz]).
//
// These are arbitrary, and that is exactly why they are fixed rather than configured: the whole of
// their value is that everyone picks the same ones. A repository that invents its own layout is one
// every other tool has to be taught, and a repository built with the skill has to be readable by
// Railyard with nothing set up ([ZNz]). They can be changed — [o7Y] is what carries existing
// repositories across when one moves — but not per repository.
//
// What is genuinely Railyard's own is not here: the name of its model file, its registers, and the
// directories of dated documents its checks skip. Those are this repository's facts, and belong to
// this repository's configuration.

/** Where each kind of artifact lives, relative to a repository's root. */
export const ARTIFACT_PATHS = {
  /** Specifications: a `.md` file directly under this. */
  specs: "docs/specs",
  /** Waymarks: a `.md` file directly under this. */
  waymarks: "docs/waymarks",
  /** Principles: a `.md` file directly under this. */
  principles: "docs/principles",
  /** Architecture models: a `.json` file directly under this. */
  models: "docs/architecture",
} as const;

/** The four, in the order a reader meets them, for a check or a message that wants them all. */
export const CONVENTIONAL_PATHS = [
  ARTIFACT_PATHS.specs,
  ARTIFACT_PATHS.waymarks,
  ARTIFACT_PATHS.principles,
  ARTIFACT_PATHS.models,
] as const;

/** Where no code of the repository's own is kept: the artifacts, the records, the agent's configuration and what tools keep. */
export const NOT_SOURCE = /^(?:docs|symbols|\.claude|\.railyard|\.git|node_modules)\//;

/** Code, by its extension, as the architecture check reads source ([C4P]), with tests counted: a test links to what it tests. */
const CODE = /\.(?:[cm]?[jt]sx?|rs|py)$/;

/**
 * Whether a repository path is the repository's own code: what links are kept for ([CS8]), and all
 * a commit's message links when it cites something (traceability's Decisions). Not a manifest, a
 * document, the symbols directory, or the agent's own configuration under `.claude/`.
 */
export function isCode(path: string): boolean {
  return CODE.test(path) && !NOT_SOURCE.test(path);
}

/** Whether a repository path is an artifact: a `.md` directly under specs, waymarks or principles, or a `.json` model directly under architecture ([ZNz]). */
export function isArtifact(path: string): boolean {
  const at = path.lastIndexOf("/");
  const dir = path.slice(0, at);
  if (dir === ARTIFACT_PATHS.models) return path.endsWith(".json");
  return path.endsWith(".md") && (dir === ARTIFACT_PATHS.specs || dir === ARTIFACT_PATHS.waymarks || dir === ARTIFACT_PATHS.principles);
}
