// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [o7Y] — tier 1, over a temp root. A repository records the method version it was built under,
// so a later skill can carry it forward rather than misread it.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARKER, METHOD_VERSION, plan, readMethodVersion, writeMethodVersion } from "./version.ts";

let root = "";

function record(version: string): void {
  mkdirSync(join(root, ".railyard"), { recursive: true });
  writeFileSync(join(root, MARKER), `${JSON.stringify({ method: version }, null, 2)}\n`);
}

describe("the method version a repository records", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "method-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("is written where it is looked for, and read back", () => {
    writeMethodVersion(root, METHOD_VERSION);
    assert.equal(readMethodVersion(root), METHOD_VERSION);
    assert.match(readFileSync(join(root, MARKER), "utf8"), /"method"/);
  });

  it("is written without losing any other field the repository keeps in the marker", () => {
    mkdirSync(join(root, ".railyard"), { recursive: true });
    writeFileSync(join(root, MARKER), `${JSON.stringify({ dated: ["docs/reviews/"] })}\n`);
    writeMethodVersion(root, METHOD_VERSION);
    const kept = JSON.parse(readFileSync(join(root, MARKER), "utf8")) as { dated?: unknown; method?: unknown };
    assert.deepEqual(kept.dated, ["docs/reviews/"]);
    assert.equal(kept.method, METHOD_VERSION);
  });

  it("is absent in a repository the skill has not worked in", () => {
    assert.equal(readMethodVersion(root), null);
  });

  it("is absent, rather than a crash, when the marker cannot be read as the record it should be", () => {
    mkdirSync(join(root, ".railyard"), { recursive: true });
    writeFileSync(join(root, MARKER), "{ not json");
    assert.equal(readMethodVersion(root), null);
  });
});

describe("[o7Y]: what a skill does about the version it finds", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "method-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("writes the version where there is none: a repository it has not worked in is not refused", () => {
    const what = plan(root);
    assert.equal(what.do, "record");
    assert.equal(what.to, METHOD_VERSION);
  });

  it("does nothing where the version is the one it works to", () => {
    record(METHOD_VERSION);
    assert.equal(plan(root).do, "nothing");
  });

  it("upgrades where the version is older, and says what it is carrying forward from", () => {
    record("0.0.1");
    const what = plan(root);
    assert.equal(what.do, "upgrade");
    assert.equal(what.from, "0.0.1");
    assert.equal(what.to, METHOD_VERSION);
  });

  it("refuses a version from the future, and changes nothing", () => {
    record("99.0.0");
    const what = plan(root);
    assert.equal(what.do, "refuse");
    assert.match(what.why, /99\.0\.0/);
    // The marker is the repository's, and a skill that does not understand it does not rewrite it.
    assert.equal(readMethodVersion(root), "99.0.0");
  });

  it("refuses a version it cannot read as a version, rather than guessing at its order", () => {
    record("tuesday");
    assert.equal(plan(root).do, "refuse");
  });
});
