// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The CLI, `railyard-trace` ([QBm] and failure behavior;
// [QBm]): it answers with no daemon or desk, as text for
// people and as JSON for tools. Tier 2: real git, in a fixture repository and
// in this repository's own history.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BackwardAnswer, ForwardAnswer, SymbolsAnswer } from "./index.ts";
import { damagedRepository, fixtureRepository, widgetRepository } from "./testing/fixture.ts";
import type { Widget } from "./testing/fixture.ts";

const CLI = join(import.meta.dirname, "../bin/railyard-trace.ts");

type Ran = { readonly status: number | null; readonly stdout: string; readonly stderr: string };

function traceWith(env: NodeJS.ProcessEnv, ...args: string[]): Ran {
  const ran = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", env });
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr };
}

function trace(...args: string[]): Ran {
  return traceWith(process.env, ...args);
}

function answered(ran: Ran): string {
  assert.equal(ran.status, 0, ran.stderr);
  return ran.stdout;
}

function includesAll(out: string, expected: readonly string[]): void {
  for (const e of expected) assert.ok(out.includes(e), `${e} in:\n${out}`);
}

let w: Widget;

describe("railyard-trace", () => {
  before(() => {
    w = widgetRepository();
  });
  after(() => {
    w.fixture.remove();
  });

  it("answers backward as text: the commit read, the line and its commit, and each link's kind, source, artifact, version and state", () => {
    includesAll(answered(trace("backward", "src/widget/spin.ts:6", "--repo", w.fixture.dir, "--at", w.stops.sha)), [
      "src/widget/spin.ts:6", w.stops.sha.slice(0, 12), "2026-01-01 10:05", "const turns = rate;",
      w.code.sha.slice(0, 12), "Spin the widget (ADR-001)", "Refs: ADR-002",
      "recorded", "architecture-source-path", "CALM node `widget`",
      "cited", "code-citation", "ADR-002", "docs/waymarks/002-second.md", "2026-01-01 10:01",
      "commit-message", "`widget` criterion 2", "suspect", "commit-trailer",
    ]);
  });

  it("answers backward as JSON in the answer's own shape", () => {
    const out = answered(trace("backward", "src/widget/spin.ts:6", "--repo", w.fixture.dir, "--at", w.stops.sha, "--json"));
    const answer = BackwardAnswer.parse(JSON.parse(out));
    assert.equal(answer.at.commit, w.stops.sha);
    assert.ok(answer.links.some((l) => l.source === "code-citation" && l.artifact.label === "ADR-002"));
  });

  it("answers forward as text, each position with its link, and as JSON", () => {
    includesAll(answered(trace("forward", "ADR-002", "--repo", w.fixture.dir, "--at", w.stops.sha)), [
      "ADR-002", "docs/waymarks/002-second.md", w.stops.sha.slice(0, 12),
      "code-citation", "src/widget/spin.ts:5-6", "commit-trailer", "src/widget/spin.ts:1-13", "current",
    ]);
    const answer = ForwardAnswer.parse(JSON.parse(answered(trace("forward", "`widget` criterion 2", "--repo", w.fixture.dir, "--at", w.stops.sha, "--json"))));
    assert.ok(answer.positions.some((p) => p.link.source === "tests-table" && p.position.path === "src/widget/core/stop.test.ts" && p.link.state === "suspect"), JSON.stringify(answer.positions));
  });

  it("says untraced of a line, or an artifact, that traces to nothing", () => {
    assert.match(answered(trace("backward", "other/plain.txt:1", "--repo", w.fixture.dir, "--at", w.stops.sha)), /untraced/);
    assert.match(answered(trace("forward", "ADR-002", "--repo", w.fixture.dir, "--at", w.docs.sha)), /untraced/);
  });

  it("names a source it cannot read, and why", () => {
    assert.match(answered(trace("backward", "src/widget/spin.ts:6", "--repo", w.fixture.dir)), /architecture\/broken\.json/);
    assert.match(answered(trace("forward", "CALM node `widget`", "--repo", w.fixture.dir)), /architecture\/broken\.json/);
  });

  it("refuses in words, with status 1, what it cannot answer", () => {
    const absent = trace("backward", "src/nothing.ts:1", "--repo", w.fixture.dir);
    assert.equal(absent.status, 1);
    assert.match(absent.stderr, /src\/nothing\.ts/);
    assert.equal(trace("backward", "src/widget/spin.ts:99", "--repo", w.fixture.dir).status, 1);
    assert.equal(trace("backward", "src/widget/spin.ts:1", "--repo", w.fixture.dir, "--at", "no-such-commit").status, 1);
    assert.equal(trace("backward", "x:1", "--repo", "/").status, 1);
    const unknown = trace("forward", "nothing like an artifact", "--repo", w.fixture.dir);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /nothing like an artifact/);
  });

  it("says how to use it, with status 2, when it is used wrongly; and with status 0 when asked", () => {
    for (const args of [[], ["backward"], ["forward"], ["backward", "no-line-number"], ["backward", "x:1", "--nonsense"], ["sideways", "x:1"], ["backward", "x:1", "--repo"]]) {
      const ran = trace(...args);
      assert.equal(ran.status, 2, `${args.join(" ")}: ${ran.stdout}${ran.stderr}`);
      assert.match(ran.stderr, /usage/i);
    }
    const help = trace("--help");
    assert.equal(help.status, 0);
    assert.match(help.stdout, /railyard-trace backward <file>:<line>/);
    assert.match(help.stdout, /railyard-trace forward <artifact>/);
  });

  it("lists an artifact it recognises that does not exist as missing, with status 0", () => {
    const out = answered(trace("forward", "ADR-009", "--repo", w.fixture.dir, "--at", w.stops.sha));
    assert.match(out, /missing/);
  });

  // traceability's Decisions.
  it("answers with status 0 where git cannot read part of the repository, and refuses a submodule in words with status 1", () => {
    const d = damagedRepository();
    try {
      assert.match(answered(trace("forward", "ADR-001", "--repo", d.fixture.dir)), /could not read docs\/architecture\/model\.json/);
      assert.match(answered(trace("backward", "src/a.ts:2", "--repo", d.fixture.dir)), /could not read docs\/architecture\/model\.json/);
      const submodule = trace("backward", "vendor/sub:1", "--repo", d.fixture.dir);
      assert.equal(submodule.status, 1);
      assert.match(submodule.stderr, /^railyard-trace: .*vendor\/sub/);
    } finally {
      d.fixture.remove();
    }
  });

  // [QBm].
  it("reads the repository --repo names, whatever the caller's GIT_DIR and GIT_WORK_TREE say", () => {
    const other = fixtureRepository();
    try {
      other.commit("Another repository", { "elsewhere.txt": "not the widget\n" });
      const env = { ...process.env, GIT_DIR: join(other.dir, ".git"), GIT_WORK_TREE: other.dir };
      const answer = BackwardAnswer.parse(JSON.parse(answered(traceWith(env, "backward", "src/widget/spin.ts:6", "--repo", w.fixture.dir, "--json"))));
      assert.equal(answer.at.commit, w.broken.sha);
    } finally {
      other.remove();
    }
  });

  it("ignores the caller's global git configuration", () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-config-"));
    try {
      const marker = join(dir, "ran");
      const script = join(dir, "textconv.sh");
      writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\ncat "$1"\n`, { mode: 0o755 });
      writeFileSync(join(dir, "attributes"), "* diff=mark\n");
      const config = join(dir, "config");
      writeFileSync(config, `[color]\n\tui = always\n[core]\n\tattributesFile = ${join(dir, "attributes")}\n[diff "mark"]\n\ttextconv = ${script}\n`);
      const env = { ...process.env, GIT_CONFIG_GLOBAL: config };
      const forward = ForwardAnswer.parse(JSON.parse(answered(traceWith(env, "forward", "ADR-002", "--repo", w.fixture.dir, "--at", w.stops.sha, "--json"))));
      assert.ok(forward.positions.some((p) => p.link.source === "code-citation" && p.position.path === "src/widget/spin.ts"), JSON.stringify(forward.positions));
      answered(traceWith(env, "backward", "src/widget/spin.ts:6", "--repo", w.fixture.dir, "--at", w.stops.sha));
      assert.equal(existsSync(marker), false, "a textconv program the global configuration names ran");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs no textconv program the repository's own configuration names", () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-textconv-"));
    const repo = fixtureRepository();
    try {
      const marker = join(dir, "ran");
      const script = join(dir, "textconv.sh");
      writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\ncat "$1"\n`, { mode: 0o755 });
      repo.commit("Cite it", { ".gitattributes": "* diff=mark\n", "src/a.ts": "// ADR-001: a.\nexport const a = 1;\n" });
      repo.git("config", "diff.mark.textconv", script);
      const answer = BackwardAnswer.parse(JSON.parse(answered(trace("backward", "src/a.ts:2", "--repo", repo.dir, "--json"))));
      assert.ok(answer.links.some((l) => l.artifact.label === "ADR-001"), JSON.stringify(answer.links));
      assert.equal(existsSync(marker), false, "a textconv program the repository's configuration names ran");
    } finally {
      repo.remove();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads a bare repository as any other", () => {
    const dir = mkdtempSync(join(tmpdir(), "trace-bare-"));
    try {
      const bare = join(dir, "widget.git");
      execFileSync("git", ["clone", "-q", "--bare", w.fixture.dir, bare]);
      const fromBare = BackwardAnswer.parse(JSON.parse(answered(trace("backward", "src/widget/spin.ts:6", "--repo", bare, "--at", w.stops.sha, "--json"))));
      const fromClone = BackwardAnswer.parse(JSON.parse(answered(trace("backward", "src/widget/spin.ts:6", "--repo", w.fixture.dir, "--at", w.stops.sha, "--json"))));
      assert.deepEqual(fromBare.links, fromClone.links);
      assert.equal(fromBare.at.commit, w.stops.sha);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The test that traced THIS repository's own HEAD both ways lives in Railyard, not here. It
  // reads a real corpus — its specs, its architecture model, a criterion cited from its source —
  // so it is an integration test of the tool against one repository rather than a test of the
  // tool. Railyard is where that repository is, and [dXi] makes running it there the honest test
  // that this package works: Railyard consumes this, and its own checks run against it. A copy
  // here would need a corpus invented to satisfy it, which proves nothing.
});

// [LRA], [BKY]'s data half, and the failure behavior of symbols files.
describe("railyard-trace index, and backward from a symbols directory", () => {
  const BUILD = "b".repeat(64);
  let widget: Widget;
  let dir: string;

  before(() => {
    widget = widgetRepository();
    dir = mkdtempSync(join(tmpdir(), "trace-symbols-"));
  });
  after(() => {
    widget.fixture.remove();
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a version of the symbols, then answers a position from it, saying so and naming the version", () => {
    includesAll(answered(trace("index", "--symbols", dir, "--repo", widget.fixture.dir, "--at", widget.stops.sha, "--build", BUILD)), [
      "indexed into", dir, "positions in", "links", BUILD,
    ]);
    includesAll(answered(trace("backward", "src/widget/spin.ts:6", "--symbols", dir, "--build", BUILD)), [
      "from the symbols in", dir, widget.stops.sha.slice(0, 12),
      "recorded", "architecture-source-path", "CALM node `widget`", "cited", "code-citation", "ADR-002",
    ]);
    const answer = SymbolsAnswer.parse(JSON.parse(answered(trace("backward", "src/widget/spin.ts:6:3", "--symbols", dir, "--json"))));
    assert.equal(answer.from, "symbols");
    assert.equal(answer.version.commit, widget.stops.sha);
    assert.equal(answer.position?.column, 3);
    assert.match(answered(trace("backward", "other/plain.txt:1", "--symbols", dir, "--json")), /"traced": false/);
  });

  it("refuses a build the directory does not carry, in words, with status 1", () => {
    const unknown = "9".repeat(64);
    const ran = trace("backward", "src/widget/spin.ts:6", "--symbols", dir, "--build", unknown);
    assert.equal(ran.status, 1);
    assert.match(ran.stderr, new RegExp(unknown));
  });

  it("says how to use it, with status 2, where an option means nothing to the command", () => {
    for (const args of [
      ["backward", "src/widget/spin.ts:1", "--build", BUILD],
      ["backward", "src/widget/spin.ts:1:2"],
      ["backward", "src/widget/spin.ts:1", "--symbols", dir, "--at", "HEAD"],
      ["forward", "ADR-001", "--symbols", dir],
      ["index", "--repo", widget.fixture.dir],
      ["index", "src/widget/spin.ts:1", "--symbols", dir],
    ]) {
      const ran = trace(...args);
      assert.equal(ran.status, 2, `${args.join(" ")}: ${ran.stdout}${ran.stderr}`);
      assert.match(ran.stderr, /usage/i);
    }
  });
});

// [DHL].
describe("railyard-trace stamp", () => {
  it("prints the build's hash and writes it into the page, and stamping again gives the same hash", () => {
    const build = mkdtempSync(join(tmpdir(), "trace-build-"));
    try {
      writeFileSync(join(build, "index.html"), "<html>\n<head>\n<title>x</title>\n</head>\n<body>x</body>\n</html>\n");
      writeFileSync(join(build, "app.css"), "body { color: red }\n");
      const out = answered(trace("stamp", build));
      const hash = /[0-9a-f]{64}/.exec(out)?.[0];
      assert.ok(hash !== undefined, out);
      assert.ok(out.includes("app.css"), out);
      assert.match(readFileSync(join(build, "index.html"), "utf8"), new RegExp(`<meta name="dev\\.railyard\\.build-hash" content="${hash}">`));
      assert.ok(answered(trace("stamp", build)).includes(hash), "the stamp is not in what is hashed");
      assert.equal(trace("stamp").status, 2);
      assert.equal(trace("stamp", join(build, "app.css")).status, 1);
    } finally {
      rmSync(build, { recursive: true, force: true });
    }
  });
});
