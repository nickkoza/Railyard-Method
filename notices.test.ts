// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// Every source file opens with its copyright notice, and the skill carries its licence.
//
// Files are taken one at a time, and a file lifted out of this repository should still say whose
// it is and that it is MIT. Railyard, which uses this package, is under a different licence, and
// code has already moved between the two, so each file names its own. The skill is the file most
// often copied on its own: installing it copies its directory and leaves `LICENSE` behind, so its
// frontmatter carries the licence instead.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bundledPackages, NOTICES } from "./tools/bundle.ts";

const ROOT = import.meta.dirname;
const COPYRIGHT = "Copyright 2026 Nicholas Koza";
const LICENCE = "SPDX-License-Identifier: MIT";
const SOURCE = /\.(ts|js|rs|py|toml)$/;

/** A bundled package's own licence file, wherever it kept one, read whole. */
function licenceOf(pkg: string): string {
  for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE"]) {
    const path = join(ROOT, "node_modules", pkg, name);
    try {
      return readFileSync(path, "utf8").trim();
    } catch {
      continue;
    }
  }
  throw new Error(`${pkg} carries no LICENSE file this can read, so its notice cannot be checked`);
}

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => SOURCE.test(f));

describe("copyright notices", () => {
  it("opens every source file with the copyright and the licence, after any shebang", () => {
    assert.ok(tracked.length > 0, "the source files were found, so the rest of this means something");
    const missing = tracked.filter((f) => {
      const lines = readFileSync(join(ROOT, f), "utf8").split("\n");
      const [first = "", second = ""] = lines[0]?.startsWith("#!") === true ? lines.slice(1) : lines;
      return !(first.includes(COPYRIGHT) && second.includes(LICENCE));
    });
    assert.deepEqual(missing, [], "each of these should open with the two notice lines");
  });

  it("gives the skill its licence in its frontmatter", () => {
    const skill = readFileSync(join(ROOT, "skills/spec-driven-change/SKILL.md"), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? "";
    assert.match(frontmatter, /^license: MIT\. Copyright 2026 Nicholas Koza\.$/m);
  });

  it("carries every bundled package's own licence notice, beside the skill it ships with", () => {
    const packages = bundledPackages();
    assert.ok(packages.length > 0, "the tools bundle something, so the rest of this means something");
    const notices = readFileSync(join(ROOT, NOTICES), "utf8");
    const missing = packages.filter((pkg) => !notices.includes(licenceOf(pkg)));
    assert.deepEqual(missing, [], `${NOTICES} is missing the licence text of these bundled packages: ${missing.join(", ")}`);
  });
});
