// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [CS8], [5jT], [G0i], [Zs7] — tier 1: links kept per source file as the code is written, and the
// scan that keeps them true. A repository in a temporary directory, with no git.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { changedUnder, checkLinks, link, linksPath, readLinks, scan, unlink } from "./links.ts";
import { artifactReport, report } from "./links-cli.ts";
import { summary } from "./check-cli.ts";
import { execFileSync } from "node:child_process";

let root = "";

function file(path: string, body: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
}

const SPEC = "# Grasp\n\n**ID:** [Ga1]\n\n## Acceptance criteria\n\n1. [Gb2] A trial ends in success or one failure reason.\n2. [Gc3] Success means the item rests in the bin.\n";
const CODE = ["def run_trial(seed):", "    return 'success'", "", "def in_bin(item):", "    return item.z < 0.1", ""].join("\n");

describe("links kept per source file, and the scan that keeps them true", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "links-"));
    file("docs/specs/grasp.md", SPEC);
    file("sim/grasp.py", CODE);
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("[CS8]: records an asserted link beside the source, at a path derived from the file's own", () => {
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    assert.equal(linksPath(root, "sim/grasp.py"), join(root, "symbols/links/sim/grasp.py.json"));
    const kept = readLinks(root, "sim/grasp.py");
    assert.deepEqual(kept?.entries.map((e) => [e.name, e.links.map((l) => [l.id, l.kind, l.at])]), [["run_trial", [["Gb2", "asserted", "2026-09-24"]]]]);
  });

  it("refuses a name the file does not have, and an ID that names nothing", () => {
    assert.throws(() => link(root, "sim/grasp.py", "nope", ["Gb2"], "2026-09-24"), /no named thing "nope"/);
    assert.throws(() => link(root, "sim/grasp.py", "run_trial", ["Zz9"], "2026-09-24"), /\[Zz9\] names nothing/);
    assert.equal(existsSync(linksPath(root, "sim/grasp.py")), false, "a refused link writes nothing");
  });

  it("writes the same bytes whatever order the same links were made in", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    const one = readFileSync(linksPath(root, "sim/grasp.py"), "utf8");
    rmSync(join(root, "symbols"), { recursive: true });
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    assert.equal(readFileSync(linksPath(root, "sim/grasp.py"), "utf8"), one);
  });

  it("[Zs7]: calls a file with no links untracked, and names its things", () => {
    const r = scan(root, "sim/grasp.py");
    assert.equal(r.tracked, false);
    assert.deepEqual(r.unlinked, ["run_trial", "in_bin"]);
  });

  it("[5jT]: finds every link current until the code under it changes, and then suspect", () => {
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    assert.deepEqual(scan(root, "sim/grasp.py"), { file: "sim/grasp.py", tracked: true, suspect: [], missing: [], unlinked: [], gone: [], arrived: [] });
    file("sim/grasp.py", CODE.replace("item.z < 0.1", "item.z < 0.2"));
    const r = scan(root, "sim/grasp.py");
    assert.deepEqual(r.suspect, [{ name: "in_bin", ids: ["Gc3"], why: "code" }]);
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-25");
    assert.deepEqual(scan(root, "sim/grasp.py").suspect, [], "linking again confirms it");
  });

  it("[5jT]: finds a link suspect when the criterion it names has changed", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    file("docs/specs/grasp.md", SPEC.replace("rests in the bin", "rests in the bin, upright"));
    assert.deepEqual(scan(root, "sim/grasp.py").suspect, [{ name: "in_bin", ids: ["Gc3"], why: "artifact" }]);
  });

  it("[G0i]: names, for an artifact whose text changed, each link it leaves to confirm, with the command", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    file("sim/tip.py", "def tip_check(angle):\n    return angle < 28\n");
    link(root, "sim/tip.py", "tip_check", ["Gc3", "Gb2"], "2026-09-24");
    assert.deepEqual(changedUnder(root, "docs/specs/grasp.md"), []);
    assert.equal(artifactReport("docs/specs/grasp.md", [], "rail"), "", "nothing to say where no text changed");
    file("docs/specs/grasp.md", SPEC.replace("rests in the bin", "rests in the bin, upright"));
    const changed = changedUnder(root, "docs/specs/grasp.md");
    assert.deepEqual(changed, [{ file: "sim/grasp.py", name: "in_bin", ids: ["Gc3"] }, { file: "sim/tip.py", name: "tip_check", ids: ["Gc3"] }]);
    const said = artifactReport("docs/specs/grasp.md", changed, "rail");
    assert.match(said, /docs\/specs\/grasp\.md/);
    assert.match(said, /rail link sim\/grasp\.py#in_bin Gc3/);
    assert.match(said, /rail link sim\/tip\.py#tip_check Gc3`/, "only the link whose text changed: linking confirms it");
    assert.doesNotMatch(said, /run_trial/);
  });

  it("[G0i]: bounds what it names for an artifact under many links, and says how many more", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ file: `sim/f${String(i)}.py`, name: "x", ids: ["Gc3"] }));
    const said = artifactReport("docs/specs/grasp.md", many, "rail");
    assert.equal(said.split("\n").filter((l) => l.startsWith("- ")).length, 20);
    assert.match(said, /And 10 more/);
  });

  it("[5jT]: names a linked thing that is gone as missing, and a new one as unlinked", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    file("sim/grasp.py", CODE.replace("def in_bin(item):", "def rests_in_bin(item):"));
    const r = scan(root, "sim/grasp.py");
    assert.deepEqual(r.missing, [{ name: "in_bin", ids: ["Gc3"] }]);
    assert.deepEqual(r.unlinked, ["rests_in_bin"]);
  });

  it("names an ID a link holds that no longer names anything", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    file("docs/specs/grasp.md", SPEC.replace("2. [Gc3] Success means the item rests in the bin.\n", ""));
    assert.deepEqual(scan(root, "sim/grasp.py").gone, [{ name: "in_bin", id: "Gc3" }]);
  });

  it("removes a link, and the file's links file with its last one", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    assert.equal(unlink(root, "sim/grasp.py", "in_bin", ["Gc3"]), true);
    assert.equal(existsSync(linksPath(root, "sim/grasp.py")), false);
  });

  it("answers false, and writes nothing, when nothing was linked to remove", () => {
    assert.equal(unlink(root, "sim/grasp.py", "nothere", ["Zz9"]), false);
    assert.equal(existsSync(linksPath(root, "sim/grasp.py")), false);
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    assert.equal(unlink(root, "sim/grasp.py", "in_bin", ["Zz9"]), false, "Zz9 was never linked to in_bin");
    assert.deepEqual(readLinks(root, "sim/grasp.py")?.entries.find((e) => e.name === "in_bin")?.links.map((l) => l.id), ["Gc3"]);
  });
});

describe("[G0i]: a linked thing moved to another file in the same change", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "links-moved-"));
    file("docs/specs/grasp.md", SPEC);
    file("sim/grasp.py", CODE);
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "commit", "-q", "-m", "linked"], { cwd: root });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("says where a gone name is now, and what the new file's name was linked to, with the command that moves the link", () => {
    file("sim/grasp.py", ["def run_trial(seed):", "    return 'success'", ""].join("\n"));
    file("sim/bin.py", ["def in_bin(item):", "    return item.z < 0.1", ""].join("\n"));
    const from = scan(root, "sim/grasp.py");
    assert.deepEqual(from.missing, [{ name: "in_bin", ids: ["Gc3"], to: "sim/bin.py" }]);
    assert.match(report(from, "rail"), /rail link sim\/bin\.py#in_bin Gc3/);
    const to = scan(root, "sim/bin.py");
    assert.deepEqual(to.arrived, [{ name: "in_bin", ids: ["Gc3"], from: "sim/grasp.py" }]);
    assert.match(report(to, "rail"), /rail link sim\/bin\.py#in_bin Gc3/);
    assert.match(report(to, "rail"), /rail unlink sim\/grasp\.py#in_bin/);
  });

  it("follows a whole file moved, its old one deleted", () => {
    rmSync(join(root, "sim/grasp.py"));
    file("sim/trial.py", CODE);
    assert.deepEqual(scan(root, "sim/trial.py").arrived.map((a) => [a.name, a.from]), [["run_trial", "sim/grasp.py"], ["in_bin", "sim/grasp.py"]]);
  });
});

describe("[G0i]: check shows the state of the links, as notices and never as findings", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "links-check-"));
    file("docs/specs/grasp.md", SPEC);
    file("sim/grasp.py", CODE);
    file("sim/tip.py", "def tip_check(angle):\n    return angle < 28\n");
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it("names suspect links and a links file whose source is gone, and counts untracked files", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    file("sim/grasp.py", CODE.replace("item.z < 0.1", "item.z < 0.2"));
    file("symbols/links/sim/old.py.json", readFileSync(linksPath(root, "sim/grasp.py"), "utf8").replace('"path": "sim/grasp.py"', '"path": "sim/old.py"'));
    const found = checkLinks(root);
    assert.ok(found.every((f) => f.notice === true), "every one is a notice");
    const say = found.map((f) => f.message).join("\n");
    assert.match(say, /sim\/grasp\.py#in_bin.*changed.*\[Gc3\]/);
    assert.match(say, /sim\/old\.py.*no longer exists/);
    assert.match(say, /1 source file has no links.*sim\/tip\.py/);
  });

  it("[f4v]: closes by counting the notices that are links a change left to answer, and how to answer them", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    file("docs/specs/grasp.md", SPEC.replace("rests in the bin", "rests in the bin, upright"));
    const line = summary(checkLinks(root));
    assert.match(line, /^No findings; 2 notices, 1 of them a link a change left to answer/);
    assert.match(line, /`links <file>`/);
    assert.equal(summary([{ rule: "v0F", notice: true, message: "moved on" }]), "No findings; 1 notice.");
    assert.equal(summary([]), "No findings.");
    assert.match(summary([...checkLinks(root), { rule: "Xtd", message: "a row" }]), /^1 finding, and 2 notices, 1 of them a link a change left to answer/);
  });

  it("counts only code as source: a patch, a document or data holding a def line is not", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    link(root, "sim/tip.py", "tip_check", ["Gb2"], "2026-09-24");
    file("sim/fork.patch", "+def spin(n):\n+    return n\n");
    file("notes/how.txt", "def looks_like_code():\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    assert.deepEqual(checkLinks(root), []);
  });

  it("says nothing where every file is tracked and every link current", () => {
    link(root, "sim/grasp.py", "in_bin", ["Gc3"], "2026-09-24");
    link(root, "sim/grasp.py", "run_trial", ["Gb2"], "2026-09-24");
    link(root, "sim/tip.py", "tip_check", ["Gb2"], "2026-09-24");
    assert.deepEqual(checkLinks(root), []);
  });
});
