// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The architecture spec ([iVr]), held mechanically: the model is the authority ([rZB]) only if
// something fails when the code leaves it, and a view is drawn from the model ([CC6]) only if
// something fails when it names what the model does not have.
//
// Every rule reports; none repairs. A finding names the file and the rule, and which side is
// wrong is a judgement made in the open ([AUx]).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { z } from "zod";
import { ARTIFACT_PATHS } from "./paths.ts";
import { pythonImports } from "./python-imports.ts";
import { recordsAMoment } from "./repository.ts";

/** A finding fails the check; a notice is shown and does not. */
export type Finding = { readonly rule: "C4P" | "lLm" | "CC6" | "SKi" | "CLM" | "W7x" | "L7b"; readonly message: string; readonly notice?: boolean };

/** Read at a process boundary: a model is someone's file, and is validated rather than trusted. */
const Model = z.looseObject({
  nodes: z.array(z.looseObject({
    "unique-id": z.string().min(1),
    "node-type": z.string().min(1),
    "source-path": z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    details: z.looseObject({ "detailed-architecture": z.string().optional() }).optional(),
  })),
  relationships: z.array(z.looseObject({
    "relationship-type": z.looseObject({
      connects: z.looseObject({ source: z.looseObject({ node: z.string() }), destination: z.looseObject({ node: z.string() }) }).optional(),
      interacts: z.looseObject({ actor: z.string(), nodes: z.array(z.string()) }).optional(),
    }),
  })).default([]),
  metadata: z.looseObject({ id: z.string().optional() }).optional(),
});
type Model = z.infer<typeof Model>;

/** A CALM pattern: a JSON Schema, with its own `$id` and a `type`. */
function isPattern(raw: unknown): boolean {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) && typeof (raw as Record<string, unknown>)["$id"] === "string" && "type" in raw && !("nodes" in raw);
}

/** A CALM URL mapping: an object whose every key is a URL and every value a path. */
function isUrlMapping(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const entries = Object.entries(raw);
  return entries.length > 0 && entries.every(([k, v]) => /^https?:\/\//.test(k) && typeof v === "string");
}

/** The views' largest size ([SKi]). */
const MOST_IN_A_VIEW = 12;

/** The repository's own source: code and skills, never tests, fixtures, what a build writes, or the agent's own configuration under `.claude/`. */
export function isSource(path: string): boolean {
  if (path.startsWith(".claude/")) return false;
  // `*.test.ts`, and any kind a repository names with it: `*.docker-test.ts`, `*.live-test.ts`, `*.perf-test.ts`.
  if (/\.(?:[\w]+-)?test\.[cm]?[jt]sx?$/.test(path) || /(^|\/)(testing|tests)\//.test(path)) return false;
  return /\.(?:[cm]?[jt]sx?|rs|py)$/.test(path) || /(^|\/)SKILL\.md$/.test(path);
}

export function tracked(root: string): string[] {
  return execFileSync("git", ["-c", "core.fsmonitor=false", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter((f) => f !== "" && existsSync(join(root, f)));
}

function paths(node: Model["nodes"][number]): string[] {
  const p = node["source-path"];
  return (p === undefined ? [] : Array.isArray(p) ? p : [p]).map((s) => s.replace(/\/+$/, ""));
}

function under(file: string, path: string): boolean {
  return file === path || file.startsWith(`${path}/`);
}

/** The node at one level of the model that owns `file`: the longest matching source path, or why there is none. */
function ownerOf(model: Model, file: string): { readonly node: string } | { readonly none: true } | { readonly both: readonly string[] } {
  let best = -1;
  let owners: string[] = [];
  for (const node of model.nodes) {
    for (const p of paths(node)) {
      if (!under(file, p)) continue;
      if (p.length > best) {
        best = p.length;
        owners = [node["unique-id"]];
      } else if (p.length === best && !owners.includes(node["unique-id"])) {
        owners.push(node["unique-id"]);
      }
    }
  }
  if (owners.length === 0) return { none: true };
  const [only] = owners;
  return owners.length === 1 && only !== undefined ? { node: only } : { both: owners };
}

/** What contains what, by the model's own composition or deployment: each component's containers ([CLM]). */
function containersOf(model: Model): ReadonlyMap<string, readonly string[]> {
  const up = new Map<string, string[]>();
  for (const r of model.relationships) {
    const t = r["relationship-type"] as Record<string, unknown>;
    for (const kind of ["composed-of", "deployed-in"]) {
      const c = t[kind] as { container?: unknown; nodes?: unknown } | undefined;
      if (c === undefined || typeof c.container !== "string" || !Array.isArray(c.nodes)) continue;
      for (const n of c.nodes) if (typeof n === "string") up.set(n, [...(up.get(n) ?? []), c.container]);
    }
  }
  return up;
}

/** Every connection the model declares, as the pair it runs between: a `connects`, and an actor's `interacts` with each of its nodes. */
function connections(model: Model): (readonly [string, string])[] {
  return model.relationships.flatMap((r) => {
    const t = r["relationship-type"];
    return [
      ...(t.connects === undefined ? [] : [[t.connects.source.node, t.connects.destination.node] as const]),
      ...(t.interacts === undefined ? [] : t.interacts.nodes.map((n) => [t.interacts?.actor ?? "", n] as const)),
    ];
  });
}

function connected(model: Model, from: string, to: string): boolean {
  return connections(model).some(([a, b]) => a === from && b === to);
}

/** A component and everything it contains, by composition or deployment at any depth ([CC6]). */
function holdings(model: Model): (id: string) => ReadonlySet<string> {
  const down = new Map<string, string[]>();
  for (const [member, containers] of containersOf(model)) for (const c of containers) down.set(c, [...(down.get(c) ?? []), member]);
  return (id) => {
    const held = new Set([id]);
    const next = [id];
    for (let x = next.pop(); x !== undefined; x = next.pop()) {
      for (const m of down.get(x) ?? []) if (!held.has(m)) {
        held.add(m);
        next.push(m);
      }
    }
    return held;
  };
}

/** What a specifier may leave off, in the order a resolver tries them (the spec's Decisions). */
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
/** A JavaScript specifier naming the TypeScript file beside it, as NodeNext writes one. */
const AS_TYPESCRIPT: Readonly<Record<string, readonly string[]>> = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };

/** The file a relative specifier names among `files`, as the language's resolver would find it ([lLm]); undefined where none does. */
function resolveSpecifier(files: ReadonlySet<string>, from: string, spec: string): string | undefined {
  const path = posix.normalize(posix.join(posix.dirname(from), spec));
  const ext = posix.extname(path);
  const candidates = [
    path,
    ...EXTENSIONS.map((e) => `${path}${e}`),
    ...EXTENSIONS.map((e) => `${path}/index${e}`),
    ...(AS_TYPESCRIPT[ext] ?? []).map((e) => `${path.slice(0, -ext.length)}${e}`),
  ];
  return candidates.find((c) => files.has(c));
}

/** A script: its imports are read as JavaScript's and TypeScript's resolvers read them. */
const SCRIPT = /\.[cm]?[jt]sx?$/;
/** A file whose imports this reads ([lLm]): a script, or Python. */
const READ_IMPORTS = /\.(?:[cm]?[jt]sx?|py)$/;
/** The languages among the source whose imports are not read, named for the notice that says so ([lLm]). */
const LANGUAGES: Readonly<Record<string, string>> = { ".rs": "Rust" };

/** A file's imports, resolved to repository paths, and any `sys.path` addition it could not follow ([lLm]). */
function importsOf(root: string, file: string, files: ReadonlySet<string>): { readonly targets: readonly string[]; readonly unfollowed: readonly string[] } {
  const text = readFileSync(join(root, file), "utf8");
  if (!SCRIPT.test(file)) return pythonImports(root, file, text, files);
  // `import`, `export … from`, `import()` and `require()`, with a relative specifier.
  const found = [...text.matchAll(/(?:\bfrom\s+|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1] ?? "");
  return { targets: found.flatMap((spec) => resolveSpecifier(files, file, spec) ?? []), unfollowed: [] };
}

/** How the check reaches `calm validate`: a path to the CLI, or null to leave validation out (tests of the other rules). */
export type ArchitectureOptions = { readonly calm?: string | null };

/** The repository's own CALM CLI, or the one on the path. */
function calmFor(root: string): string {
  const own = join(root, "node_modules/.bin/calm");
  return existsSync(own) ? own : "calm";
}

export function checkArchitecture(root: string, options: ArchitectureOptions = {}): Finding[] {
  const found: Finding[] = [];
  const files = tracked(root);
  const trackedFiles = new Set(files);
  const dir = ARTIFACT_PATHS.models;

  const models = new Map<string, Model>();
  let mapping: string | undefined;
  for (const path of files.filter((f) => posix.dirname(f) === dir && f.endsWith(".json"))) {
    const raw: unknown = (() => {
      try {
        return JSON.parse(readFileSync(join(root, path), "utf8"));
      } catch {
        return undefined;
      }
    })();
    // A CALM pattern or URL mapping belongs beside the model it serves, and is told apart by
    // what it is, never by failing to read: anything else here must be a model ([L7b]).
    if (isPattern(raw) || isUrlMapping(raw)) {
      if (isUrlMapping(raw)) mapping = path;
      continue;
    }
    const parsed = Model.safeParse(raw);
    if (!parsed.success) {
      found.push({ rule: "L7b", message: `${path} is not a model this can read: ${parsed.error.issues[0]?.message ?? "not JSON"}` });
      continue;
    }
    models.set(path, parsed.data);
    if (!/^[A-Za-z0-9]{3}$/.test(parsed.data.metadata?.id ?? "")) found.push({ rule: "L7b", message: `${path} carries no stable ID in its metadata` });
  }

  // [L7b]: each model is what calm validate --strict accepts, with the URL mapping beside it where there is one.
  if (options.calm !== null) {
    const calm = options.calm ?? calmFor(root);
    for (const path of models.keys()) {
      const args = ["validate", "--strict", "--architecture", join(root, path), ...(mapping === undefined ? [] : ["--url-to-local-file-mapping", join(root, mapping)])];
      const r = spawnSync(calm, args, { cwd: root, encoding: "utf8" });
      if (r.error !== undefined) {
        // Everything else the tools do needs Node alone; this one check needs the CALM CLI, and says so rather than passing ([9p5]).
        found.push({ rule: "L7b", message: `${path} could not be validated: the CALM CLI is not installed here, neither in node_modules/.bin nor on the PATH (${r.error.message}). npm install -g @finos/calm-cli puts it on the PATH, where this check finds it, and npx @finos/calm-cli validate runs it once by hand; every other check ran` });
        break;
      }
      if (r.status !== 0) {
        const why = `${r.stdout}\n${r.stderr}`.split("\n").map((l) => l.trim()).find((l) => /error|must|invalid/i.test(l)) ?? `exit ${String(r.status)}`;
        found.push({ rule: "L7b", message: `${path} fails calm validate --strict: ${why}` });
      }
    }
  }

  if (models.size === 0 && files.some(isSource)) {
    found.push({ rule: "C4P", message: `this repository has source and no architecture model under ${dir}/ to say which component any of it belongs to` });
  }

  // Levels: each model not pointed at by another is a top level; each one pointed at sits under
  // the node that points at it, and covers exactly that node's files.
  const parentOf = new Map<string, { readonly model: string; readonly node: string }>();
  for (const [path, m] of models) {
    for (const node of m.nodes) {
      const detailed = node.details?.["detailed-architecture"];
      if (detailed === undefined) continue;
      if (!models.has(detailed)) found.push({ rule: "L7b", message: `${path}'s ${node["unique-id"]} points at ${detailed}, which is not a model here` });
      else parentOf.set(detailed, { model: path, node: node["unique-id"] });
    }
  }

  const sources = files.filter(isSource);
  /** Each file's imports, read once however many levels of the model hold it. */
  const read = new Map<string, ReturnType<typeof importsOf>>();
  const imports = (file: string): ReturnType<typeof importsOf> => {
    const known = read.get(file);
    if (known !== undefined) return known;
    const fresh = importsOf(root, file, trackedFiles);
    read.set(file, fresh);
    return fresh;
  };
  /** The files a level describes: everything at a top level, and its parent node's files below it. */
  const scopeOf = (path: string, seen = new Set<string>()): string[] => {
    const parent = parentOf.get(path);
    if (parent === undefined) return sources;
    if (seen.has(path)) return [];
    const parentModel = models.get(parent.model);
    if (parentModel === undefined) return [];
    return scopeOf(parent.model, new Set([...seen, path])).filter((f) => {
      const o = ownerOf(parentModel, f);
      return "node" in o && o.node === parent.node;
    });
  };

  for (const [path, m] of models) {
    const scope = scopeOf(path);
    const parent = parentOf.get(path);

    // [W7x]: a detailed architecture's source paths lie within its parent's.
    if (parent !== undefined) {
      const parentNode = models.get(parent.model)?.nodes.find((n) => n["unique-id"] === parent.node);
      const allowed = parentNode === undefined ? [] : paths(parentNode);
      for (const node of m.nodes) {
        for (const p of paths(node)) {
          if (!allowed.some((a) => under(p, a))) found.push({ rule: "W7x", message: `${path}'s ${node["unique-id"]} owns ${p}, outside ${parent.node}, the component it details` });
        }
      }
    }

    // [C4P]: every file in scope has exactly one owner at this level.
    for (const file of scope) {
      const o = ownerOf(m, file);
      if ("none" in o) found.push({ rule: "C4P", message: `${file} belongs to no component in ${path}: add it, or a directory above it, to the "source-path" of the node that owns it (one path, or a list of them)` });
      else if ("both" in o) found.push({ rule: "C4P", message: `${file} belongs to ${o.both.join(" and ")} in ${path}; it must belong to one` });
    }

    // [C4P]: a source path that names nothing yet is a component not built yet, or a path to correct.
    // Said, since it owns nothing and would pass unseen; a notice, since a model may run ahead of the code.
    for (const node of m.nodes) {
      for (const p of paths(node)) {
        if (!files.some((f) => under(f, p)) && !existsSync(join(root, p))) {
          found.push({ rule: "C4P", notice: true, message: `${path}'s ${node["unique-id"]} owns ${p}, which is not there yet: a component not built yet, or a "source-path" to correct` });
        }
      }
    }

    // [lLm]: an import from one component's files into another's is a declared connection.
    const inScope = new Set(scope);
    for (const file of scope.filter((f) => READ_IMPORTS.test(f))) {
      const from = ownerOf(m, file);
      if (!("node" in from)) continue;
      for (const target of imports(file).targets) {
        if (!inScope.has(target)) continue;
        const to = ownerOf(m, target);
        if ("node" in to && to.node !== from.node && !connected(m, from.node, to.node)) {
          found.push({ rule: "lLm", message: `${file} imports ${target}, from ${from.node} into ${to.node}, and ${path} declares no connection between them` });
        }
      }
    }
  }

  // [lLm]: what the check could not read is said, so that silence never passes for a look.
  if (models.size > 0) {
    for (const file of [...read.keys()].sort()) {
      const { unfollowed } = imports(file);
      if (unfollowed.length > 0) {
        found.push({ rule: "lLm", notice: true, message: `${file} adds to its import path in a way this cannot follow, so what it imports through that is not compared with the model: ${unfollowed.join("; ")}` });
      }
    }
    const unread = new Map<string, string[]>();
    for (const file of sources.filter((f) => !READ_IMPORTS.test(f) && !/(^|\/)SKILL\.md$/.test(f))) {
      const ext = posix.extname(file);
      const language = LANGUAGES[ext] ?? `${ext} files'`;
      unread.set(language, [...(unread.get(language) ?? []), file]);
    }
    for (const [language, those] of unread) {
      found.push({ rule: "lLm", notice: true, message: `${String(those.length)} ${language} source file${those.length === 1 ? "" : "s"}: their imports are not read, so what they reach is not compared with the model: ${those.slice(0, 5).join(", ")}${those.length > 5 ? `, and ${String(those.length - 5)} more` : ""}` });
    }
  }

  // [CC6], [SKi]: every diagram in an artifact is a view drawn from a model, and a small one.
  /** [CLM]: what each model's views draw, boxes among them. */
  const drawn = new Map<string, Set<string>>();
  for (const doc of files.filter((f) => f.endsWith(".md") && !recordsAMoment(root, f))) {
    // A view quoted as an example, inside a longer fence, is not a use of one, as a quoted citation is not.
    // A view may sit indented inside a list item, a numbered decision among them ([8g5]).
    const text = readFileSync(join(root, doc), "utf8").replace(/^([ \t]*)(`{4,})[^\n]*\n[\s\S]*?^\1\2\s*$/gm, "");
    for (const block of text.matchAll(/^([ \t]*)```mermaid\n([\s\S]*?)^\1```/gm)) {
      const lines = (block[2] ?? "").split("\n").map((l) => l.trim()).filter((l) => l !== "");
      const of = /^%%\s*view-of:\s*(\S+)$/.exec(lines[0] ?? "")?.[1];
      if (of === undefined) {
        found.push({ rule: "CC6", message: `${doc} has a diagram with no view-of line naming the model it is drawn from` });
        continue;
      }
      const m = models.get(of);
      if (m === undefined) {
        found.push({ rule: "CC6", message: `${doc} draws a view of ${of}, which is not a model here` });
        continue;
      }
      const ids = new Set(m.nodes.map((n) => n["unique-id"]));
      const holds = holdings(m);
      const pairs = connections(m);
      /** An arrow is the model's where it connects the two boxes, or anything each holds ([CC6]). */
      const through = (a: string, b: string): readonly [string, string] | undefined => {
        const from = holds(a);
        const to = holds(b);
        return pairs.find(([x, y]) => from.has(x) && to.has(y));
      };
      const shown = new Set<string>();
      const arrowed = new Set<string>();
      const seen = drawn.get(of) ?? new Set<string>();
      drawn.set(of, seen);
      const name = (id: string): void => {
        shown.add(id);
        seen.add(id);
        if (!ids.has(id)) found.push({ rule: "CC6", message: `${doc} draws ${id}, which ${of} does not have` });
      };
      for (const line of lines.slice(1)) {
        if (/^%%/.test(line) || line === "end" || /^(flowchart|graph)\s+(TB|TD|BT|RL|LR)$/.test(line) || /^direction\s+(TB|TD|BT|RL|LR)$/.test(line)) continue;
        // A box is a component or a boundary, drawn by its ID like any other ([CLM]).
        const box = /^subgraph\s+([\w-]+)(\s*\["[^"]*"\]|\s*\[[^\]]*\])?$/.exec(line);
        if (box?.[1] !== undefined) {
          name(box[1]);
          continue;
        }
        const edge = /^([\w-]+)\s*-->\s*([\w-]+)$/.exec(line);
        if (edge?.[1] !== undefined && edge[2] !== undefined) {
          name(edge[1]);
          name(edge[2]);
          arrowed.add(edge[1]);
          arrowed.add(edge[2]);
          if (ids.has(edge[1]) && ids.has(edge[2]) && through(edge[1], edge[2]) === undefined) {
            found.push({ rule: "CC6", message: `${doc} draws ${edge[1]} --> ${edge[2]}, a connection ${of} does not declare` });
          }
          continue;
        }
        const node = /^([\w-]+)$/.exec(line);
        if (node?.[1] !== undefined) {
          name(node[1]);
          continue;
        }
        found.push({ rule: "CC6", message: `${doc} has a view line this cannot read, "${line}": a component is its bare ID and the model gives its name` });
      }
      // [CC6]: a component drawn with no arrow, where the model connects it to another box drawn here.
      // A component not drawn is reached through the nearest drawn box that holds it.
      const up = containersOf(m);
      const boxesOf = (id: string, trail: ReadonlySet<string> = new Set()): string[] =>
        shown.has(id) ? [id] : (up.get(id) ?? []).filter((c) => !trail.has(c)).flatMap((c) => boxesOf(c, new Set([...trail, id])));
      for (const box of [...shown].filter((id) => ids.has(id) && !arrowed.has(id))) {
        const apart = (other: string): boolean => other !== box && !holds(box).has(other) && !holds(other).has(box);
        const reason = pairs.flatMap(([x, y]) => {
          const [xs, ys] = [boxesOf(x), boxesOf(y)];
          const to = xs.includes(box) ? ys.find(apart) : undefined;
          const from = ys.includes(box) ? xs.find(apart) : undefined;
          return to !== undefined ? [`to ${to} (${x} --> ${y})`] : from !== undefined ? [`from ${from} (${x} --> ${y})`] : [];
        })[0];
        if (reason !== undefined) {
          found.push({ rule: "CC6", message: `${doc} draws ${box} with no arrow, though ${of} connects it ${reason}: draw the arrow, or leave ${box} out of this view` });
        }
      }
      if (shown.size > MOST_IN_A_VIEW) found.push({ rule: "SKi", message: `${doc} draws a view of ${String(shown.size)} components; at most ${String(MOST_IN_A_VIEW)}` });
    }
  }

  // [CLM]: every component can be seen in some view, drawn or inside a drawn box.
  for (const [path, m] of models) {
    if (m.nodes.length < 2) continue;
    const seen = drawn.get(path);
    if (seen === undefined) {
      found.push({ rule: "CLM", message: `${path} has ${String(m.nodes.length)} components and no view: draw an overview in the system spec, its top level with each subsystem collapsed to its box` });
      continue;
    }
    const up = containersOf(m);
    const visible = (id: string, trail: ReadonlySet<string>): boolean =>
      seen.has(id) || (up.get(id) ?? []).some((c) => !trail.has(c) && visible(c, new Set([...trail, id])));
    const unseen = m.nodes.map((n) => n["unique-id"]).filter((id) => !visible(id, new Set()));
    if (unseen.length > 0) {
      found.push({ rule: "CLM", message: `${path}: no view shows ${unseen.slice(0, 8).join(", ")}${unseen.length > 8 ? `, and ${String(unseen.length - 8)} more` : ""}, drawn or inside a drawn box; add each to the view that should show it` });
    }
  }
  return found;
}
