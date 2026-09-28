// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The package, as someone who installs it gets it.
//
// Every other test here runs the source from inside this repository, which is the one place the
// package is never used from. Two defects lived in exactly that gap, and neither could be seen from
// inside: Node refuses to strip types under `node_modules` (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING,
// Node 24.17.0, 2026-09-22), so a package shipping `.ts` does not run at all once installed; and a
// command that decided it was "the program" by matching its own file name did nothing through npm's
// bin, where the program is a symlink with a different name. Both passed every test in the repository.
//
// So this packs the package, installs the tarball into a directory that knows nothing about this
// one, and uses it from there — the commands through `node_modules/.bin`, the library by its package
// name, and the types through a consumer's own compiler.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HERE = import.meta.dirname;
let consumer = "";
let packed = "";

/** Runs an installed command from inside the consumer, as its owner would. */
function run(bin: string, ...args: string[]): { out: string; err: string; status: number | null } {
  const r = spawnSync(join(consumer, "node_modules", ".bin", bin), args, { cwd: consumer, encoding: "utf8" });
  return { out: r.stdout, err: r.stderr, status: r.status };
}

describe("the package, installed", () => {
  before(() => {
    packed = mkdtempSync(join(tmpdir(), "railyard-method-pack-"));
    // `npm pack` runs `prepare`, so this builds exactly as a git or registry install would.
    execFileSync("npm", ["pack", "--silent", "--pack-destination", packed], { cwd: HERE, stdio: "ignore" });
    const tarball = readdirSync(packed).find((f) => f.endsWith(".tgz"));
    assert.ok(tarball, "npm pack produced a tarball");

    consumer = mkdtempSync(join(tmpdir(), "railyard-method-consumer-"));
    // The identifier tool reads the repository it is run in, so the consumer is one.
    execFileSync("git", ["init", "-q"], { cwd: consumer });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"], { cwd: consumer });
    writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", type: "module", private: true }));
    execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund", join(packed, tarball)], { cwd: consumer, stdio: "ignore" });
  });

  after(() => {
    rmSync(consumer, { recursive: true, force: true });
    rmSync(packed, { recursive: true, force: true });
  });

  it("says one version everywhere: the package, the plugin and the method it works to", () => {
    const pkg = (JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")) as { version: string }).version;
    const plugin = (JSON.parse(readFileSync(join(HERE, ".claude-plugin/plugin.json"), "utf8")) as { version: string }).version;
    const method = /METHOD_VERSION = "([^"]+)"/.exec(readFileSync(join(HERE, "method/version.ts"), "utf8"))?.[1];
    const shown = /\{ "method": "([^"]+)" \}/.exec(readFileSync(join(HERE, "skills/spec-driven-change/SKILL.md"), "utf8"))?.[1];
    assert.deepEqual([plugin, method, shown], [pkg, pkg, pkg], "package.json, .claude-plugin/plugin.json, METHOD_VERSION and the marker the skill shows name one version");
  });

  it("runs every script through an entry point, never a module that no longer starts itself", () => {
    // symbols:index once ran dist/traceability/cli.js after cli.ts stopped running itself on import
    // (2026-09-24): it built, ran nothing, and exited 0, so the symbols silently stopped moving.
    const scripts = (JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    const direct = Object.entries(scripts).flatMap(([name, line]) =>
      [...line.matchAll(/\bnode\s+(?:--\S+\s+)*((?:dist\/)?[\w/.-]+\.[jt]s)\b/g)].map((m) => [name, m[1] ?? ""] as const))
      .filter(([, file]) => !/^(?:dist\/)?bin\//.test(file) && !/^tools\//.test(file));
    assert.deepEqual(direct, [], "each script that runs a command runs it through bin/");
  });

  it("ships every command executable, however it is installed", () => {
    // npm sets the bit when it links a command from a tarball, and did not when installing from
    // git (2026-09-23, npm 11): Railyard's railyard-ids-take failed with "Permission denied" while
    // this suite, installing from a tarball, passed. So the package itself carries the bit.
    const bins = (JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")) as { bin: Record<string, string> }).bin;
    const listing = execFileSync("tar", ["-tvzf", join(packed, readdirSync(packed).find((f) => f.endsWith(".tgz")) ?? "")], { encoding: "utf8" });
    for (const [name, target] of Object.entries(bins)) {
      const line = listing.split("\n").find((l) => l.endsWith(`package/${target.replace(/^\.\//, "")}`));
      assert.ok(line !== undefined, `${name}'s file ${target} is in the package`);
      assert.match(line ?? "", /^-rwx/, `${name} (${target}) is executable as shipped`);
    }
  });

  it("takes identifiers, through the installed command", () => {
    const r = run("railyard-ids-take", "3");
    assert.equal(r.status, 0, r.err);
    const ids = r.out.trim().split("\n");
    assert.equal(ids.length, 3);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9]{3}$/);
    assert.equal(new Set(ids).size, 3, "three different identifiers");
  });

  it("resolves an identifier, through the installed command, and says so when it names nothing", () => {
    // It printed nothing at all once: it did not believe it was the program when run through a symlink.
    const r = run("railyard-ids-resolve", "Ay4");
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /\[Ay4\]\s+names nothing here/);
  });

  it("upgrades a repository, through the installed command, and lists what still names an old path", () => {
    const repo = mkdtempSync(join(tmpdir(), "railyard-method-upgrade-"));
    try {
      mkdirSync(join(repo, ".railyard"));
      writeFileSync(join(repo, ".railyard/method.json"), JSON.stringify({ method: "0.1.0" }));
      mkdirSync(join(repo, "docs/adr"), { recursive: true });
      writeFileSync(join(repo, "docs/adr/001-first.md"), "# First\n");
      writeFileSync(join(repo, "NOTES.md"), "See docs/adr/ for why.\n");
      const r = spawnSync(join(consumer, "node_modules", ".bin", "railyard-upgrade"), [], { cwd: repo, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /0\.1\.0 → 1\.0\.3/);
      assert.match(r.stdout, /docs\/adr → docs\/waymarks/);
      assert.match(r.stdout, /NOTES\.md still names docs\/adr/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("checks a repository, through the installed command, and fails on a finding", () => {
    const repo = mkdtempSync(join(tmpdir(), "railyard-method-check-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: repo });
      mkdirSync(join(repo, "docs/specs"), { recursive: true });
      writeFileSync(join(repo, "docs/specs/widget.md"), "# Widget\n\n## Acceptance criteria\n\n1. It spins.\n");
      const bad = spawnSync(join(consumer, "node_modules", ".bin", "railyard-check"), [], { cwd: repo, encoding: "utf8" });
      assert.equal(bad.status, 1, bad.stderr);
      assert.match(bad.stdout, /8g5/);
      assert.match(bad.stdout, /Xtd/);
      writeFileSync(join(repo, "docs/specs/widget.md"), "# Widget\n\n**ID:** [Wa1]\n\n## Acceptance criteria\n\n1. [Wb2] It spins.\n\n## Tests\n\n| Criterion | Test | Status |\n|---|---|---|\n| [Wb2] | — | Planned |\n");
      const good = spawnSync(join(consumer, "node_modules", ".bin", "railyard-check"), [], { cwd: repo, encoding: "utf8" });
      assert.equal(good.status, 0, good.stdout + good.stderr);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("traces, through the installed command, and says how to use it when given nothing to do", () => {
    const r = run("railyard-trace");
    assert.notEqual(r.status, 0, "no command is a usage error, not a success");
    assert.match(r.out + r.err, /usage: railyard-trace/);
  });

  it("is importable by its package name, and what it exports is what it says", () => {
    writeFileSync(
      join(consumer, "use.js"),
      [
        'import { ARTIFACT_PATHS, CONVENTIONAL_PATHS } from "railyard-method/method";',
        'import { METHOD_VERSION, plan } from "railyard-method/method/version";',
        'import { coveredBy } from "railyard-method/method/spec-shape";',
        'console.log(JSON.stringify({ specs: ARTIFACT_PATHS.specs, n: CONVENTIONAL_PATHS.length, v: METHOD_VERSION, p: plan(".").do, row: coveredBy(" [Aa1] and [Bb2] (x) ").ids }));',
      ].join("\n"),
    );
    const out = execFileSync("node", ["use.js"], { cwd: consumer, encoding: "utf8" });
    assert.deepEqual(JSON.parse(out), { specs: "docs/specs", n: 4, v: "1.0.3", p: "record", row: ["Aa1", "Bb2"] });
  });

  it("mints IDs by package path, incrementally, from a consumer's own repository", () => {
    writeFileSync(
      join(consumer, "mint-use.js"),
      [
        'import { mentionsIn, mentionsSince, mintIds } from "railyard-method/ids/mint";',
        'const first = await mentionsIn(".");',
        'const [id] = await mintIds(first, 1, async (candidate) => candidate.startsWith("q"));',
        'const still = await mentionsSince(".", first);',
        'console.log(JSON.stringify({ minted: id, mentionsItself: first.has(id), stillFree: !still.has(id), sameTips: [...first.tips].sort().join(",") === [...still.tips].sort().join(",") }));',
      ].join("\n"),
    );
    const out = execFileSync("node", ["mint-use.js"], { cwd: consumer, encoding: "utf8" });
    const parsed = JSON.parse(out) as { minted: string; mentionsItself: boolean; stillFree: boolean; sameTips: boolean };
    assert.match(parsed.minted, /^[A-Za-z0-9]{3}$/, "mintIds drew a well-formed ID");
    assert.equal(parsed.mentionsItself, false, "mentionsIn says a freshly minted ID is not yet taken");
    assert.equal(parsed.stillFree, true, "mentionsSince, with nothing new committed, still says it is free");
    assert.equal(parsed.sameTips, true, "no tip moved since the first read, so mentionsSince read no new history");
  });

  it("carries mint's types a consumer's own compiler accepts", () => {
    writeFileSync(
      join(consumer, "mint-use.ts"),
      [
        'import { mentionsIn, mentionsSince, mintIds, Unreadable, type Mentions } from "railyard-method/ids/mint";',
        'const first: Mentions = await mentionsIn(".");',
        'const ids: string[] = await mintIds(first, 2, (candidate: string): boolean => candidate === "abc");',
        'const second: Mentions = await mentionsSince(".", first);',
        'const tracked: boolean = second.trackedTree;',
        'const taken: boolean = second.has(ids[0] ?? "");',
        'const tips: ReadonlySet<string> = second.tips;',
        'const isUnreadable = (e: unknown): boolean => e instanceof Unreadable;',
        "export { ids, taken, tips, tracked, isUnreadable };",
      ].join("\n"),
    );
    writeFileSync(
      join(consumer, "mint-tsconfig.json"),
      JSON.stringify({ compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ["mint-use.ts"] }),
    );
    const tsc = join(HERE, "node_modules", "typescript", "bin", "tsc");
    const r = spawnSync("node", [tsc, "-p", "mint-tsconfig.json"], { cwd: consumer, encoding: "utf8" });
    assert.equal(r.status, 0, `the consumer's typecheck failed:\n${r.stdout}${r.stderr}`);
  });

  it("carries types a consumer's own compiler accepts", () => {
    writeFileSync(
      join(consumer, "use.ts"),
      [
        'import { ARTIFACT_PATHS } from "railyard-method/method";',
        'import { plan, type Plan } from "railyard-method/method/version";',
        'const p: Plan = plan(".");',
        'const specs: "docs/specs" = ARTIFACT_PATHS.specs;',
        'import { coveredBy, type Covered } from "railyard-method/method/spec-shape";',
        'const row: Covered = coveredBy("[Aa1]");',
        "export { row };",
        // traceability's declarations re-export from `./query.ts` and the like — the compiler rewrites
        // import specifiers in emitted JavaScript and leaves them in declarations. Whether a consumer
        // can still follow them is exactly what this line is here to find out, rather than assume.
        'import { FORMAT_VERSION, type BackwardQuery, type Symbols } from "railyard-method/traceability";',
        'const v: string = FORMAT_VERSION;',
        'type Q = BackwardQuery; type S = Symbols;',
        "export type { Q, S };",
        "export { p, specs, v };",
      ].join("\n"),
    );
    writeFileSync(
      join(consumer, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: false, types: [] }, files: ["use.ts"] }),
    );
    // This repository's own compiler, so the consumer needs nothing but the package.
    const tsc = join(HERE, "node_modules", "typescript", "bin", "tsc");
    const r = spawnSync("node", [tsc, "-p", "tsconfig.json"], { cwd: consumer, encoding: "utf8" });
    assert.equal(r.status, 0, `the consumer's typecheck failed:\n${r.stdout}${r.stderr}`);
  });

  it("is marked private, so `npm publish` cannot ship it by accident", () => {
    const pkg = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")) as { private?: boolean };
    assert.equal(pkg.private, true, "this package is installed from git, never published; private:true is what makes an accidental publish refuse rather than succeed");
  });

  it("ships the skill's own folder, and none of this repository's test files, which import modules it does not ship", () => {
    const listing = execFileSync("tar", ["-tzf", join(packed, readdirSync(packed).find((f) => f.endsWith(".tgz")) ?? "")], { encoding: "utf8" }).split("\n");
    for (const stray of ["package/skills/hook.test.ts", "package/skills/skill.test.ts", "package/skills/tools.test.ts"]) {
      assert.ok(!listing.includes(stray), `${stray} ships and imports a module (evals/, tools/) this package does not ship`);
    }
    assert.ok(listing.includes("package/skills/spec-driven-change/SKILL.md"), "the skill itself still ships");
  });

  it("ships the published symbols format beside the code, as [QBm] says it is published", () => {
    const listing = execFileSync("tar", ["-tzf", join(packed, readdirSync(packed).find((f) => f.endsWith(".tgz")) ?? "")], { encoding: "utf8" }).split("\n");
    for (const file of ["package/traceability/FORMAT.md", "package/traceability/symbols.schema.json"]) {
      assert.ok(listing.includes(file), `${file} is not in the package, though the format is documented as published beside the code`);
    }
  });
});
