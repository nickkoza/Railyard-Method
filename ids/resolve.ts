// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// `railyard-ids-resolve <id>…` — what a stable ID names.
//
// A citation in this repository is a bracketed ID, because a name and an ordinal both
// move: renaming a spec rewrote 65 references by hand once, and an ordinal means a
// different criterion the moment one is inserted above it. The cost of that is that a
// reader cannot see what `[k2P]` is. [EaR] settles which side pays:
// the ID is what the link holds, and the NAME is what gets displayed. This is the display.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTIFACT_PATHS } from "../method/paths.ts";
import { crossCitationsIn, resolveElsewhere } from "./elsewhere.ts";

/** An artifact's own ID, on its metadata line. */
const DECLARED = /\*\*ID:\*\*\s*\[([A-Za-z0-9]{3})\]/;
/** A criterion's or a principle's own ID, after its ordinal. */
const ORDINAL = /^(\d+)\.\s+\[([A-Za-z0-9]{3})\]\s+(.*)$/gm;
/** Markdown emphasis and code ticks, so the opening words read as words. */
const PLAIN = /[`*_]/g;

export type Resolved = {
  readonly id: string;
  /** What kind of thing it names, in words: "a criterion", "the spec". Never a form that names it by where it sits,
   * a spec's name and a criterion's number, which a reader would copy and the check would report ([pY5]). */
  readonly label: string | null;
  readonly path: string | null;
  /** The opening words of what it names, so the ID is legible without opening the file. */
  readonly text: string | null;
};

/** The kinds of thing an ID names. */
export type Kind = "spec" | "criterion" | "decision" | "waymark" | "principles" | "principle" | "model";

/** Each kind, in the words a tool says it in. */
const SAID: Readonly<Record<Kind, string>> = {
  spec: "the spec",
  criterion: "a criterion",
  decision: "a decision",
  waymark: "a waymark",
  principles: "the principles",
  principle: "a principle",
  model: "the architecture model",
};

/** Where an index reads from: a directory on disk, or a commit of some repository. */
export type Source = {
  read(path: string): string | undefined;
  /** The `.md` or `.json` files directly under `dir`, as repository paths, sorted. */
  list(dir: string): readonly string[];
};

/** A directory on disk, as a source. */
export function fromDirectory(root: string): Source {
  return {
    read(path) {
      try {
        return readFileSync(join(root, path), "utf8");
      } catch {
        return undefined;
      }
    },
    list(dir) {
      try {
        return readdirSync(join(root, dir)).filter((n) => n.endsWith(".md") || n.endsWith(".json")).sort().map((n) => `${dir}/${n}`);
      } catch {
        return [];
      }
    },
  };
}

/** What an ID names, with the whole of its text: the file for an artifact, its block for a numbered item; its kind, and its number's place in the file where it is a numbered item. */
export type Indexed = Resolved & { readonly body: string; readonly kind: Kind; readonly anchor: string | null };

/** A numbered item's block: from its line to the next item or heading. */
function blockAt(text: string, from: number): string {
  const rest = text.slice(from);
  const next = /\n(?=\d+\.\s|#)/.exec(rest.slice(1));
  return (next === null ? rest : rest.slice(0, next.index + 1)).trim();
}

/** Every declared ID a source holds, to what it names. Built by reading, because an ID names the thing rather than its place. */
export function indexOf(source: Source): ReadonlyMap<string, Indexed> {
  const found = new Map<string, Indexed>();
  const put = (id: string, kind: Kind, anchor: string | null, path: string, text: string, body: string): void => {
    if (!found.has(id)) found.set(id, { id, label: SAID[kind], kind, anchor, path, text: text.replace(PLAIN, "").trim().slice(0, 120), body });
  };
  const items = (text: string, path: string, kind: "criterion" | "decision" | "principle"): void => {
    for (const m of text.matchAll(ORDINAL)) {
      if (m[2] !== undefined) put(m[2], kind, `${kind}-${m[1] ?? ""}`, path, m[3] ?? "", blockAt(text, m.index));
    }
  };
  for (const path of source.list(ARTIFACT_PATHS.specs).filter((p) => p.endsWith(".md"))) {
    const text = source.read(path);
    if (text === undefined) continue;
    const name = path.slice(ARTIFACT_PATHS.specs.length + 1, -".md".length);
    const own = DECLARED.exec(text)?.[1];
    if (own !== undefined) put(own, "spec", null, path, text.split("\n")[0]?.replace(/^#\s*/, "") ?? name, text);
    // Criteria are what a spec's Acceptance criteria number, and decisions what its own Decisions do; nothing else numbered is either.
    for (const part of text.split(/\n(?=## )/)) {
      const heading = /^## (.+)/.exec(part)?.[1]?.trim().toLowerCase();
      if (heading === "acceptance criteria") items(part, path, "criterion");
      else if (heading === "decisions" || heading === "decision") items(part, path, "decision");
    }
  }
  for (const path of source.list(ARTIFACT_PATHS.waymarks).filter((p) => p.endsWith(".md"))) {
    const text = source.read(path);
    const n = /(\d{3,4})-/.exec(path)?.[1];
    if (text === undefined || n === undefined) continue;
    const own = DECLARED.exec(text)?.[1];
    if (own !== undefined) put(own, "waymark", null, path, text.split("\n")[0]?.replace(/^#\s*/, "") ?? "", text);
    items(text, path, "decision");
  }
  for (const path of source.list(ARTIFACT_PATHS.principles).filter((p) => p.endsWith(".md"))) {
    const text = source.read(path);
    if (text === undefined) continue;
    const own = DECLARED.exec(text)?.[1];
    if (own !== undefined) put(own, "principles", null, path, "Principles", text);
    items(text, path, "principle");
  }
  for (const path of source.list(ARTIFACT_PATHS.models).filter((p) => p.endsWith(".json"))) {
    const model = source.read(path);
    const modelId = model === undefined ? undefined : /"id":\s*"([A-Za-z0-9]{3})"/.exec(model)?.[1];
    if (model !== undefined && modelId !== undefined) put(modelId, "model", null, path, `the architecture model ${path.slice(ARTIFACT_PATHS.models.length + 1)}`, model);
  }
  return found;
}

/** Every declared ID at `root`. */
export function index(root: string): ReadonlyMap<string, Resolved> {
  return indexOf(fromDirectory(root));
}

export function resolveIds(root: string, ids: readonly string[]): readonly Resolved[] {
  const all = index(root);
  return ids.map((id) => {
    const found = all.get(id);
    return found === undefined ? { id, label: null, path: null, text: null } : { id, label: found.label, path: found.path, text: found.text };
  });
}

const USAGE = "usage: railyard-ids-resolve [<ID>...]   — what each stable ID names; with none, how many are declared";

export function main(argv: readonly string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const root = process.cwd();
  if (argv.length === 0) {
    const all = index(root);
    process.stdout.write(`${String(all.size)} stable IDs declared. Pass one or more to see what they name.\n`);
    return 0;
  }
  // A citation of another repository is resolved there, at the commit it names ([Bvq]).
  const elsewhere = argv.flatMap((a) => crossCitationsIn(a.startsWith("[") ? a : `[${a}]`));
  for (const r of resolveElsewhere(root, elsewhere)) {
    const where = r.path === undefined ? "" : `  (${r.path})`;
    const state = r.state === "suspect" ? `changed since, as of ${(r.tip ?? "").slice(0, 12)}` : r.state;
    process.stdout.write(r.state === "unresolvable" || r.state === "missing" || r.state === "unreachable"
      ? `${r.citation.written}  ${r.state}: ${r.why ?? ""}\n`
      : `${r.citation.written}  ${r.label ?? ""}${where}  ${state}${r.offline === true ? " (could not fetch just now)" : ""}\n          ${r.text ?? ""}\n`);
  }
  const here = argv.filter((a) => crossCitationsIn(a.startsWith("[") ? a : `[${a}]`).length === 0);
  for (const r of resolveIds(root, here.map((a) => a.replace(/^\[|\]$/g, "")))) {
    process.stdout.write(r.label === null
      ? `[${r.id}]  names nothing here\n`
      : `[${r.id}]  ${r.label}  (${r.path ?? ""})\n          ${r.text ?? ""}\n`);
  }
  return 0;
}
