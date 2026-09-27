// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The library by its package name ([QBm]): another tool imports the two queries as
// `@railyard/traceability`, not by a path into this directory. Tier 1.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as byName from "@railyard/traceability";
import * as byPath from "./index.ts";

describe("@railyard/traceability, imported by its package name", () => {
  it("exports the two queries, the same functions as the directory's own index", () => {
    assert.equal(typeof byName.traceBackward, "function");
    assert.equal(typeof byName.traceForward, "function");
    assert.equal(byName.traceBackward, byPath.traceBackward);
    assert.equal(byName.traceForward, byPath.traceForward);
  });
});
