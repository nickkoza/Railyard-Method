// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [ei5] — tier 1. What of a line is comment text, and so can cite: all of a comment line, and a
// code line from a trailing marker that stands outside any quoted run. Nothing in a string cites.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commentOf } from "./scope.ts";

describe("[ei5]: the comment text of a line", () => {
  it("is all of a comment line, in any of the markers", () => {
    for (const line of ["// ADR-001", "  /* ADR-001", " * ADR-001", "# ADR-001", "-- ADR-001", "; ADR-001", "<!-- ADR-001 -->"]) {
      assert.equal(commentOf(line), line.trimStart(), line);
    }
  });

  it("is nothing on a code line with no comment, however much it looks like a citation", () => {
    assert.equal(commentOf('writeFileSync(join(root, "docs/specs/widget.md"), "# Widget");'), "");
    assert.equal(commentOf("const label = `ADR-001 and CALM node \\`widget\\``;"), "");
    assert.equal(commentOf("  architecture: 'docs/architecture/model.json#widget',"), "");
  });

  it("is a trailing comment on a code line, from its marker", () => {
    assert.equal(commentOf("const x = 1; // ADR-001"), "// ADR-001");
    assert.equal(commentOf("value = compute()  # ADR-001"), "# ADR-001");
    assert.equal(commentOf("<div>x</div> <!-- ADR-001 -->"), "<!-- ADR-001 -->");
  });

  it("does not take a marker inside a quoted run for a comment", () => {
    assert.equal(commentOf('const url = "https://example.com/ADR-001";'), "");
    assert.equal(commentOf("const s = '# not a comment ADR-001';"), "");
    assert.equal(commentOf('const s = "a // b ADR-001"; // real ADR-002'), "// real ADR-002");
    assert.equal(commentOf('const s = "say \\"// no\\" ADR-001";'), "", "an escaped quote does not end the run");
  });

  it("does not take a marker glued to code for a comment", () => {
    assert.equal(commentOf("this.#field = 1;"), "", "a private field is not a # comment");
    assert.equal(commentOf("i--; j = k; ADR-001"), "", "-- and ; never start a trailing comment");
  });

  it("does not take Markdown emphasis for the * of a comment block", () => {
    assert.equal(commentOf("**Where it goes:** in `docs/specs/uploads.md`."), "");
    assert.equal(commentOf("*emphasis* on ADR-001"), "");
    assert.equal(commentOf(" * ADR-001, a block's continuation"), "* ADR-001, a block's continuation");
    assert.equal(commentOf(" */"), "*/");
    assert.equal(commentOf(" *"), "*");
  });
});
