// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [4Ec] — tier 1: the skill installs itself in a project, once. A copy of the skill's folder
// somewhere outside the project stands for wherever a person installed it.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { install, SCAN_COMMAND, sessionNote } from "./install.ts";
import { METHOD_VERSION, readMethodVersion } from "./version.ts";

const ROOT = join(import.meta.dirname, "..");
let base = "";
let skill = "";
let project = "";

function settings(): { permissions?: { allow?: string[] }; hooks?: { PostToolUse?: { matcher: string; hooks: { command: string }[] }[] }; [k: string]: unknown } {
  return JSON.parse(readFileSync(join(project, ".claude/settings.json"), "utf8")) as ReturnType<typeof settings>;
}

describe("[4Ec]: the skill installs itself in a project", () => {
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "install-"));
    skill = join(base, "home/.claude/skills/spec-driven-change");
    mkdirSync(dirname(skill), { recursive: true });
    cpSync(join(ROOT, "skills/spec-driven-change"), skill, { recursive: true });
    project = join(base, "project");
    mkdirSync(project);
  });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it("copies the skill in, records the method, and turns the scan on, saying each", () => {
    const done = install(project, skill);
    assert.ok(existsSync(join(project, ".claude/skills/spec-driven-change/SKILL.md")));
    assert.ok(existsSync(join(project, ".claude/skills/spec-driven-change/tools/railyard.mjs")));
    assert.equal(readMethodVersion(project), METHOD_VERSION);
    const s = settings();
    assert.ok(s.permissions?.allow?.includes("Skill(spec-driven-change)"));
    assert.ok(s.permissions?.allow?.includes("Bash(node .claude/skills/spec-driven-change/tools/railyard.mjs:*)"));
    const scan = s.hooks?.PostToolUse?.find((h) => h.hooks.some((x) => x.command === SCAN_COMMAND));
    assert.deepEqual(s.hooks?.PostToolUse?.filter((h) => h.hooks.some((x) => x.command === SCAN_COMMAND)).map((h) => h.matcher), ["Write|Edit|MultiEdit", "Bash"], "a write through the shell is scanned too");
    assert.equal(scan?.matcher, "Write|Edit|MultiEdit");
    assert.deepEqual(done.changed.map((c) => c.split(":")[0]), ["skill", "method", "settings"]);
  });

  it("changes nothing the second time, and says so", () => {
    install(project, skill);
    const before = readFileSync(join(project, ".claude/settings.json"), "utf8");
    const again = install(project, skill);
    assert.deepEqual(again.changed, []);
    assert.equal(readFileSync(join(project, ".claude/settings.json"), "utf8"), before);
  });

  it("adds the shell's scan to a project installed before the shell was scanned, and nothing twice", () => {
    install(project, skill);
    const s = settings();
    const only = { ...s, hooks: { ...s.hooks, PostToolUse: (s.hooks?.PostToolUse ?? []).filter((h) => h.matcher !== "Bash") } };
    writeFileSync(join(project, ".claude/settings.json"), `${JSON.stringify(only, null, 2)}\n`);
    const done = install(project, skill);
    assert.ok(done.changed.some((c) => c.startsWith("settings:")), done.changed.join("\n"));
    assert.deepEqual(settings().hooks?.PostToolUse?.map((h) => h.matcher), ["Write|Edit|MultiEdit", "Bash"]);
    assert.deepEqual(install(project, skill).changed, []);
  });

  it("keeps everything else the project's settings hold, its own hooks among them", () => {
    mkdirSync(join(project, ".claude"), { recursive: true });
    const own = { model: "opus", permissions: { allow: ["Bash(make:*)"], deny: ["Read(.env)"] }, hooks: { PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "prettier --write" }] }], Stop: [{ hooks: [{ type: "command", command: "echo done" }] }] } };
    writeFileSync(join(project, ".claude/settings.json"), JSON.stringify(own));
    install(project, skill);
    const s = settings();
    assert.equal(s["model"], "opus");
    assert.deepEqual((s.permissions as { deny?: string[] }).deny, ["Read(.env)"]);
    assert.ok(s.permissions?.allow?.includes("Bash(make:*)"));
    assert.ok(s.hooks?.PostToolUse?.some((h) => h.hooks.some((x) => x.command === "prettier --write")));
    assert.ok(s.hooks?.PostToolUse?.some((h) => h.hooks.some((x) => x.command === SCAN_COMMAND)));
    assert.ok((s.hooks as Record<string, unknown>)["Stop"]);
  });

  it("refuses settings it cannot read, and changes nothing at all", () => {
    mkdirSync(join(project, ".claude"), { recursive: true });
    writeFileSync(join(project, ".claude/settings.json"), "{ not json");
    assert.throws(() => install(project, skill), /\.claude\/settings\.json cannot be read.*nothing was changed/s);
    assert.equal(readFileSync(join(project, ".claude/settings.json"), "utf8"), "{ not json");
    assert.equal(existsSync(join(project, ".claude/skills/spec-driven-change")), false);
    assert.equal(existsSync(join(project, ".railyard/method.json")), false);
  });

  it("replaces a link to the skill with a copy, since a link outside the repository is not committed with it", () => {
    const here = join(project, ".claude/skills/spec-driven-change");
    mkdirSync(dirname(here), { recursive: true });
    symlinkSync(skill, here);
    const done = install(project, here);
    assert.ok(!lstatSync(here).isSymbolicLink(), "the link is now a folder of its own");
    assert.ok(existsSync(join(here, "SKILL.md")) && existsSync(join(here, "tools/railyard.mjs")));
    assert.ok(existsSync(join(skill, "SKILL.md")), "what the link pointed at is left as it was");
    assert.ok(done.changed.some((c) => c.startsWith("skill:")), done.changed.join("\n"));
  });

  it("drops from the copy a file the skill no longer carries", () => {
    install(project, skill);
    const stale = join(project, ".claude/skills/spec-driven-change/tools/old.mjs");
    writeFileSync(stale, "// dropped upstream\n");
    const done = install(project, skill);
    assert.equal(existsSync(stale), false);
    assert.ok(done.changed.some((c) => c.startsWith("skill:")), done.changed.join("\n"));
  });

  it("copies again when any file of the skill changed, its notices alone among them", () => {
    install(project, skill);
    writeFileSync(join(skill, "THIRD_PARTY_NOTICES.md"), `${readFileSync(join(skill, "THIRD_PARTY_NOTICES.md"), "utf8")}\nOne more.\n`);
    const done = install(project, skill);
    assert.match(readFileSync(join(project, ".claude/skills/spec-driven-change/THIRD_PARTY_NOTICES.md"), "utf8"), /One more\.\n$/);
    assert.ok(done.changed.some((c) => c.startsWith("skill:")), done.changed.join("\n"));
  });

  it("does not copy the skill onto itself when it already runs from the project", () => {
    install(project, skill);
    const done = install(project, join(project, ".claude/skills/spec-driven-change"));
    assert.deepEqual(done.changed, []);
  });
});

describe("[4Ec]: whether the session installing it will run the scan", () => {
  it("says the scan is on from the next write when the session was started in the project", () => {
    assert.match(sessionNote("/work/robot", "/work/robot"), /on from the next write/);
  });

  it("warns, naming both folders, when the session was started somewhere else", () => {
    const note = sessionNote("/work/robot", "/home/me");
    assert.match(note, /started in \/home\/me/);
    assert.match(note, /start Claude Code in \/work\/robot/);
  });

  it("says what it cannot tell, where the session's folder is not known", () => {
    assert.match(sessionNote("/work/robot", undefined), /in any session started in \/work\/robot/);
  });
});
