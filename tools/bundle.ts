// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The skill's tools, bundled into its folder ([18E]): `bin/railyard.ts` and everything it imports,
// its one dependency inside, as a single file Node 24 runs with nothing installed. The output is
// committed, and `skills/tools.test.ts` holds it to being what this builds.
//
// `legalComments: "none"` drops esbuild's own carrying of a bundled package's licence comments, so
// nothing does that carrying but this file: `bundledPackages` names what actually went in, from
// esbuild's own record of what it read, and `notices.test.ts` holds `THIRD_PARTY_NOTICES.md` to
// naming each one, so a dependency bundled with no notice fails the build's own test rather than
// shipping quietly.
import { buildSync } from "esbuild";
import { join } from "node:path";

/** Where the skill carries its tools, from the repository's root. */
export const TOOLS = "skills/spec-driven-change/tools/railyard.mjs";
/** Where the skill carries the licence notices of what it bundles, from the repository's root. */
export const NOTICES = "skills/spec-driven-change/THIRD_PARTY_NOTICES.md";

const ROOT = join(import.meta.dirname, "..");
const ENTRY = join(ROOT, "bin/railyard.ts");

/**
 * The npm packages actually bundled into the tools — not `dependencies`, which can list a package
 * nothing imports, or a type-only one esbuild never reads. Read from esbuild's own metafile: every
 * input it bundled, filtered to those under a `node_modules/<package>/`, scoped packages included.
 */
export function bundledPackages(): readonly string[] {
  const result = buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const names = new Set<string>();
  for (const path of Object.keys(result.metafile?.inputs ?? {})) {
    const found = /(?:^|\/)node_modules\/(@[^/]+\/[^/]+|[^/]+)\//.exec(path);
    if (found?.[1] !== undefined) names.add(found[1]);
  }
  return [...names].sort();
}

export function bundleTools(outfile: string): void {
  buildSync({
    entryPoints: [ENTRY],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    legalComments: "none",
    logLevel: "silent",
    minifyWhitespace: true,
    minifySyntax: true,
    // A linter run at a repository's root would otherwise read this whole bundle as its own code ([4Ec]).
    banner: { js: "// Copyright 2026 Nicholas Koza\n// SPDX-License-Identifier: MIT\n// Built by `npm run tools:build` from this repository's source: edit that, not this.\n/* eslint-disable */\n// @ts-nocheck" },
  });
}
