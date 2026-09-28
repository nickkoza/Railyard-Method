// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [HPg], [G0i] — tier 2: the skill's scan, run as Claude Code runs its hook: the bundled tool from a
// copy of the skill's folder, the edit's JSON on stdin, the project's root in CLAUDE_PROJECT_DIR.
// Its answer reaches the agent as additionalContext; it never refuses the edit, and always exits 0.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
let repo = "";
let tool = "";

function file(path: string, body: string): void {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), body);
}

function run(args: string[], input = ""): { out: string; err: string; status: number | null } {
  const r = spawnSync("node", [tool, ...args], { cwd: repo, input, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
  return { out: r.stdout, err: r.stderr, status: r.status };
}

function hook(path: string): { context: string; status: number | null } {
  const r = run(["scan", "--hook"], JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: join(repo, path), content: "" } }));
  const context = r.out.trim() === "" ? "" : String((JSON.parse(r.out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext);
  return { context, status: r.status };
}

describe("[HPg]: the skill's scan, as its hook runs it", () => {
  before(() => {
    repo = mkdtempSync(join(tmpdir(), "hook-"));
    cpSync(join(ROOT, "skills/spec-driven-change"), join(repo, ".claude/skills/spec-driven-change"), { recursive: true });
    tool = join(repo, ".claude/skills/spec-driven-change/tools/railyard.mjs");
    file("docs/specs/grasp.md", "# Grasp\n\n**ID:** [Ga1]\n\n## Acceptance criteria\n\n1. [Gb2] A trial ends in success or one failure reason.\n");
    file("sim/grasp.py", "def run_trial(seed):\n    return 'success'\n");
  });
  after(() => { rmSync(repo, { recursive: true, force: true }); });

  it("tells the agent a file it just wrote is untracked, naming its things and the command to link them", () => {
    const r = hook("sim/grasp.py");
    assert.equal(r.status, 0);
    assert.match(r.context, /sim\/grasp\.py/);
    assert.match(r.context, /run_trial/);
    assert.match(r.context, /railyard\.mjs link sim\/grasp\.py#run_trial/);
    assert.doesNotMatch(r.context, /model node/, "a file's component is the model's to say, by its source paths");
  });

  it("links from the command line, and then says nothing about a file whose links are all current", () => {
    const linked = run(["link", "sim/grasp.py#run_trial", "Gb2"]);
    assert.equal(linked.status, 0, linked.err);
    assert.equal(hook("sim/grasp.py").context, "");
    const listed = run(["links", "sim/grasp.py"]);
    assert.match(listed.out, /run_trial.*\[Gb2\].*current/);
  });

  it("names a test by its title, and says how to link one whose title has spaces", () => {
    file("sim/grasp.test.ts", 'import { test } from "node:test";\n\ntest("a trial ends in success", () => {\n  run_trial(1);\n});\n');
    const r = hook("sim/grasp.test.ts");
    assert.match(r.context, /link 'sim\/grasp\.test\.ts#a trial ends in success' <ID>/);
    const linked = run(["link", "sim/grasp.test.ts#a trial ends in success", "Gb2"]);
    assert.equal(linked.status, 0, linked.err);
    assert.match(run(["links", "sim/grasp.test.ts"]).out, /a trial ends in success.*\[Gb2\].*current/);
    assert.equal(hook("sim/grasp.test.ts").context, "");
  });

  it("says how to link a title with double quotes and an apostrophe, and the exact command run through a real shell links it ([5jT])", () => {
    // The title itself opens and closes with a real double quote, and holds an apostrophe:
    // exactly the shape `target`'s old file#"a title" convenience heuristic mistook for its
    // own quoting and stripped, so linking the command the scan prints named nothing.
    file("sim/quote.test.ts", 'import { test } from "node:test";\n\ntest(`"it\'s free"`, () => {});\n');
    const r = hook("sim/quote.test.ts");
    const command = /`([^`]+)`/.exec(r.context)?.[1]?.replace(/<ID>\.\.\.$/, "Gb2");
    assert.ok(command !== undefined, r.context);
    // A name the scan prints is exactly what `link` accepts as the shell-quoted argument
    // ([5jT], d397fa9): run the command as printed, through a real shell, rather than
    // passing its pieces around the shell's own quote removal.
    const linked = spawnSync("sh", ["-c", command ?? ""], { cwd: repo, encoding: "utf8" });
    assert.equal(linked.status, 0, `${linked.stdout}${linked.stderr}\ncommand: ${command}`);
    assert.match(run(["links", "sim/quote.test.ts"]).out, /"it's free"\s+\[Gb2\]\s+current/);
    assert.equal(hook("sim/quote.test.ts").context, "");
  });

  it("names a link the edit made suspect, and what to do about it", () => {
    file("sim/grasp.py", "def run_trial(seed):\n    return 'dropped'\n");
    const r = hook("sim/grasp.py");
    assert.match(r.context, /run_trial.*changed.*\[Gb2\]/s);
    assert.match(r.context, /link sim\/grasp\.py#run_trial Gb2/);
  });

  it("names, after an artifact's text changes, the code linked to it and the command that confirms it", () => {
    assert.equal(hook("docs/specs/grasp.md").context, "", "nothing linked to it changed");
    file("docs/specs/grasp.md", "# Grasp\n\n**ID:** [Ga1]\n\n## Acceptance criteria\n\n1. [Gb2] A trial ends in success or one named failure reason.\n");
    const r = hook("docs/specs/grasp.md");
    assert.equal(r.status, 0);
    assert.match(r.context, /docs\/specs\/grasp\.md/);
    assert.match(r.context, /railyard\.mjs link 'sim\/grasp\.test\.ts#a trial ends in success' Gb2/);
    assert.match(r.context, /railyard\.mjs link sim\/grasp\.py#run_trial Gb2/);
  });

  it("stays silent about its own records, and files outside the project", () => {
    assert.equal(hook("symbols/links/sim/grasp.py.json").context, "");
    file("sim/fork.patch", "+def spin(n):\n+    return n\n");
    assert.equal(hook("sim/fork.patch").context, "", "a patch is not code, whatever lines it holds");
    const outside = spawnSync("node", [tool, "scan", "--hook"], { cwd: repo, input: JSON.stringify({ tool_input: { file_path: "/etc/hosts" } }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
    assert.equal(outside.status, 0);
    assert.equal(outside.stdout.trim(), "");
  });

  it("answers --help with how to use each command, and a file that is not there in words", () => {
    for (const command of ["links", "link", "unlink", "scan"]) {
      const r = run([command, "--help"]);
      assert.equal(r.status, 0, `${command}: ${r.err}`);
      assert.match(r.out, /links <file>/, command);
      assert.match(r.out, /link <file>#<name> <ID>/, command);
      assert.doesNotMatch(`${r.out}${r.err}`, /ENOENT/, command);
    }
    for (const args of [["links", "sim/nothing.py"], ["scan", "sim/nothing.py"], ["link", "sim/nothing.py#x", "Gb2"]]) {
      const r = run(args);
      assert.equal(r.status, 1, args.join(" "));
      assert.match(r.err, /sim\/nothing\.py is not a file here/, args.join(" "));
      assert.doesNotMatch(r.err, /ENOENT/, args.join(" "));
    }
  });

  it("never refuses: input it cannot read is said, and it still exits 0", () => {
    const r = run(["scan", "--hook"], "not json");
    assert.equal(r.status, 0);
    assert.match(r.out, /could not run/);
  });

  it("is the project's, installed into its settings, and never the skill's own frontmatter", () => {
    const skill = readFileSync(join(ROOT, "skills/spec-driven-change/SKILL.md"), "utf8");
    const front = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? "";
    assert.doesNotMatch(front, /hooks:/, "a hook in both places would scan every write twice");
    const installed = run(["install"]);
    assert.equal(installed.status, 0, installed.err);
    const settings = readFileSync(join(repo, ".claude/settings.json"), "utf8");
    assert.match(settings, /Write\|Edit\|MultiEdit/);
    const command = /"command": "(.*scan --hook)"/.exec(settings)?.[1]?.replace(/\\"/g, '"') ?? "";
    const r = spawnSync("sh", ["-c", command], { cwd: repo, input: JSON.stringify({ tool_input: { file_path: join(repo, "sim/grasp.py") } }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /additionalContext/, "the command the settings hold runs the scan");
  });
});

/** The hook as Claude Code runs it after a Bash command: its input names the command line, never a file. */
function shell(command: string): { context: string; status: number | null; ms: number } {
  const started = performance.now();
  const r = run(["scan", "--hook"], JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command, description: "a shell write" }, tool_response: { stdout: "", stderr: "", interrupted: false } }));
  const ms = performance.now() - started;
  const context = r.out.trim() === "" ? "" : String((JSON.parse(r.out) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext);
  return { context, status: r.status, ms };
}

describe("[G0i]: a write through the shell is scanned, as the hook runs it after a Bash command", () => {
  before(() => {
    repo = mkdtempSync(join(tmpdir(), "hook-shell-"));
    cpSync(join(ROOT, "skills/spec-driven-change"), join(repo, ".claude/skills/spec-driven-change"), { recursive: true });
    tool = join(repo, ".claude/skills/spec-driven-change/tools/railyard.mjs");
    file("docs/specs/grasp.md", "# Grasp\n\n**ID:** [Ga1]\n\n## Acceptance criteria\n\n1. [Gb2] A trial ends in success or one failure reason.\n2. [Gc3] Success means the item rests in the bin.\n");
    file("sim/grasp.py", "def run_trial(seed):\n    return 'success'\n");
    file("sim/bin.py", "def in_bin(item):\n    return item.z < 0.1\n");
    assert.equal(run(["link", "sim/grasp.py#run_trial", "Gb2"]).status, 0);
    assert.equal(run(["link", "sim/bin.py#in_bin", "Gc3"]).status, 0);
    const git = (...args: string[]): void => { spawnSync("git", args, { cwd: repo }); };
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "-m", "linked");
  });
  after(() => { rmSync(repo, { recursive: true, force: true }); });

  it("says nothing after a command that wrote nothing", () => {
    const r = shell("ls sim");
    assert.equal(r.status, 0);
    assert.equal(r.context, "");
  });

  it("names a link a command's write made suspect, and not again after the next command", () => {
    file("sim/grasp.py", "def run_trial(seed):\n    return 'dropped'\n");
    const r = shell("sed -i s/success/dropped/ sim/grasp.py");
    assert.equal(r.status, 0);
    assert.match(r.context, /sim\/grasp\.py/);
    assert.match(r.context, /run_trial.*changed.*\[Gb2\]/s);
    assert.match(r.context, /link sim\/grasp\.py#run_trial Gb2/);
    assert.equal(shell("git status").context, "", "a file the last scan saw, and nothing wrote since, is not named again");
  });

  it("does not name again, after a command, a file a file tool wrote and the scan already answered", () => {
    file("sim/bin.py", "def in_bin(item):\n    return item.z < 0.2\n");
    assert.match(hook("sim/bin.py").context, /in_bin/);
    assert.equal(shell("npm test").context, "");
  });

  it("names, in one line, the files a command made that have no links at all", () => {
    file("sim/tip.py", "def tip_check(angle):\n    return angle < 28\n");
    const r = shell("cat > sim/tip.py <<'EOF'\n...\nEOF");
    assert.match(r.context, /sim\/tip\.py/);
    assert.match(r.context, /no links/);
    assert.equal(r.context.split("\n").length, 1, r.context);
  });

  it("names, after a command rewrote a spec, the code linked to the text it changed", () => {
    file("docs/specs/grasp.md", readFileSync(join(repo, "docs/specs/grasp.md"), "utf8").replace("rests in the bin", "rests in the bin, upright"));
    const r = shell("sed -i 's/in the bin/in the bin, upright/' docs/specs/grasp.md");
    assert.match(r.context, /docs\/specs\/grasp\.md/);
    assert.match(r.context, /link sim\/bin\.py#in_bin Gc3/);
  });

  it("names a linked file a command deleted", () => {
    rmSync(join(repo, "sim/grasp.py"));
    const r = shell("rm sim/grasp.py");
    assert.match(r.context, /sim\/grasp\.py/);
    assert.match(r.context, /\[Gb2\]/);
  });

  it("answers a command that changed 3,000 files with what it names bounded, and a count of the rest", () => {
    for (let i = 0; i < 3000; i += 1) file(`gen/f${String(i)}.py`, `def f${String(i)}(x):\n    return x\n`);
    const r = shell("python3 generate.py");
    assert.equal(r.status, 0);
    assert.match(r.context, /3,?000 files/);
    assert.ok(r.context.split("\n").length <= 15, r.context);
    assert.ok(r.context.length < 4000, `${String(r.context.length)} characters`);
    process.stdout.write(`# the Bash scan over 3,000 changed files took ${r.ms.toFixed(0)} ms\n`);
  });

  it("says nothing after a command outside a git repository, where which files are the repository's is not known", () => {
    const bare = mkdtempSync(join(tmpdir(), "hook-nogit-"));
    try {
      writeFileSync(join(bare, "a.py"), "def a():\n    return 1\n");
      const r = spawnSync("node", [tool, "scan", "--hook"], { cwd: bare, input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "touch a.py" } }), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: bare } });
      assert.equal(r.status, 0);
      assert.equal(r.stdout.trim(), "");
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

/** `n` small functions, each unique so each has its own witness: `def f0(x):\n    return x\n`, and so on. */
function manyFunctions(n: number): string {
  return Array.from({ length: n }, (_, i) => `def f${String(i)}(x):\n    return x\n`).join("\n");
}

describe("[G0i]: a file's report is bounded to what a write touched, not to everything already unlinked in it", () => {
  before(() => {
    repo = mkdtempSync(join(tmpdir(), "hook-bounded-"));
    cpSync(join(ROOT, "skills/spec-driven-change"), join(repo, ".claude/skills/spec-driven-change"), { recursive: true });
    tool = join(repo, ".claude/skills/spec-driven-change/tools/railyard.mjs");
    file("docs/specs/grasp.md", "# Grasp\n\n**ID:** [Ga1]\n\n## Acceptance criteria\n\n1. [Gb2] A trial ends in success or one failure reason.\n");
    const git = (...args: string[]): void => { spawnSync("git", args, { cwd: repo }); };
    git("init", "-q");
    git("add", "-A");
    git("-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "-m", "init");
  });
  after(() => { rmSync(repo, { recursive: true, force: true }); });

  it("names only the one function a one-line edit changed, among 500 never-linked ones, through the Edit hook", () => {
    file("sim/big.py", manyFunctions(500));
    hook("sim/big.py"); // primes the note, as the file's first write would
    assert.equal(run(["link", "sim/big.py#f0", "Gb2"]).status, 0);
    file("sim/big.py", manyFunctions(500).replace("def f7(x):\n    return x", "def f7(x):\n    return x + 1"));
    const r = hook("sim/big.py");
    assert.equal(r.status, 0);
    assert.equal(r.context.split("\n").filter((l) => l.startsWith("- ")).length, 1);
    assert.match(r.context, /- f7: new, and linked to nothing\. `.*link sim\/big\.py#f7 <ID>\.\.\.`/);
    assert.match(r.context, /^498 other names in this file are linked to nothing; `.*links sim\/big\.py` lists them\.$/m);
  });

  it("names only the one function a shell-run write changed, among 500 never-linked ones, through the Bash hook", () => {
    file("sim/big2.py", manyFunctions(500));
    assert.equal(run(["link", "sim/big2.py#f0", "Gb2"]).status, 0);
    assert.equal(hook("sim/big2.py").status, 0); // primes the note, as an earlier write already made
    const git = (...args: string[]): void => { spawnSync("git", args, { cwd: repo }); };
    git("add", "-A");
    git("-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "-m", "add big2");
    file("sim/big2.py", manyFunctions(500).replace("def f9(x):\n    return x", "def f9(x):\n    return x + 1"));
    const r = shell("true");
    assert.equal(r.status, 0);
    assert.equal(r.context.split("\n").filter((l) => l.startsWith("- ")).length, 1);
    assert.match(r.context, /- f9: new, and linked to nothing\. `.*link sim\/big2\.py#f9 <ID>\.\.\.`/);
    assert.match(r.context, /^498 other names in this file are linked to nothing; `.*links sim\/big2\.py` lists them\.$/m);
  });

  it("shows twenty of the forty functions one write changed, and says how many more, through the Edit hook", () => {
    file("sim/many.py", manyFunctions(40));
    hook("sim/many.py"); // primes the note
    file("sim/many.py", manyFunctions(40).replaceAll("return x", "return x + 1"));
    const r = hook("sim/many.py");
    assert.equal(r.status, 0);
    assert.equal(r.context.split("\n").filter((l) => l.startsWith("- ")).length, 20);
    assert.match(r.context, /And 20 more: `.*links sim\/many\.py` lists them\./);
  });
});
