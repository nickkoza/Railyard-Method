// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard links | link | unlink | scan: the commands an agent keeps its links with as it writes
// code ([CS8], [G0i]), and the scan the skill's hook runs after every write ([HPg]).
//
// The hook never refuses an edit and always exits 0: a scan that fails costs visibility, never the
// agent's ability to work ([G0i]). Where it cannot run it says so, rather than saying nothing, which
// would read exactly like a file whose links are all current ([Wuq]).
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { changedUnder, isCode, link, linksPath, readLinks, scan, unlink } from "./links.ts";
import type { Confirm, Scan } from "./links.ts";
import { isArtifact } from "./paths.ts";
import { changedSinceLastScan, remember, touchedNames } from "./work-tree.ts";
import { namedThings } from "../traceability/anchor.ts";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** How to run this tool, as the agent would type it from the repository's root. */
function self(root: string): string {
  const script = process.argv[1] ?? "railyard.mjs";
  const near = relative(root, script);
  return `node ${near.startsWith("..") || isAbsolute(near) ? script : near.split(sep).join("/")}`;
}

function target(arg: string | undefined): { file: string; name: string } {
  // At the first `#`: a test's title is its name, and may hold one. What follows is read
  // exactly as the shell delivered it, quotes and all — a name is quoted for the shell only
  // when it has a space or another character the shell would split or expand ([5jT], the
  // commit "A name is quoted for the shell only when it has a space", d397fa9), and `thing`
  // is the one place that decides that. Stripping a leading and trailing `"` here as well,
  // for a name typed as `file#"a title"`, once stripped the real quotes off a name that opens
  // and closes with one for its own reasons, such as `"it's free"`, so the command `scan`
  // printed for exactly that name could not be run back into `link` as shown.
  const at = (arg ?? "").indexOf("#");
  const file = at < 0 ? (arg ?? "") : (arg ?? "").slice(0, at);
  const name = at < 0 ? "" : (arg ?? "").slice(at + 1);
  if (file === "" || name === "") throw new Error("name the thing as <file>#<name>, as `links <file>` lists them");
  return { file, name };
}

/** `<file>#<name>` as a shell reads it back: quoted where a test's title holds a space or anything else a shell would split or expand. */
function thing(file: string, name: string): string {
  const both = `${file}#${name}`;
  return /^[\w./#~@+:,=-]+$/.test(both) ? both : `'${both.replace(/'/g, "'\\''")}'`;
}

/** At most this many named things are listed in full for one file's report; a count says the rest. */
const SHOWN = 20;

/** A count as a person reads it: 3,000. */
function count(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * What a scan found, in words an agent acts on; empty where there is nothing to do. `touched`
 * bounds the unlinked names shown in full to those this write actually changed — new ones, and
 * ones whose code differs from what the last write left ([G0i], the Decisions); every other name
 * already unlinked before this write, and left alone by it, is folded into one line. Undefined
 * shows every unlinked name, as `scan <file>` and `links <file>` do: there is no "this write" to
 * bound by when the file is inspected rather than written.
 */
export function report(r: Scan, tool: string, touched?: ReadonlySet<string>): string {
  const lines: string[] = [];
  const cite = (ids: readonly string[]): string => ids.map((i) => `[${i}]`).join(", ");
  /** A name new here that another file of the same change had linked, and lost: moved, most likely. */
  const arrivedLine = (n: string): string | undefined => {
    const a = r.arrived.find((x) => x.name === n);
    return a === undefined ? undefined : `- ${n}: new here, and ${a.from} had it linked to ${cite(a.ids)} and has it no longer. If it moved, \`${tool} link ${thing(r.file, n)} ${a.ids.join(" ")}\` and \`${tool} unlink ${thing(a.from, n)}\`.`;
  };
  const shownUnlinked = r.unlinked.filter((n) => touched === undefined || touched.has(n));
  const quiet = r.unlinked.length - shownUnlinked.length;
  const quietLine = (): string | undefined => quiet === 0 ? undefined :
    `${count(quiet)} other name${quiet === 1 ? "" : "s"} in this file ${quiet === 1 ? "is" : "are"} linked to nothing; \`${tool} links ${r.file}\` lists them.`;

  if (!r.tracked) {
    if (r.unlinked.length === 0) return "";
    if (shownUnlinked.length === 0) return quietLine() ?? "";
    lines.push(`${r.file} has no links yet, so nothing traces it back to what it implements. Link each of its named things to the criteria or decisions it implements:`);
    for (const n of shownUnlinked.slice(0, SHOWN)) lines.push(arrivedLine(n) ?? `- ${n}: \`${tool} link ${thing(r.file, n)} <ID>...\``);
    if (shownUnlinked.length > SHOWN) lines.push(`And ${count(shownUnlinked.length - SHOWN)} more: \`${tool} links ${r.file}\` lists them.`);
    const quietSaid = quietLine();
    if (quietSaid !== undefined) lines.push(quietSaid);
    return lines.join("\n");
  }
  const bullets: string[] = [];
  for (const s of r.suspect) {
    const what = s.why === "code" ? "its code changed" : "the text of what it implements changed";
    bullets.push(`- ${s.name}: ${what} since it was linked to ${cite(s.ids)}. If it still implements them, confirm with \`${tool} link ${thing(r.file, s.name)} ${s.ids.join(" ")}\`; if not, link what it does implement, or \`${tool} unlink ${thing(r.file, s.name)}\`.`);
  }
  for (const m of r.missing) {
    bullets.push(m.to === undefined
      ? `- ${m.name}: gone, and it was linked to ${cite(m.ids)}. Link whatever implements them now, and \`${tool} unlink ${thing(r.file, m.name)}\`.`
      : `- ${m.name}: gone, and it was linked to ${cite(m.ids)}; ${m.to} has a ${m.name} now. If it moved, \`${tool} link ${thing(m.to, m.name)} ${m.ids.join(" ")}\` and \`${tool} unlink ${thing(r.file, m.name)}\`; if not, link whatever implements them now.`);
  }
  for (const g of r.gone) bullets.push(`- ${g.name}: linked to [${g.id}], which no longer names anything. Link what it implements now, and \`${tool} unlink ${thing(r.file, g.name)} ${g.id}\`.`);
  for (const n of shownUnlinked) bullets.push(arrivedLine(n) ?? `- ${n}: new, and linked to nothing. \`${tool} link ${thing(r.file, n)} <ID>...\``);
  if (bullets.length === 0) return quietLine() ?? "";
  lines.push(`${r.file}: its links need answering in this turn.`, ...bullets.slice(0, SHOWN));
  if (bullets.length > SHOWN) lines.push(`And ${count(bullets.length - SHOWN)} more: \`${tool} links ${r.file}\` lists them.`);
  const quietSaid = quietLine();
  if (quietSaid !== undefined) lines.push(quietSaid);
  return lines.join("\n");
}

/** What a write to an artifact left to confirm ([G0i]), in words an agent acts on; empty where nothing. */
export function artifactReport(artifact: string, changed: readonly Confirm[], tool: string): string {
  if (changed.length === 0) return "";
  const n = changed.length;
  const lines = [`${artifact}: its text changed under ${String(n)} linked thing${n === 1 ? ", which needs" : "s, which need"} answering in this turn. If the code still does what the text now says, confirm it; if not, change the code, or unlink it:`];
  for (const c of changed.slice(0, SHOWN)) {
    lines.push(`- ${c.file}#${c.name}, linked to ${c.ids.map((i) => `[${i}]`).join(", ")}: \`${tool} link ${thing(c.file, c.name)} ${c.ids.join(" ")}\``);
  }
  if (n > SHOWN) lines.push(`And ${String(n - SHOWN)} more: \`${tool} check\` names every one.`);
  return lines.join("\n");
}

/** Of the files a command changed that have links, at most this many are reported in full. */
const IN_FULL = 10;

/** A list of files named in one line: the first few, and how many more. */
function some(files: readonly string[]): string {
  return `${files.slice(0, 5).join(", ")}${files.length > 5 ? `, and ${count(files.length - 5)} more` : ""}`;
}

/**
 * What a shell command did to the links ([G0i]): the files it changed since the scan last looked,
 * each scanned as a file tool's write is, bounded so a command that rewrites thousands of files is
 * still answered in one screen (traceability's Decisions).
 */
export function shellReport(root: string, tool: string): string {
  const relevant = (f: string): boolean => isCode(f) || isArtifact(f) || existsSync(linksPath(root, f));
  const changes = changedSinceLastScan(root, relevant);
  if (changes === undefined) return "";
  const parts: string[] = [];
  for (const f of changes.deleted) {
    const kept = readLinks(root, f);
    if (kept === undefined) continue;
    const ids = [...new Set(kept.entries.flatMap((e) => e.links.map((l) => l.id)))];
    parts.push(`${f}: deleted, and its things were linked to ${ids.map((i) => `[${i}]`).join(", ")}. Link whatever implements them now, and remove symbols/links/${f}.json.`);
  }
  for (const f of changes.written.filter(isArtifact)) parts.push(artifactReport(f, changedUnder(root, f), tool));
  const untracked: string[] = [];
  const over: string[] = [];
  let full = 0;
  for (const f of changes.written.filter((x) => !isArtifact(x))) {
    if (readLinks(root, f) === undefined) {
      if (isCode(f) && namedThings(readFileSync(join(root, f), "utf8")).length > 0) untracked.push(f);
      continue;
    }
    if (full >= IN_FULL) {
      over.push(f);
      continue;
    }
    const things = namedThings(readFileSync(join(root, f), "utf8"));
    const text = report(scan(root, f), tool, touchedNames(root, f, things));
    if (text === "") continue;
    parts.push(text);
    full += 1;
  }
  if (over.length > 0) parts.push(`${count(over.length)} more file${over.length === 1 ? "" : "s"} with links changed, not scanned here: ${some(over)}. \`${tool} scan <file>...\` says what to answer in each.`);
  if (untracked.length > 0) {
    const n = untracked.length;
    parts.push(`${count(n)} file${n === 1 ? "" : "s"} the command changed ${n === 1 ? "has" : "have"} no links yet, so nothing traces ${n === 1 ? "it" : "them"} to what ${n === 1 ? "it implements" : "they implement"}: ${some(untracked)}. Link ${n === 1 ? "its" : "their"} things as you touch them; \`${tool} links <file>\` lists them.`);
  }
  return parts.filter((p) => p !== "").join("\n\n");
}

function hook(): number {
  const root = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const say = (text: string): void => {
    if (text !== "") process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } }));
  };
  try {
    const input = JSON.parse(readFileSync(0, "utf8")) as { tool_name?: unknown; tool_input?: { file_path?: unknown; command?: unknown } };
    // A shell command names no file: what it wrote is found by looking.
    if (input.tool_name === "Bash" || (input.tool_input?.file_path === undefined && typeof input.tool_input?.command === "string")) {
      say(shellReport(root, self(root)));
      return 0;
    }
    const path = input.tool_input?.file_path;
    if (typeof path !== "string") return 0;
    const file = relative(root, path).split(sep).join("/");
    if (file.startsWith("..") || isAbsolute(file)) return 0;
    if (isArtifact(file)) {
      say(artifactReport(file, changedUnder(root, file), self(root)));
      remember(root, file);
      return 0;
    }
    // A file already linked is kept whatever it is; otherwise only code is asked about.
    const things = namedThings(readFileSync(path, "utf8"));
    if (readLinks(root, file) === undefined && (!isCode(file) || things.length === 0)) return 0;
    say(report(scan(root, file), self(root), touchedNames(root, file, things)));
    remember(root, file);
  } catch (error) {
    say(`The railyard scan could not run after this write: ${error instanceof Error ? error.message : String(error)}. The file's links were not checked.`);
  }
  return 0;
}

const USAGE = [
  "usage: railyard links <file>                      what each named thing in the file implements, and whether it still does",
  "       railyard link <file>#<name> <ID>...        record that the thing implements each ID; again, to confirm it",
  "       railyard unlink <file>#<name> [<ID>...]    remove those links, or all of the thing's links",
  "       railyard scan <file>...                    what a change did to the files' links, as the scan says after a write",
  "",
  "  <name> is as `links <file>` lists it: `Class.method`, or a test's title, quoted for the shell",
  "  as a whole: 'test/x.test.ts#adds a bookmark'. An ID is written bare or bracketed: Ay4 or [Ay4].",
].join("\n");

/** A repository file named on the command line, refused in words where it is not there. */
function present(root: string, file: string): string {
  if (!existsSync(join(root, file))) throw new Error(`${file} is not a file here; name it relative to the repository's root, as \`links <file>\` takes it`);
  return file;
}

export function main(command: string, argv: readonly string[]): number {
  if (command === "scan" && argv.includes("--hook")) return hook();
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const root = process.cwd();
  try {
    if (command === "link" || command === "unlink") {
      const { file, name } = target(argv[0]);
      if (command === "link") present(root, file);
      const ids = argv.slice(1).map((i) => i.replace(/^\[|\]$/g, ""));
      if (command === "link") {
        if (ids.length === 0) throw new Error("name the IDs it implements: link <file>#<name> <ID>...");
        link(root, file, name, ids, today());
      } else {
        const removed = unlink(root, file, name, ids);
        if (!removed) throw new Error(`nothing was linked at ${thing(file, name)}${ids.length > 0 ? ` to ${ids.map((i) => `[${i}]`).join(", ")}` : ""}; nothing to unlink`);
      }
      process.stdout.write(`${command === "link" ? "Linked" : "Unlinked"} ${file}#${name}${ids.length > 0 ? ` ${ids.map((i) => `[${i}]`).join(", ")}` : ""}.\n`);
      return 0;
    }
    if (command === "links") {
      const file = argv[0];
      if (file === undefined) throw new Error("name the file: links <file>");
      const r = scan(root, present(root, file));
      const kept = new Map((readLinks(root, file)?.entries ?? []).map((e) => [e.name, e.links.map((l) => l.id)]));
      const state = (name: string): string => {
        const s = r.suspect.find((x) => x.name === name);
        if (s !== undefined) return s.why === "code" ? "suspect: its code changed" : "suspect: what it implements changed";
        return "current";
      };
      for (const t of namedThings(readFileSync(file, "utf8"))) {
        const ids = kept.get(t.name);
        process.stdout.write(ids === undefined ? `${t.name}  linked to nothing\n` : `${t.name}  ${ids.map((i) => `[${i}]`).join(", ")}  ${state(t.name)}\n`);
      }
      for (const m of r.missing) process.stdout.write(`${m.name}  gone, linked to ${m.ids.map((i) => `[${i}]`).join(", ")}\n`);
      if (!r.tracked) process.stdout.write(`(${file} has no links yet)\n`);
      return 0;
    }
    // scan <file>...: the same report the hook gives, for files named on the command line.
    const texts = argv.filter((a) => !a.startsWith("--")).map((f) => report(scan(root, present(root, f)), self(root))).filter((t) => t !== "");
    process.stdout.write(texts.length === 0 ? "Every link is current.\n" : `${texts.join("\n\n")}\n`);
    return texts.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
