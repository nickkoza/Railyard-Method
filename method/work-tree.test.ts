// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [G0i] — tier 1: the note a write leaves for the next one, so a later report is bounded to what
// that write actually touched, rather than to everything already true of the file (the Decisions).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { touchedNames } from "./work-tree.ts";

let root = "";

describe("touchedNames: what a write actually changed, from what the last one left", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "work-tree-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("reads every name as touched the first time it sees a file", () => {
    const things = [{ name: "a", witness: "1" }, { name: "b", witness: "2" }];
    assert.deepEqual(touchedNames(root, "f.py", things), new Set(["a", "b"]));
  });

  it("reads a name as touched only when its witness differs from what the last call left", () => {
    touchedNames(root, "f.py", [{ name: "a", witness: "1" }, { name: "b", witness: "2" }]);
    const touched = touchedNames(root, "f.py", [{ name: "a", witness: "1" }, { name: "b", witness: "9" }]);
    assert.deepEqual(touched, new Set(["b"]));
  });

  it("reads a name new since the last call as touched", () => {
    touchedNames(root, "f.py", [{ name: "a", witness: "1" }]);
    const touched = touchedNames(root, "f.py", [{ name: "a", witness: "1" }, { name: "c", witness: "3" }]);
    assert.deepEqual(touched, new Set(["c"]));
  });

  it("keeps one file's note apart from another's", () => {
    touchedNames(root, "f.py", [{ name: "a", witness: "1" }]);
    touchedNames(root, "g.py", [{ name: "a", witness: "9" }]);
    assert.deepEqual(touchedNames(root, "f.py", [{ name: "a", witness: "1" }]), new Set());
  });

  it("is undefined outside a git repository, where the note has nowhere fixed to live", () => {
    const bare = mkdtempSync(join(tmpdir(), "work-tree-nogit-"));
    try {
      assert.equal(touchedNames(bare, "f.py", [{ name: "a", witness: "1" }]), undefined);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
