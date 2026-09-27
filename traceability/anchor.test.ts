// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [LdF] — tier 1, pure. What a position NAMES, rather than where it sits. A link held by a
// file and a line is destroyed by an edit anywhere above it; a link held by the name of the
// thing it falls inside survives that, which is the whole point of the anchor.
//
// Deliberately a tolerant scan and not a parser (`traceability`'s Decisions): it runs on every
// write inside 200 ms, it cannot know one language's grammar from another's, and it does not
// need to be exact — where two things share a name, the witness hash is what tells them apart.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anchorAt, namedThings } from "./anchor.ts";

describe("the named thing a line falls inside", () => {
  it("names a function in TypeScript, from a line in its body", () => {
    const text = ["export function spin(n: number): number {", "  const out = n * 2;", "  return out;", "}"].join("\n");
    assert.deepEqual(anchorAt(text, 3), { kind: "name", name: "spin" });
  });

  it("names the declaration line itself, not whatever encloses it", () => {
    const text = ["function outer() {", "  function inner() {", "    return 1;", "  }", "}"].join("\n");
    assert.deepEqual(anchorAt(text, 2), { kind: "name", name: "inner" });
    assert.deepEqual(anchorAt(text, 3), { kind: "name", name: "inner" }, "a line in inner's body is inner's");
  });

  it("prefers the nearest enclosing thing, by indentation", () => {
    const text = ["class Yard {", "  arrive(train: string): void {", "    this.log(train);", "  }", "}"].join("\n");
    assert.deepEqual(anchorAt(text, 3), { kind: "name", name: "arrive" });
    assert.deepEqual(anchorAt(text, 1), { kind: "name", name: "Yard" });
  });

  it("names a const holding an arrow function, which is how much of this repository is written", () => {
    const text = ["const settle = (link: Link): State => {", "  return link.state;", "};"].join("\n");
    assert.deepEqual(anchorAt(text, 2), { kind: "name", name: "settle" });
  });

  it("reads languages it was not written for, because it looks at shape rather than grammar", () => {
    assert.deepEqual(anchorAt(["def spin(n):", "    return n * 2"].join("\n"), 2), { kind: "name", name: "spin" });
    assert.deepEqual(anchorAt(["func Spin(n int) int {", "\treturn n * 2", "}"].join("\n"), 2), { kind: "name", name: "Spin" });
    assert.deepEqual(anchorAt(["fn spin(n: u32) -> u32 {", "    n * 2", "}"].join("\n"), 2), { kind: "name", name: "spin" });
  });

  // Found by running this over the repository rather than over its own fixtures: every
  // fixture here happened to bind a function, and the pattern was matching any binding at all.
  it("does not name a local variable, because granularity stops at the function", () => {
    const text = ["export function stampInto(path: string): void {", "  const kind = kindOf(path);", "  return kind;", "}"].join("\n");
    assert.deepEqual(anchorAt(text, 2), { kind: "name", name: "stampInto" }, "the line declares a local, and the thing it is IN is the function");
    assert.deepEqual(anchorAt(text, 3), { kind: "name", name: "stampInto" });
  });

  it("still names a binding that holds a function, which is a thing and not a value", () => {
    const arrow = ["const settle = (n: number) => n * 2;"].join("\n");
    assert.deepEqual(anchorAt(arrow, 1), { kind: "name", name: "settle" });
    const expr = ["const spin = function (n) { return n; };"].join("\n");
    assert.deepEqual(anchorAt(expr, 1), { kind: "name", name: "spin" });
  });

  // Also found against the repository: `if (…) {` has exactly the shape of a method, and a
  // position inside a conditional was being named "if". A wrong name is worse than none,
  // because a reader believes it.
  it("does not name a control structure, which has the shape of a method and is not one", () => {
    for (const word of ["if", "for", "while", "switch", "catch", "do"]) {
      const text = ["function real() {", `  ${word} (x) {`, "    return 1;", "  }", "}"].join("\n");
      assert.deepEqual(anchorAt(text, 3), { kind: "name", name: "real" }, `${word} is not a name`);
    }
  });

  it("says span where nothing names the line, rather than inventing a name", () => {
    const text = ["// a comment at the top of a file", "", "import { a } from \"./a.ts\";"].join("\n");
    assert.deepEqual(anchorAt(text, 3), { kind: "span" });
  });

  it("does not mistake a call for a declaration", () => {
    const text = ["function real() {", "  spin(3);", "  helper(1);", "}"].join("\n");
    assert.deepEqual(anchorAt(text, 3), { kind: "name", name: "real" }, "a call inside a body is not the thing that names it");
  });

  it("answers span for a line outside the text rather than throwing", () => {
    assert.deepEqual(anchorAt("function a() {}\n", 99), { kind: "span" });
  });
});

describe("[5jT]: the named things in a file, each with its span and a witness of its own lines", () => {
  const source = [
    "class Arm:",
    "    def reach(self, x):",
    "        return x + 1",
    "",
    "    def grip(self):",
    "        return True",
    "",
    "def stow():",
    "    return 0",
    "",
  ].join("\n");

  it("names each thing by its qualified name, with the lines it spans", () => {
    const things = namedThings(source);
    assert.deepEqual(things.map((t) => [t.name, t.start, t.end]), [["Arm", 1, 6], ["Arm.reach", 2, 3], ["Arm.grip", 5, 6], ["stow", 8, 9]]);
  });

  it("changes a thing's witness when its own lines change, and leaves what encloses it current", () => {
    const before = new Map(namedThings(source).map((t) => [t.name, t.witness]));
    const after = new Map(namedThings(source.replace("return x + 1", "return x + 2")).map((t) => [t.name, t.witness]));
    assert.notEqual(after.get("Arm.reach"), before.get("Arm.reach"));
    assert.equal(after.get("Arm"), before.get("Arm"), "an edit inside a method leaves its class current");
    assert.equal(after.get("stow"), before.get("stow"));
  });

  it("keeps a witness through an edit above the thing, and through trailing whitespace", () => {
    const moved = `# a comment\n\n${source.replace("return 0", "return 0   ")}`;
    const before = namedThings(source).find((t) => t.name === "stow")?.witness;
    assert.equal(namedThings(moved).find((t) => t.name === "stow")?.witness, before);
  });

  it("closes a braced block on its closing brace, and tells two things of one name apart", () => {
    const ts = ["export function spin(n: number) {", "  return n;", "}", "", "function spin(n: number) {", "  return -n;", "}", ""].join("\n");
    assert.deepEqual(namedThings(ts).map((t) => [t.name, t.start, t.end]), [["spin", 1, 3], ["spin~2", 5, 7]]);
  });
});

describe("a test is a named thing, named by its title", () => {
  const suite = [
    'import { describe, it, test } from "node:test";',
    "",
    'test("adds a bookmark", () => {',
    "  assert.equal(add(), 1);",
    "});",
    "",
    "describe('search', () => {",
    "  it(`matches every word`, async () => {",
    "    assert.ok(true);",
    "  });",
    '  it.skip("ignores case", function () {',
    "    assert.ok(true);",
    "  });",
    "});",
    "",
    'assert.equal("not a test", value);',
    'it.each([1, 2])("is not named by a title it has not got yet %s", (n) => {',
    "  assert.ok(n);",
    "});",
    "",
  ].join("\n");

  it("names test(), it() and describe() by the title they are given, nested in the describe that holds them", () => {
    assert.deepEqual(namedThings(suite).map((t) => [t.name, t.start, t.end]), [
      ["adds a bookmark", 3, 5],
      ["search", 7, 14],
      ["search.matches every word", 8, 10],
      ["search.ignores case", 11, 13],
    ]);
  });

  it("names a line inside a test after the test", () => {
    assert.deepEqual(anchorAt(suite, 4), { kind: "name", name: "adds a bookmark" });
    assert.deepEqual(anchorAt(suite, 9), { kind: "name", name: "matches every word" });
  });
});
