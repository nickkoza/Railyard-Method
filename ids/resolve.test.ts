// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `npm run ids:resolve` — what a stable ID names, for a person reading a migrated artifact.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveIds } from "./resolve.ts";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "ids-resolve-"));
  mkdirSync(join(root, "docs/specs"), { recursive: true });
  mkdirSync(join(root, "docs/waymarks"), { recursive: true });
  writeFileSync(join(root, "docs/specs/widget.md"), "# Widget\n\n**Type:** Capability spec · **ID:** [aB1]\n\n## Acceptance criteria\n\n1. [cD2] The widget spins when asked.\n2. [eF3] It stops.\n");
  writeFileSync(join(root, "docs/waymarks/002-second.md"), "# ADR-002 — Second\n\n**Status:** Accepted · **ID:** [gH4]\n");
  return root;
}

describe("ids:resolve", () => {
  it("names the spec an artifact ID belongs to", () => {
    const root = repo();
    assert.deepEqual(resolveIds(root, ["aB1"]), [{ id: "aB1", label: "the spec", path: "docs/specs/widget.md", text: "Widget" }]);
    rmSync(root, { recursive: true, force: true });
  });

  it("names the criterion a criterion ID belongs to, with its opening words", () => {
    const root = repo();
    assert.equal(resolveIds(root, ["cD2"])[0]?.label, "a criterion");
    assert.match(resolveIds(root, ["cD2"])[0]?.text ?? "", /The widget spins/);
    rmSync(root, { recursive: true, force: true });
  });

  it("keeps a criterion's ID pointing at it after a renumber", () => {
    const root = repo();
    writeFileSync(join(root, "docs/specs/widget.md"), "# Widget\n\n**ID:** [aB1]\n\n## Acceptance criteria\n\n1. [xY8] Inserted.\n2. [cD2] The widget spins when asked.\n");
    assert.match(resolveIds(root, ["cD2"])[0]?.text ?? "", /The widget spins/);
    rmSync(root, { recursive: true, force: true });
  });

  it("says plainly when an ID names nothing", () => {
    const root = repo();
    assert.deepEqual(resolveIds(root, ["zZ9"]), [{ id: "zZ9", label: null, path: null, text: null }]);
    rmSync(root, { recursive: true, force: true });
  });

  it("names a waymark", () => {
    const root = repo();
    assert.deepEqual([resolveIds(root, ["gH4"])[0]?.label, resolveIds(root, ["gH4"])[0]?.path], ["a waymark", "docs/waymarks/002-second.md"]);
    rmSync(root, { recursive: true, force: true });
  });

  it("names each numbered decision inside a waymark, with its opening words", () => {
    const root = repo();
    writeFileSync(join(root, "docs/waymarks/002-second.md"), "# ADR-002 — Second\n\n**ID:** [gH4]\n\n## Decisions\n\n1. [jK5] **Keep it small.** Nothing more.\n2. [mN6] **Then stop.**\n");
    assert.deepEqual([resolveIds(root, ["mN6"])[0]?.label, resolveIds(root, ["mN6"])[0]?.path], ["a decision", "docs/waymarks/002-second.md"]);
    assert.match(resolveIds(root, ["jK5"])[0]?.text ?? "", /Keep it small/);
    rmSync(root, { recursive: true, force: true });
  });

  it("names a decision in a spec's own Decisions as that spec's decision, not a criterion", () => {
    const root = repo();
    writeFileSync(join(root, "docs/specs/widget.md"), "# Widget\n\n**ID:** [aB1]\n\n## Acceptance criteria\n\n1. [cD2] It spins.\n\n## Decisions\n\n1. [pQ7] **Spins clockwise.** Conventional.\n");
    assert.equal(resolveIds(root, ["pQ7"])[0]?.label, "a decision");
    assert.equal(resolveIds(root, ["cD2"])[0]?.label, "a criterion");
    rmSync(root, { recursive: true, force: true });
  });

  it("prints an ID with what it is and its file, and never a form the check would report", () => {
    const root = repo();
    const r = spawnSync(process.execPath, ["--experimental-strip-types", join(import.meta.dirname, "../bin/railyard-ids-resolve.ts"), "cD2", "gH4"], { cwd: root, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[cD2\]  a criterion  \(docs\/specs\/widget\.md\)/);
    assert.match(r.stdout, /\[gH4\]  a waymark  \(docs\/waymarks\/002-second\.md\)/);
    assert.doesNotMatch(r.stdout, /`widget` criterion|criterion 1|\] *ADR-002/);
    rmSync(root, { recursive: true, force: true });
  });
});
