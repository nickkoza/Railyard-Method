// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

/// <reference types="node" preserve="true" />
// The reference above is for whoever installs this rather than for this repository. `BuildFile`,
// `stampOf`, `versionOf` and `stampInto` are public and speak in `Buffer`, a Node global; without the
// reference a consumer's compiler meets `Buffer` in these declarations and cannot say what it is,
// unless that consumer happens to include Node's types itself. `@types/node` is a dependency for the
// same reason. `preserve="true"` is not decoration: since TypeScript 5.5 the compiler drops a
// hand-written reference from the declarations it emits unless it is marked so — the source reads
// correctly and the published file does not carry it (observed TypeScript 6.0.3, 2026-09-22).
// The build hash ([DHL]).
// One thing rides in a built artifact: a SHA-256 over the build's own content,
// under Railyard's own name, `dev.railyard.build-hash`. No link, no artifact's
// name and no source position goes with it; everything else traceability knows
// lives in the symbols file. Each file is hashed with its own stamp removed
// first, as GNU build-id leaves its own note out, so that stamping is
// idempotent and a reader can recompute the hash from what was shipped.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { TraceRefusal } from "./model.ts";
// The version stamped into a build is the symbols format's own: it says what schema the
// symbols file this hash looks up is written to ([DHL]). symbols.ts does not import this
// module, so naming it here is one way round and no cycle.
import { FORMAT_VERSION } from "./symbols.ts";

/** Railyard's own name for the hash, in every place it rides. It never collides with another tool's. */
export const BUILD_HASH = "dev.railyard.build-hash";
/**
 * The name the format's own version rides under, beside the hash ([DHL]).
 *
 * The hash alone cannot be used safely: a reader that finds a symbols directory has to know what
 * schema it is about to read before it reads it, and a build naming only its hash leaves that to
 * be guessed from whichever directory the reader was pointed at. A reader meeting a version it
 * does not know says so and stops ([QBm]).
 */
export const SYMBOLS_VERSION = "dev.railyard.symbols-version";
/** What the hash is over, named in the hash itself, so that another scheme can never be read as this one. */
const SCHEME = "railyard-build/v1";
const HEX = "[0-9a-f]{64}";
const NAME = BUILD_HASH.replace(/\./g, "\\.");
const VERSION_NAME = SYMBOLS_VERSION.replace(/\./g, "\\.");
/** A version as this format writes it: three dot-separated numbers. */
const SEMVER = "[0-9]+\\.[0-9]+\\.[0-9]+";
/** Where each kind of artifact already keeps such a value. `none` has no place for it. */
const KINDS = ["page", "script", "source-map", "none"] as const;
type Kind = (typeof KINDS)[number];
/** A page keeps it in a meta element, a bundle in a trailing comment, and a source map in a top-level member (JSON has no comments). */
const META = new RegExp(`[ \\t]*<meta\\s+name="${NAME}"\\s+content="(${HEX})"\\s*/?>[ \\t]*\\r?\\n?`, "gi");
const COMMENT = new RegExp(`[ \\t]*//# ${NAME}=(${HEX})[ \\t]*\\r?\\n?`, "g");
const MEMBER = new RegExp(`(,)?\\s*"${NAME}"\\s*:\\s*"(${HEX})"\\s*(,)?`, "g");
const VERSION_META = new RegExp(`[ \\t]*<meta\\s+name="${VERSION_NAME}"\\s+content="(${SEMVER})"\\s*/?>[ \\t]*\\r?\\n?`, "gi");
const VERSION_COMMENT = new RegExp(`[ \\t]*//# ${VERSION_NAME}=(${SEMVER})[ \\t]*\\r?\\n?`, "g");
const VERSION_MEMBER = new RegExp(`(,)?\\s*"${VERSION_NAME}"\\s*:\\s*"(${SEMVER})"\\s*(,)?`, "g");
/** A bundle keeps its source map's URL last, so the stamp goes above it. */
const SOURCE_MAPPING = /^\/\/# sourceMappingURL=/m;

export const StampAnswer = z.strictObject({
  query: z.literal("stamp"),
  hash: z.string().regex(new RegExp(`^${HEX}$`)),
  /** The build's root: what every path is relative to, and so what the hash is over. */
  root: z.string().min(1),
  files: z.array(z.strictObject({ path: z.string().min(1), kind: z.enum(KINDS), stamped: z.boolean() })),
  /** How many of them carry the hash. */
  carried: z.number().int().nonnegative(),
});
export type StampAnswer = z.infer<typeof StampAnswer>;

/** A file of a build: its path from the build's root, and its bytes. */
export type BuildFile = { readonly path: string; readonly bytes: Buffer };

function kindOf(path: string): Kind {
  const name = path.toLowerCase();
  if (name.endsWith(".html") || name.endsWith(".htm")) return "page";
  if (name.endsWith(".map")) return "source-map";
  if (name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs")) return "script";
  return "none";
}

/** The stamp a file carries, or null: the hash alone, read from where its kind keeps it. */
export function stampOf(path: string, bytes: Buffer): string | null {
  const kind = kindOf(path);
  if (kind === "none") return null;
  const pattern = kind === "page" ? META : kind === "script" ? COMMENT : MEMBER;
  pattern.lastIndex = 0;
  const found = pattern.exec(bytes.toString("utf8"));
  if (found === null) return null;
  return (kind === "source-map" ? found[2] : found[1]) ?? null;
}

/**
 * The format version a built file carries, or null where its kind has no place for one or it
 * carries none. A build stamped by an older writer answers null rather than a guess ([DHL]).
 */
export function versionOf(path: string, bytes: Buffer): string | null {
  const kind = kindOf(path);
  if (kind === "none") return null;
  const pattern = kind === "page" ? VERSION_META : kind === "script" ? VERSION_COMMENT : VERSION_MEMBER;
  pattern.lastIndex = 0;
  const found = pattern.exec(bytes.toString("utf8"));
  if (found === null) return null;
  return (kind === "source-map" ? found[2] : found[1]) ?? null;
}

/** A JSON document without the member, keeping one comma where it sat between two. */
function withoutMember(text: string, pattern: RegExp): string {
  let out = text;
  for (;;) {
    pattern.lastIndex = 0;
    const found = pattern.exec(out);
    if (found === null) return out;
    const between = found[1] !== undefined && found[3] !== undefined;
    out = `${out.slice(0, found.index)}${between ? "," : ""}${out.slice(found.index + found[0].length)}`;
  }
}

/** A file with its own stamp taken out: what the hash is over, so that the hash can be recomputed from the stamped build. */
function bare(path: string, bytes: Buffer): Buffer {
  const kind = kindOf(path);
  if (kind === "none") return bytes;
  const text = bytes.toString("utf8");
  // Both stamps come out: the hash is over the build's content, so neither the hash nor the
  // version it was written under may count towards it, or stamping would change what it names.
  if (kind === "page") return Buffer.from(text.replace(META, "").replace(VERSION_META, ""), "utf8");
  if (kind === "script") return Buffer.from(text.replace(COMMENT, "").replace(VERSION_COMMENT, ""), "utf8");
  return Buffer.from(withoutMember(withoutMember(text, MEMBER), VERSION_MEMBER), "utf8");
}

/**
 * The build's hash: the scheme tag, then every file sorted by its path, each as its path, its length and its bytes,
 * with its own stamp removed first. Content alone counts, so the same build gives the same hash on any machine.
 */
export function buildHash(files: readonly BuildFile[]): string {
  const hash = createHash("sha256");
  hash.update(`${SCHEME}\0`);
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const without = bare(file.path, file.bytes);
    hash.update(`${file.path}\0${String(without.length)}\0`);
    hash.update(without);
  }
  return hash.digest("hex");
}

/**
 * A file carrying the hash where its kind keeps one, or null when its kind has no place for it. Where the hash rides
 * is the format's own rule ([DHL]), so anything that stamps a build — a command that writes the files, or
 * a server that stamps what it serves ([DHL]) — writes no markup of its own.
 */
export function stampInto(path: string, bytes: Buffer, hash: string): Buffer | null {
  const kind = kindOf(path);
  if (kind === "none") return null;
  const text = bare(path, bytes).toString("utf8");
  if (kind === "page") {
    const meta = `<meta name="${BUILD_HASH}" content="${hash}">\n  <meta name="${SYMBOLS_VERSION}" content="${FORMAT_VERSION}">`;
    const head = text.indexOf("</head>");
    return Buffer.from(head < 0 ? `${meta}\n${text}` : `${text.slice(0, head)}  ${meta}\n${text.slice(head)}`, "utf8");
  }
  if (kind === "script") {
    const comment = `//# ${BUILD_HASH}=${hash}\n//# ${SYMBOLS_VERSION}=${FORMAT_VERSION}\n`;
    const at = text.search(SOURCE_MAPPING);
    if (at >= 0) return Buffer.from(`${text.slice(0, at)}${comment}${text.slice(at)}`, "utf8");
    return Buffer.from(text.endsWith("\n") || text === "" ? `${text}${comment}` : `${text}\n${comment}`, "utf8");
  }
  const open = text.indexOf("{");
  if (open < 0) return null;
  return Buffer.from(`${text.slice(0, open + 1)}"${BUILD_HASH}":"${hash}","${SYMBOLS_VERSION}":"${FORMAT_VERSION}",${text.slice(open + 1)}`, "utf8");
}

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** The directory every path is under: a build's root, so that where the build sits changes nothing. */
function rootOf(paths: readonly string[]): string {
  const dirs = paths.map((path) => (statSync(path).isDirectory() ? resolve(path) : dirname(resolve(path))));
  let root = dirs[0] ?? process.cwd();
  for (const dir of dirs) {
    const here = root.split(sep);
    const there = dir.split(sep);
    let i = 0;
    while (i < here.length && i < there.length && here[i] === there[i]) i += 1;
    root = here.slice(0, i).join(sep) || sep;
  }
  return root;
}

/**
 * Hashes the files and directories named, and writes the hash into each file whose kind has a place for it. A file
 * whose kind has none is named in the answer and still counted in the hash. When no file can carry it, it refuses:
 * a build nothing carries the hash in could never have its symbols looked up.
 */
export function stampBuild(paths: readonly string[]): StampAnswer {
  if (paths.length === 0) throw new TraceRefusal("no file or directory was named to stamp");
  for (const path of paths) {
    if (!existsSync(path)) throw new TraceRefusal(`${path} is not there, so it cannot be stamped`);
  }
  const root = rootOf(paths);
  const found = [...new Set(paths.flatMap((path) => (statSync(path).isDirectory() ? filesUnder(path) : [resolve(path)])))].sort();
  const files = found.map((absolute) => ({ path: relative(root, absolute).split(sep).join("/"), absolute, bytes: readFileSync(absolute) }));
  if (!files.some((file) => kindOf(file.path) !== "none")) {
    throw new TraceRefusal(`no file here has a place for ${BUILD_HASH}: a page, a script bundle or a source map carries it, and none of the ${String(files.length)} files is one`);
  }
  const hash = buildHash(files);
  const written = files.map((file) => {
    const stamped = stampInto(file.path, file.bytes, hash);
    if (stamped !== null) {
      // It is written only where it can be read back: a build that looks stamped and is not is the worst answer.
      if (stampOf(file.path, stamped) !== hash) throw new TraceRefusal(`${file.path} does not carry ${BUILD_HASH} after it was written, so it is left as it was`);
      // The version is read back on the same terms and for the same reason: a build carrying a
      // hash whose schema it does not state is a build whose symbols cannot be read safely.
      if (versionOf(file.path, stamped) !== FORMAT_VERSION) {
        throw new TraceRefusal(`${file.path} does not carry ${SYMBOLS_VERSION} after it was written, so its symbols could not be read safely`);
      }
      writeFileSync(file.absolute, stamped);
    }
    return { path: file.path, kind: kindOf(file.path), stamped: stamped !== null };
  });
  return StampAnswer.parse({ query: "stamp", hash, root, files: written, carried: written.filter((file) => file.stamped).length });
}
