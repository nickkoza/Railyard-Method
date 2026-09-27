// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The skill installing itself in a project, once ([4Ec]): its folder copied into the project, the
// method recorded, and the scan added to the project's Claude Code settings, where every session in
// the project runs it (the skill's Decisions say why the settings and not the skill's frontmatter).
//
// Settings are a person's configuration, so everything else in them is kept, and settings that
// cannot be read are refused before anything at all is changed.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { METHOD_VERSION, readMethodVersion, writeMethodVersion } from "./version.ts";

const SKILL = "spec-driven-change";
const HERE = `.claude/skills/${SKILL}`;
const SETTINGS = ".claude/settings.json";

/** Said when the skill is copied in: its bundled tool is built, not written, and a linter at the root would read it. */
export const LINT_NOTE = ".claude/skills/ holds generated files, the skill's bundled tool among them: have a linter or formatter run at the repository's root skip it.";

/** The scan, as the project's settings run it after every write. */
export const SCAN_COMMAND = `node "\${CLAUDE_PROJECT_DIR}/${HERE}/tools/railyard.mjs" scan --hook`;
/** The tools whose writes are scanned: the file tools, whose input names the file, and the shell, whose writes the scan finds by looking. */
const MATCHERS = ["Write|Edit|MultiEdit", "Bash"] as const;
const ALLOW = [`Skill(${SKILL})`, `Bash(node ${HERE}/tools/railyard.mjs:*)`];

type Hook = { type?: string; command?: string };
type Group = { matcher?: string; hooks?: Hook[] };
type Settings = { permissions?: { allow?: unknown[]; [k: string]: unknown }; hooks?: { PostToolUse?: Group[]; [k: string]: unknown }; [k: string]: unknown };

export type Installed = { readonly changed: readonly string[] };

function readSettings(project: string): Settings {
  const path = join(project, SETTINGS);
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("it is not a JSON object");
    return parsed as Settings;
  } catch (error) {
    throw new Error(`${SETTINGS} cannot be read (${error instanceof Error ? error.message : String(error)}), so nothing was changed: fix it, and install again`);
  }
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Every file under `dir`, by its path from there, to its bytes; empty where there is no such folder. */
function filesUnder(dir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.set(relative(dir, path), readFileSync(path));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

/** Whether two folders hold the same files with the same bytes, and nothing else. */
function sameFiles(a: string, b: string): boolean {
  const [x, y] = [filesUnder(a), filesUnder(b)];
  return x.size === y.size && [...x].every(([path, bytes]) => y.get(path)?.equals(bytes) === true);
}

/** Installs the skill from `from`, the folder it is running from, into `project`. */
export function install(project: string, from: string): Installed {
  const settings = readSettings(project);
  const changed: string[] = [];

  const target = join(project, HERE);
  const source = realpathSync(from);
  // A link there is not committed with the repository: a clone would find it pointing nowhere.
  const linked = isLink(target);
  const same = !linked && existsSync(target) && realpathSync(target) === source;
  if (!same && (linked || !sameFiles(target, source))) {
    // Replaced whole, so a file the skill no longer carries is gone from the copy too.
    if (linked) unlinkSync(target);
    else rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
    changed.push(linked
      ? `skill: the link at ${HERE} replaced by a copy of what it pointed at, to be committed with the repository`
      : `skill: copied into ${HERE}, to be committed with the repository`);
  }

  if (readMethodVersion(project) === null) {
    writeMethodVersion(project, METHOD_VERSION);
    changed.push(`method: recorded at ${METHOD_VERSION} in .railyard/method.json`);
  }

  const allow = [...(settings.permissions?.allow ?? [])];
  const missing = ALLOW.filter((a) => !allow.includes(a));
  const groups = [...(settings.hooks?.PostToolUse ?? [])];
  const unscanned = MATCHERS.filter((m) => !groups.some((g) => g.matcher === m && (g.hooks ?? []).some((h) => h.command === SCAN_COMMAND)));
  if (missing.length > 0 || unscanned.length > 0) {
    const next: Settings = {
      ...settings,
      permissions: { ...settings.permissions, allow: [...allow, ...missing] },
      hooks: { ...settings.hooks, PostToolUse: [...groups, ...unscanned.map((matcher) => ({ matcher, hooks: [{ type: "command", command: SCAN_COMMAND }] }))] },
    };
    mkdirSync(join(project, ".claude"), { recursive: true });
    writeFileSync(join(project, SETTINGS), `${JSON.stringify(next, null, 2)}\n`);
    changed.push(`settings: ${SETTINGS} scans every write, a shell command's among them${missing.length > 0 ? `, and allows ${missing.join(" and ")}` : ""}`);
  }
  return { changed };
}

/**
 * Whether the session running the install will run the scan ([4Ec]). Claude Code reloads a
 * project's settings when they change, so the scan is on from the next write, but only in a
 * session started in the project: a session reads the settings of the folder it was started in
 * (the skill's Decisions). `session` is that folder, where it can be found, and undefined where not.
 */
export function sessionNote(project: string, session: string | undefined): string {
  if (session === undefined) return `The scan runs in any session started in ${project}, from the next write.`;
  if (session === project) return "The scan is on from the next write, in this session and every one after.";
  return `This Claude Code session was started in ${session}, so it reads that folder's settings and will not run the scan. To have every write scanned, start Claude Code in ${project}.`;
}

/** Where the Claude Code session running this was started: its process's working directory, where the system shows it. */
function sessionFolder(): string | undefined {
  const pid = process.env["CLAUDE_PID"];
  if (pid === undefined || !/^\d+$/.test(pid)) return undefined;
  try {
    return realpathSync(readlinkSync(`/proc/${pid}/cwd`));
  } catch {
    return undefined;
  }
}

/** railyard install: run from the skill's folder, into the repository it is run in. */
export function main(): number {
  // The bundled tool lives at <skill>/tools/railyard.mjs.
  const from = dirname(dirname(realpathSync(process.argv[1] ?? "")));
  try {
    const done = install(process.cwd(), from);
    if (done.changed.length === 0) {
      process.stdout.write("Already installed: the skill, the method and the scan are all in place. Nothing changed.\n");
    } else {
      for (const c of done.changed) process.stdout.write(`${c.replace(/^\w+: /, "")}\n`);
      process.stdout.write("Commit these with the repository.\n");
      if (done.changed.some((c) => c.startsWith("skill:"))) process.stdout.write(`${LINT_NOTE}\n`);
    }
    process.stdout.write(`${sessionNote(realpathSync(process.cwd()), sessionFolder())}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`Not installed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
