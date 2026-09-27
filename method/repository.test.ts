// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [MVi] — tier 1, over a temp root. What a repository says about itself, as against what the
// method fixes for everyone.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARKER } from "./version.ts";
import { datedPaths, recordsAMoment } from "./repository.ts";

let root = "";

function marker(body: object): void {
  mkdirSync(join(root, ".railyard"), { recursive: true });
  writeFileSync(join(root, MARKER), `${JSON.stringify(body, null, 2)}\n`);
}

describe("the directories a repository says record a moment", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "repo-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("is empty where the repository says nothing: a repository is not assumed to have any", () => {
    assert.deepEqual(datedPaths(root), []);
  });

  it("is what the repository named", () => {
    marker({ method: "0.1.0", dated: ["docs/reviews/", "docs/spikes/"] });
    assert.deepEqual(datedPaths(root), ["docs/reviews/", "docs/spikes/"]);
  });

  it("is empty rather than fatal where the marker cannot be read", () => {
    mkdirSync(join(root, ".railyard"), { recursive: true });
    writeFileSync(join(root, MARKER), "{ not json");
    assert.deepEqual(datedPaths(root), []);
  });

  it("ignores entries that are not paths, rather than failing the whole list", () => {
    marker({ method: "0.1.0", dated: ["docs/reviews/", 7, ""] });
    assert.deepEqual(datedPaths(root), ["docs/reviews/"]);
  });

  it("reads a named file as well as a directory, because a register is one file", () => {
    marker({ method: "0.1.0", dated: ["docs/adr-numbers.md"] });
    assert.equal(recordsAMoment(root, "docs/adr-numbers.md"), true);
    assert.equal(recordsAMoment(root, "docs/adr-numbers.md.bak"), false);
  });

  it("matches a file inside a directory it named, and nothing outside it", () => {
    marker({ method: "0.1.0", dated: ["docs/reviews/"] });
    assert.equal(recordsAMoment(root, "docs/reviews/2026-01-01-pass.md"), true);
    assert.equal(recordsAMoment(root, "docs/specs/desk.md"), false);
    // A sibling whose name merely starts the same way is not inside it.
    assert.equal(recordsAMoment(root, "docs/reviews-archive/x.md"), false);
  });
});
