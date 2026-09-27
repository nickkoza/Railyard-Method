// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// CALM architecture documents (traceability's Decisions): every docs/architecture/*.json
// that has a `nodes` array. A node is cited as CALM node `<id>`, its text is
// its JSON object, and its `source-path` assigns it the files beneath.
import { z } from "zod";
import { literal } from "./model.ts";
import type { Adapter, Artifact, Snapshot, SourcePath, Unreadable } from "./model.ts";
import { ARTIFACT_PATHS } from "../method/paths.ts";

const DOC = new RegExp(`^${ARTIFACT_PATHS.models}/[^/]+\\.json$`);
const CITE = /CALM node `([\w.-]+)`/g;
const CalmNode = z.looseObject({ "unique-id": z.string().min(1), "source-path": z.union([z.string().min(1), z.array(z.string().min(1))]).optional() });
const CalmDocument = z.looseObject({ nodes: z.array(CalmNode), metadata: z.looseObject({ id: z.string().optional() }).optional() });
/** A model's own stable ID, cited as any artifact's is: bracketed ([L7b]). */
const ID_CITE = /\[([A-Za-z0-9]{3})\]/g;
type CalmNode = z.infer<typeof CalmNode>;

type Parsed = { readonly path: string; readonly text: string; readonly nodes: readonly CalmNode[]; readonly id: string | undefined };
type Documents = { readonly docs: readonly Parsed[]; readonly unreadable: readonly Unreadable[] };

const bySnapshot = new WeakMap<Snapshot, Documents>();

function documents(at: Snapshot): Documents {
  const hit = bySnapshot.get(at);
  if (hit !== undefined) return hit;
  const docs: Parsed[] = [];
  const unreadable: Unreadable[] = [];
  for (const path of [...at.files()].filter((f) => DOC.test(f)).sort()) {
    const text = at.read(path);
    // A document git could not read is named by the query, with git's words (traceability's Decisions).
    if (text === undefined) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      unreadable.push({ path, reason: `it is not JSON: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (typeof raw !== "object" || raw === null || !("nodes" in raw)) continue;
    const parsed = CalmDocument.safeParse(raw);
    if (parsed.success) docs.push({ path, text, nodes: parsed.data.nodes, id: parsed.data.metadata?.id });
    else unreadable.push({ path, reason: `its nodes cannot be read: ${parsed.error.issues.map((i) => `${i.path.map(String).join(".")} ${i.message}`).join("; ")}` });
  }
  const read = { docs, unreadable };
  bySnapshot.set(at, read);
  return read;
}

/** A whole model, by its own ID: what it traces to is every file its nodes own. */
function model(doc: Parsed): Artifact {
  return doc.id === undefined ? { kind: "architecture-model", path: doc.path, anchor: null, label: doc.path } : { kind: "architecture-model", path: doc.path, anchor: null, label: `[${doc.id}]`, id: doc.id };
}

function node(path: string, id: string): Artifact {
  return { kind: "architecture-node", path, anchor: id, label: `CALM node \`${id}\`` };
}

/** The line of a node's `source-path` in its document; its `unique-id`'s when that cannot be found. */
function lineOf(text: string, id: string): number {
  const lines = text.split("\n");
  const own = new RegExp(`"unique-id"\\s*:\\s*"${literal(id)}"`);
  const start = lines.findIndex((l) => own.test(l));
  if (start < 0) return 1;
  for (let i = start; i < lines.length; i += 1) {
    const l = lines[i] ?? "";
    if (i > start && /"unique-id"\s*:/.test(l)) break;
    if (/"source-path"\s*:/.test(l)) return i + 1;
  }
  return start + 1;
}

export const calmAdapter: Adapter = {
  name: "calm",
  kinds: ["architecture-node", "architecture-model"],

  isArtifactFile(path) {
    return DOC.test(path);
  },

  cite(text, at) {
    const found: Artifact[] = [];
    for (const m of text.matchAll(CITE)) {
      const id = m[1] ?? "";
      const doc = documents(at).docs.find((d) => d.nodes.some((n) => n["unique-id"] === id));
      // A node no document declares is still cited: the query says it is missing.
      found.push(node(doc?.path ?? ARTIFACT_PATHS.models, id));
    }
    for (const m of text.matchAll(ID_CITE)) {
      const doc = documents(at).docs.find((d) => d.id === m[1]);
      if (doc !== undefined) found.push(model(doc));
    }
    return found;
  },

  fromPath(path, anchor, at) {
    if (!DOC.test(path)) return undefined;
    if (anchor !== null) return node(path, anchor);
    const doc = documents(at).docs.find((d) => d.path === path);
    return doc === undefined ? undefined : model(doc);
  },

  pattern(artifact) {
    if (artifact.kind === "architecture-model") return `\\[${literal(artifact.id ?? artifact.path)}\\]`;
    return `CALM node \`${literal(artifact.anchor ?? "")}\``;
  },

  textOf(artifact, at) {
    if (artifact.kind === "architecture-model") return documents(at).docs.find((d) => d.path === artifact.path)?.text;
    const found = documents(at).docs.find((d) => d.path === artifact.path)?.nodes.find((n) => n["unique-id"] === artifact.anchor);
    return found === undefined ? undefined : JSON.stringify(found);
  },

  testsNamed() {
    return { entries: [], unreadable: [] };
  },

  sourcePaths(at) {
    const { docs, unreadable } = documents(at);
    const entries: SourcePath[] = [];
    for (const doc of docs) {
      for (const n of doc.nodes) {
        const given = n["source-path"];
        // One path or a list of them ([C4P]); each assigns the node the files beneath it.
        for (const raw of given === undefined ? [] : Array.isArray(given) ? given : [given]) {
          const sourcePath = raw.replace(/\/+$/, "");
          if (sourcePath === "") continue;
          entries.push({ artifact: node(doc.path, n["unique-id"]), doc: doc.path, line: lineOf(doc.text, n["unique-id"]), sourcePath });
        }
      }
    }
    return { entries, unreadable };
  },
};
