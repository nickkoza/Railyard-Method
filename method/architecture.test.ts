// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The architecture spec's criteria, each over a small repository built to break it, and then over
// this repository itself: the method's own model has to meet the method's own rules.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkArchitecture } from "./architecture.ts";

const ROOT = join(import.meta.dirname, "..");
let root = "";

function file(path: string, body: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

type Node = { id: string; type?: string; source?: string | string[]; detailed?: string };
function model(path: string, id: string | null, nodes: Node[], connects: [string, string][] = []): void {
  file(path, JSON.stringify({
    $schema: "https://calm.finos.org/release/1.0/meta/calm.json",
    nodes: nodes.map((n) => ({
      "unique-id": n.id,
      "node-type": n.type ?? "service",
      name: n.id,
      description: `The ${n.id}.`,
      ...(n.source === undefined ? {} : { "source-path": n.source }),
      ...(n.detailed === undefined ? {} : { details: { "detailed-architecture": n.detailed } }),
    })),
    relationships: connects.map(([a, b]) => ({
      "unique-id": `${a}-${b}`,
      description: `${a} uses ${b}.`,
      "relationship-type": { connects: { source: { node: a }, destination: { node: b } } },
    })),
    ...(id === null ? {} : { metadata: { id } }),
  }, null, 2));
}

/** A repository that meets every rule: two components, one import between them, declared. */
function clean(): void {
  file("app/main.ts", 'import { helper } from "../lib/helper.ts";\nexport const main = helper;\n');
  file("lib/helper.ts", "export const helper = 1;\n");
  file("lib/helper.test.ts", 'import "../app/main.ts";\n');
  model("docs/architecture/top.json", "Ab1", [{ id: "app", source: "app" }, { id: "lib", source: "lib" }], [["app", "lib"]]);
  file("docs/specs/overview.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  app --> lib"]));
}

function run(): string[] {
  execFileSync("git", ["init", "-q"], { cwd: root });
  return checkArchitecture(root, { calm: null }).map((f) => `${f.rule}: ${f.message}`);
}

function view(lines: string[]): string {
  return ["# Doc", "", "```mermaid", ...lines, "```", ""].join("\n");
}

describe("the architecture checks, over repositories built to break each rule", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "arch-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("finds nothing in a repository that meets every rule", () => {
    clean();
    file("docs/specs/x.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  app --> lib"]));
    assert.deepEqual(run(), []);
  });

  it("[CLM] reports a model of more than one component with no view at all", () => {
    clean();
    rmSync(join(root, "docs/specs/overview.md"));
    const found = run().filter((f) => f.startsWith("CLM"));
    assert.equal(found.length, 1, found.join("\n"));
    assert.match(found[0] ?? "", /docs\/architecture\/top\.json has 2 components and no view/);
  });

  it("[CLM] reports a component no view shows, and counts one inside a drawn box as seen", () => {
    clean();
    file("docs/architecture/top.json", JSON.stringify({
      $schema: "https://calm.finos.org/release/1.0/meta/calm.json",
      metadata: { id: "Ab1" },
      nodes: ["app", "lib", "core", "store", "dock"].map((id) => ({ "unique-id": id, "node-type": "service", name: id, description: `The ${id}.`, ...(id === "app" || id === "lib" ? { "source-path": id } : {}) })),
      relationships: [
        { "unique-id": "app-lib", "relationship-type": { connects: { source: { node: "app" }, destination: { node: "lib" } } } },
        { "unique-id": "lib-holds", "relationship-type": { "composed-of": { container: "lib", nodes: ["core", "store"] } } },
      ],
    }));
    const found = run().filter((f) => f.startsWith("CLM"));
    assert.equal(found.length, 1, found.join("\n"));
    assert.match(found[0] ?? "", /dock/);
    assert.doesNotMatch(found[0] ?? "", /core|store/, "inside lib, which the overview draws");
  });

  it("[CC6] leaves a view quoted as an example, inside a longer fence, alone", () => {
    clean();
    file("docs/specs/how.md", ["# How", "", "````markdown", "```mermaid", "%% view-of: docs/architecture/shop.json", "flowchart LR", "  web-shop --> checkout", "```", "````", ""].join("\n"));
    assert.deepEqual(run().filter((f) => f.startsWith("CC6")), []);
  });

  it("[CC6] reads a view indented inside a numbered decision, as any other", () => {
    clean();
    file("docs/specs/decided.md", ["# Decided", "", "## Decisions", "", "1. [Zz9] **Drawn here.** Conventional.", "", "   ```mermaid", "   %% view-of: docs/architecture/top.json", "   flowchart LR", "     lib --> app", "   ```", ""].join("\n"));
    assert.ok(run().some((f) => f.startsWith("CC6") && f.includes("decided.md") && f.includes("lib --> app")));
  });

  it("[CC6], [SKi] read a box as a component: drawn by the model's ID, and counted", () => {
    clean();
    file("docs/specs/boxes.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  subgraph galaxy", "    app", "  end"]));
    assert.ok(run().some((f) => f.startsWith("CC6") && f.includes("galaxy")));
  });

  it("[C4P] leaves the agent's own configuration alone: a skill installed under .claude/ is not the repository's source", () => {
    clean();
    file(".claude/skills/spec-driven-change/SKILL.md", "---\nname: spec-driven-change\n---\n");
    file(".claude/skills/spec-driven-change/tools/railyard.mjs", "export {};\n");
    assert.deepEqual(run().filter((f) => f.startsWith("C4P")), []);
  });

  it("[C4P] counts every kind of test file as a test, not as source to own", () => {
    clean();
    for (const f of ["lib/a.docker-test.ts", "lib/b.live-test.ts", "lib/c.perf-test.ts", "stray/d.test.ts", "stray/e.docker-test.ts"]) file(f, "export {};\n");
    assert.deepEqual(run().filter((f) => f.startsWith("C4P")), []);
  });

  it("[L7b] takes a CALM pattern and a URL mapping beside the model for what they are, and still reports a broken model", () => {
    clean();
    file("docs/architecture/pattern.json", JSON.stringify({ $schema: "https://calm.finos.org/release/1.0/meta/calm.json", $id: "https://x.local/pattern.json", title: "P", type: "object" }));
    file("docs/architecture/calm-url-mapping.json", JSON.stringify({ "https://x.local/controls/a.json": "controls/a.json" }));
    assert.deepEqual(run().filter((f) => f.startsWith("L7b")), []);
    file("docs/architecture/broken.json", JSON.stringify({ relationships: [] }));
    assert.ok(run().some((f) => f.startsWith("L7b") && f.includes("broken.json")));
  });

  it("[C4P] reports source with no model at all, rather than passing for want of one", () => {
    file("app/main.ts", "export {};\n");
    assert.ok(run().some((f) => f.startsWith("C4P") && f.includes("no architecture model")));
  });

  it("[C4P] reports a source file no component owns, and one two components own", () => {
    clean();
    file("stray/loose.ts", "export {};\n");
    model("docs/architecture/top.json", "Ab1", [{ id: "app", source: "app" }, { id: "lib", source: "lib" }, { id: "lib2", source: "lib" }], [["app", "lib"], ["app", "lib2"]]);
    const found = run();
    assert.ok(found.some((f) => f.startsWith("C4P") && f.includes("stray/loose.ts")), found.join("\n"));
    // And says how to give it one: an agent that has never seen the convention cannot guess it.
    assert.ok(found.some((f) => f.startsWith("C4P") && f.includes("stray/loose.ts") && f.includes('"source-path"')), found.join("\n"));
    assert.ok(found.some((f) => f.startsWith("C4P") && f.includes("lib/helper.ts") && f.includes("lib2")), found.join("\n"));
  });

  it("[C4P] notes a component whose source path names nothing yet, as unbuilt, without failing", () => {
    clean();
    model("docs/architecture/top.json", "Ab1", [{ id: "app", source: "app" }, { id: "lib", source: "lib" }, { id: "later", source: ["later", "lib/soon.ts"] }], [["app", "lib"], ["app", "later"]]);
    execFileSync("git", ["init", "-q"], { cwd: root });
    const found = checkArchitecture(root, { calm: null }).filter((f) => f.rule === "C4P");
    assert.deepEqual(found.map((f) => [f.notice, f.message.includes("later") || f.message.includes("lib/soon.ts")]), [[true, true], [true, true]], JSON.stringify(found));
    assert.ok(found.every((f) => /not there yet/.test(f.message)), JSON.stringify(found));
  });

  it("[lLm] reports an import across components the model does not declare", () => {
    clean();
    model("docs/architecture/top.json", "Ab1", [{ id: "app", source: "app" }, { id: "lib", source: "lib" }]);
    const found = run();
    assert.ok(found.some((f) => f.startsWith("lLm") && f.includes("app/main.ts") && f.includes("lib/helper.ts")), found.join("\n"));
  });

  it("[lLm] resolves an import however it is written: .ts, NodeNext's .js, extensionless, a directory's index, and require", () => {
    const styles: [string, string, string][] = [
      ["literal .ts", "../lib/helper.ts", "lib/helper.ts"],
      ["NodeNext .js for .ts", "../lib/helper.js", "lib/helper.ts"],
      ["extensionless", "../lib/helper", "lib/helper.ts"],
      [".mjs for .mts", "../lib/mod.mjs", "lib/mod.mts"],
      [".js for .tsx", "../lib/view.js", "lib/view.tsx"],
      ["a plain .js file", "../lib/plain.js", "lib/plain.js"],
      ["a directory's index", "../lib/inner", "lib/inner/index.ts"],
    ];
    for (const [style, spec, target] of styles) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root, { recursive: true });
      clean();
      for (const f of ["lib/mod.mts", "lib/view.tsx", "lib/plain.js", "lib/inner/index.ts"]) file(f, "export const x = 1;\n");
      file("app/main.ts", `import { x } from "${spec}";\nexport const main = x;\n`);
      file("app/other.ts", `const y = require("${spec}");\nexport const other = y;\n`);
      model("docs/architecture/top.json", "Ab1", [{ id: "app", source: "app" }, { id: "lib", source: "lib" }]);
      const found = run().filter((f) => f.startsWith("lLm"));
      assert.ok(found.some((f) => f.includes("app/main.ts") && f.includes(` ${target},`)), `${style}: ${spec} should resolve to ${target}\n${found.join("\n")}`);
      assert.ok(found.some((f) => f.includes("app/other.ts") && f.includes(` ${target},`)), `${style}, required: ${spec} should resolve to ${target}\n${found.join("\n")}`);
    }
  });

  it("[lLm] resolves a Python import however it is written, and reports one across components the model does not declare", () => {
    // [importer, its source, the file it reaches, the extra files the case needs]
    const PATH_ARM = 'from pathlib import Path\nimport sys\n';
    const cases: [string, string, string, string, string[]][] = [
      ["import a.b, from the root", "app/main.py", "import lib.util\n", "lib/util.py", []],
      ["several after one import, with as", "app/main.py", "import os, lib.util as u\n", "lib/util.py", []],
      ["from a package import its module", "app/main.py", "from lib import util\n", "lib/util.py", []],
      ["from a module import a name", "app/main.py", "from lib.util import thing\n", "lib/util.py", []],
      ["from a package import a name its __init__ holds", "app/main.py", "from lib import thing\n", "lib/__init__.py", ["lib/__init__.py"]],
      ["names in parentheses across lines", "app/main.py", "from lib.util import (\n    a,\n    b,\n)\n", "lib/util.py", []],
      ["inside a function, after a ;", "app/main.py", "def f():\n    import sys; import lib.util\n", "lib/util.py", []],
      ["the src layout", "app/main.py", "from shared.core import x\n", "src/shared/core.py", ["src/shared/__init__.py", "src/shared/core.py"]],
      ["from . import a sibling module", "app/pkg/main.py", "from . import other\n", "app/pkg/other.py", ["app/pkg/__init__.py", "app/pkg/other.py"]],
      ["from .module import a name", "app/pkg/main.py", "from .other import x\n", "app/pkg/other.py", ["app/pkg/__init__.py", "app/pkg/other.py"]],
      ["from .. a level up", "app/pkg/main.py", "from ..top import x\n", "app/top.py", ["app/__init__.py", "app/pkg/__init__.py", "app/top.py"]],
      ["a script's own directory", "app/run.py", "import helper\n", "app/helper.py", ["app/helper.py"]],
      ["sys.path from __file__'s parents, in place", "app/main.py", `${PATH_ARM}sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "arm"))\nimport reach\n`, "tools/arm/reach.py", ["tools/arm/reach.py"]],
      ["sys.path through a bound name", "app/main.py", `${PATH_ARM}ARM = Path(__file__).resolve().parents[1] / "tools" / "arm"\nsys.path.insert(0, str(ARM))\ndef f():\n    import reach\n`, "tools/arm/reach.py", ["tools/arm/reach.py"]],
      ["sys.path through os.path", "app/main.py", 'import os, sys\nsys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools", "arm"))\nimport reach\n', "tools/arm/reach.py", ["tools/arm/reach.py"]],
      ["sys.path from the root, as a literal", "app/main.py", 'import sys\nsys.path.insert(0, "tools/arm")\nimport reach\n', "tools/arm/reach.py", ["tools/arm/reach.py"]],
      ["sys.path as an absolute path inside the repository", "app/main.py", `import sys\nsys.path.insert(0, "${root}/tools/arm")\nimport reach\n`, "tools/arm/reach.py", ["tools/arm/reach.py"]],
      ["sys.path through .parent and joinpath", "app/main.py", `${PATH_ARM}sys.path.insert(0, str(Path(__file__).parent.parent.joinpath("tools", "arm")))\nimport reach\n`, "tools/arm/reach.py", ["tools/arm/reach.py"]],
    ];
    for (const [form, importer, source, target, extra] of cases) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root, { recursive: true });
      file("lib/util.py", "thing = 1\n");
      for (const f of extra) file(f, "x = 1\n");
      file(importer, source);
      // What the importer reaches is another component's, lib's, even inside the importer's own directory.
      model("docs/architecture/top.json", "Ab1", [{ id: "app", source: "app" }, { id: "lib", source: [...new Set([target, "lib"])] }]);
      const found = run().filter((f) => f.startsWith("lLm"));
      assert.ok(found.some((f) => f.includes(`${importer} imports ${target},`)), `${form}: should reach ${target}\n${found.join("\n")}`);
    }
  });

  it("[lLm] reads no Python import from a comment or a string, nor from a package directory as if it were a script's, nor a declared one", () => {
    file("lib/util.py", "thing = 1\n");
    file("app/__init__.py", "");
    file("app/helper.py", "x = 1\n");
    file("app/main.py", '"""\nimport lib.util\n"""\n# import lib.util\nx = "import lib.util"\nimport helper\nimport numpy\n');
    file("app/used.py", "import lib.util\n");
    model("docs/architecture/top.json", "Ab1", [{ id: "app", source: ["app/main.py", "app/__init__.py", "app/used.py"] }, { id: "helper", source: "app/helper.py" }, { id: "lib", source: "lib" }], [["app", "lib"]]);
    assert.deepEqual(run().filter((f) => f.startsWith("lLm")), []);
  });

  it("[lLm] notes a language whose imports are not read, and a sys.path addition it cannot follow, without failing", () => {
    clean();
    file("lib/core.rs", "use crate::x;\n");
    file("app/odd.py", 'import os, sys\nsys.path.insert(0, os.environ["SOMEWHERE"])\n');
    // A directory outside the repository holds none of its files, and is nothing to note.
    file("app/away.py", 'import sys\nsys.path.insert(0, "/opt/elsewhere/lib")\n');
    execFileSync("git", ["init", "-q"], { cwd: root });
    const found = checkArchitecture(root, { calm: null }).filter((f) => f.rule === "lLm");
    assert.ok(found.every((f) => f.notice === true), JSON.stringify(found));
    assert.ok(found.some((f) => f.message.includes("Rust") && f.message.includes("lib/core.rs")), JSON.stringify(found));
    assert.ok(found.some((f) => f.message.includes("app/odd.py") && f.message.includes("SOMEWHERE")), JSON.stringify(found));
    assert.ok(!found.some((f) => f.message.includes("app/away.py")), JSON.stringify(found));
  });

  /** A model where a system holds an adapter, deployed on a host, that drives an arm; and a laptop running a sim that reads params. */
  function collapsible(): void {
    clean();
    const ids = ["app", "lib", "system", "adapter", "host", "arm", "laptop", "sim", "params", "lone"];
    const connects = [["app", "lib"], ["adapter", "arm"], ["sim", "params"]];
    file("docs/architecture/top.json", JSON.stringify({
      $schema: "https://calm.finos.org/release/1.0/meta/calm.json",
      metadata: { id: "Ab1" },
      nodes: ids.map((id) => ({ "unique-id": id, "node-type": "service", name: id, description: `The ${id}.`, ...(id === "app" || id === "lib" ? { "source-path": id } : {}) })),
      relationships: [
        ...connects.map(([a, b]) => ({ "unique-id": `${a ?? ""}-${b ?? ""}`, "relationship-type": { connects: { source: { node: a }, destination: { node: b } } } })),
        { "unique-id": "system-holds", "relationship-type": { "composed-of": { container: "system", nodes: ["adapter"] } } },
        { "unique-id": "host-runs", "relationship-type": { "deployed-in": { container: "host", nodes: ["adapter"] } } },
        { "unique-id": "laptop-runs", "relationship-type": { "deployed-in": { container: "laptop", nodes: ["sim"] } } },
      ],
    }));
  }

  it("[CC6] takes an arrow between two boxes as the model's where it holds through what each contains", () => {
    collapsible();
    file("docs/specs/collapsed.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  system --> arm", "  host --> arm", "  laptop --> params", "  app --> lib"]));
    file("docs/specs/wrong-way.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  arm --> system", "  system --> host"]));
    const found = run().filter((f) => f.startsWith("CC6"));
    assert.ok(!found.some((f) => f.includes("collapsed.md")), found.join("\n"));
    assert.ok(found.some((f) => f.includes("wrong-way.md") && f.includes("arm --> system")), found.join("\n"));
    assert.ok(found.some((f) => f.includes("wrong-way.md") && f.includes("system --> host")), found.join("\n"));
  });

  it("[CC6] reports a component drawn with no arrow where the model connects it to another box the view draws", () => {
    collapsible();
    file("docs/specs/bare.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  system", "  arm", "  laptop", "  params", "  lone", "  app --> lib"]));
    // The adapter drawn with its arrow: the system that holds it owes none.
    file("docs/specs/member.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  subgraph system", "    adapter", "  end", "  adapter --> arm"]));
    const found = run().filter((f) => f.startsWith("CC6"));
    for (const id of ["system", "arm", "laptop", "params"]) {
      assert.ok(found.some((f) => f.includes("bare.md") && f.includes(`draws ${id} with no arrow`)), `${id}\n${found.join("\n")}`);
    }
    assert.ok(!found.some((f) => f.includes("lone")), found.join("\n"));
    assert.ok(!found.some((f) => f.includes("member.md")), found.join("\n"));
  });

  it("[CC6] reports a diagram that is not a view, a component or connection the model lacks, and a label", () => {
    clean();
    file("docs/specs/a.md", view(["flowchart LR", "  app --> lib"]));
    file("docs/specs/b.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  app --> cache", "  lib --> app"]));
    file("docs/specs/c.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", "  app[The app] --> lib"]));
    const found = run().filter((f) => f.startsWith("CC6"));
    assert.ok(found.some((f) => f.includes("docs/specs/a.md") && f.includes("view-of")), found.join("\n"));
    assert.ok(found.some((f) => f.includes("docs/specs/b.md") && f.includes("cache")), found.join("\n"));
    assert.ok(found.some((f) => f.includes("docs/specs/b.md") && f.includes("lib --> app")), found.join("\n"));
    assert.ok(found.some((f) => f.includes("docs/specs/c.md")), found.join("\n"));
  });

  it("[SKi] reports a view of more than twelve components", () => {
    const ids = Array.from({ length: 13 }, (_, i) => `n${String(i)}`);
    file("app/main.ts", "export {};\n");
    model("docs/architecture/top.json", "Ab1", [{ id: "app", source: "app" }, ...ids.map((id) => ({ id }))]);
    file("docs/specs/x.md", view(["%% view-of: docs/architecture/top.json", "flowchart LR", ...ids.map((id) => `  ${id}`)]));
    assert.ok(run().some((f) => f.startsWith("SKi") && f.includes("13")));
  });

  it("[W7x] reports a detailed architecture reaching outside its parent, and leaves its parent's files owned", () => {
    clean();
    model("docs/architecture/top.json", "Ab1", [{ id: "app", source: "app", detailed: "docs/architecture/app.json" }, { id: "lib", source: "lib" }], [["app", "lib"]]);
    model("docs/architecture/app.json", "Cd2", [{ id: "entry", source: "app/other" }, { id: "leak", source: "lib" }]);
    const found = run();
    assert.ok(found.some((f) => f.startsWith("W7x") && f.includes("leak")), found.join("\n"));
    assert.ok(found.some((f) => f.startsWith("C4P") && f.includes("app/main.ts") && f.includes("docs/architecture/app.json")), found.join("\n"));
  });

  it("[L7b] reports a model with no ID, and a detailed architecture that is not there", () => {
    clean();
    model("docs/architecture/top.json", null, [{ id: "app", source: "app", detailed: "docs/architecture/gone.json" }, { id: "lib", source: "lib" }], [["app", "lib"]]);
    const found = run().filter((f) => f.startsWith("L7b"));
    assert.ok(found.some((f) => f.includes("no stable ID")), found.join("\n"));
    assert.ok(found.some((f) => f.includes("docs/architecture/gone.json")), found.join("\n"));
  });
});

describe("[L7b]: the check runs calm validate", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "arch-calm-")); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  const CALM = join(ROOT, "node_modules/.bin/calm");

  it("reports a model calm validate refuses, naming it", () => {
    clean();
    file("docs/architecture/top.json", JSON.stringify({ $schema: "https://calm.finos.org/release/1.0/meta/calm.json", nodes: [{ "unique-id": "app", "node-type": "service", "source-path": "app" }, { "unique-id": "lib", "node-type": "service", name: "lib", description: "The lib.", "source-path": "lib" }], relationships: [{ "unique-id": "a", "relationship-type": { connects: { source: { node: "app" }, destination: { node: "lib" } } } }], metadata: { id: "Ab1" } }));
    execFileSync("git", ["init", "-q"], { cwd: root });
    const found = checkArchitecture(root, { calm: CALM }).filter((f) => f.rule === "L7b");
    assert.ok(found.some((f) => f.message.includes("docs/architecture/top.json") && f.message.includes("calm validate")), JSON.stringify(found));
  });

  it("passes a model calm validate accepts", () => {
    clean();
    execFileSync("git", ["init", "-q"], { cwd: root });
    assert.deepEqual(checkArchitecture(root, { calm: CALM }).filter((f) => f.rule === "L7b"), []);
  });

  it("says it could not validate when there is no calm to run, rather than passing", () => {
    clean();
    execFileSync("git", ["init", "-q"], { cwd: root });
    const found = checkArchitecture(root, { calm: join(root, "no-such-calm") }).filter((f) => f.rule === "L7b");
    assert.ok(found.some((f) => f.message.includes("could not")), JSON.stringify(found));
    // And says what to do: the tools need Node alone, and this one check a CLI beside it.
    // The repository need not be a Node project, so the advice is the skill's: a global install, or npx.
    assert.ok(found.some((f) => f.message.includes("npm install -g @finos/calm-cli") && f.message.includes("npx @finos/calm-cli") && f.message.includes("every other check ran")), JSON.stringify(found));
    assert.ok(!found.some((f) => f.message.includes("--save-dev")), JSON.stringify(found));
  });
});

describe("the method's own architecture", () => {
  it("meets every rule of its own architecture spec", () => {
    const found = checkArchitecture(ROOT);
    assert.deepEqual(found.filter((f) => f.notice !== true), []);
    // [lLm]: the Rust index's imports are not read, and the check says so rather than passing in silence.
    assert.deepEqual(found.map((f) => /^\d+ Rust source files:/.test(f.message)), [true]);
  });

  it("[L7b] is valid CALM, every model of it, by the pinned calm validate", () => {
    const models = readdirSync(join(ROOT, "docs/architecture")).filter((f) => f.endsWith(".json"));
    assert.ok(models.length >= 2, "a top level and at least one detailed architecture");
    for (const m of models) {
      const r = spawnSync(join(ROOT, "node_modules/.bin/calm"), ["validate", "--strict", "--architecture", join(ROOT, "docs/architecture", m)], { encoding: "utf8" });
      assert.equal(r.status, 0, `${m}:\n${r.stdout}\n${r.stderr}`);
    }
  });
});
