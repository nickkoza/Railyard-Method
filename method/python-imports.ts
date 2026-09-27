// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// A Python file's imports, resolved to the repository's own files as Python's import system would
// find them, so an import across components is compared with the model as a script's is ([lLm]).
// What is read and what is not is the architecture spec's decision on how a Python import names a
// file; anything it cannot follow is said, never guessed at.
import { posix } from "node:path";

/** What a Python file imports from the repository, and the `sys.path` additions it could not follow. */
export type PythonImports = { readonly targets: readonly string[]; readonly unfollowed: readonly string[] };

/**
 * The file's logical statements: comments dropped, a triple-quoted string emptied, lines joined
 * inside brackets and after a backslash, and split at a newline or a `;` outside them.
 */
export function statementsOf(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  const push = (): void => {
    const s = cur.trim();
    if (s !== "") out.push(s);
    cur = "";
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i] ?? "";
    if (ch === "#") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const triple = text.startsWith(ch.repeat(3), i);
      const quote = triple ? ch.repeat(3) : ch;
      let j = i + quote.length;
      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text.startsWith(quote, j)) {
          j += quote.length;
          break;
        }
        if (!triple && text[j] === "\n") break;
        j += 1;
      }
      // A docstring's words are never an import; a one-line string may be a path, and is kept.
      cur += triple ? `${ch}${ch}` : text.slice(i, j);
      i = j;
      continue;
    }
    if (ch === "\\" && text[i + 1] === "\n") {
      cur += " ";
      i += 2;
      continue;
    }
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
    if (ch === "\n") {
      if (depth > 0) cur += " ";
      else push();
    } else if (ch === ";" && depth === 0) {
      push();
    } else {
      cur += ch;
    }
    i += 1;
  }
  push();
  // A one-line compound statement, `try: import x`, holds its statement after the colon.
  return out.map((s) => /^(?:try|else|finally)\s*:\s*(\S.*)$/.exec(s)?.[1] ?? /^(?:if|elif|except|with)\b[^:"'[]*:\s*(\S.*)$/.exec(s)?.[1] ?? s);
}

type Ast =
  | { readonly k: "str"; readonly v: string }
  | { readonly k: "num"; readonly v: number }
  | { readonly k: "name"; readonly v: string }
  | { readonly k: "attr"; readonly obj: Ast; readonly name: string }
  | { readonly k: "call"; readonly fn: Ast; readonly args: readonly Ast[] }
  | { readonly k: "index"; readonly obj: Ast; readonly idx: Ast }
  | { readonly k: "div"; readonly l: Ast; readonly r: Ast };

/** A small expression: strings, names, attributes, calls, indexing and `/`. Undefined for anything else. */
export function parseExpression(src: string): Ast | undefined {
  let at = 0;
  const space = (): void => {
    while (at < src.length && /\s/.test(src[at] ?? "")) at += 1;
  };
  const expr = (): Ast | undefined => {
    let l = term();
    space();
    while (l !== undefined && src[at] === "/" && src[at + 1] !== "/") {
      at += 1;
      const r = term();
      if (r === undefined) return undefined;
      l = { k: "div", l, r };
      space();
    }
    return l;
  };
  const atom = (): Ast | undefined => {
    space();
    const str = /^([rRuU]?)(["'])((?:\\.|(?!\2).)*)\2/.exec(src.slice(at));
    if (str !== null) {
      at += str[0].length;
      return { k: "str", v: str[3] ?? "" };
    }
    const num = /^\d+/.exec(src.slice(at));
    if (num !== null) {
      at += num[0].length;
      return { k: "num", v: Number(num[0]) };
    }
    const name = /^[A-Za-z_]\w*/.exec(src.slice(at));
    if (name !== null) {
      at += name[0].length;
      return { k: "name", v: name[0] };
    }
    if (src[at] === "(") {
      at += 1;
      const e = expr();
      space();
      if (src[at] !== ")") return undefined;
      at += 1;
      return e;
    }
    return undefined;
  };
  const term = (): Ast | undefined => {
    let t = atom();
    for (;;) {
      if (t === undefined) return undefined;
      space();
      const c = src[at];
      if (c === ".") {
        at += 1;
        space();
        const name = /^[A-Za-z_]\w*/.exec(src.slice(at));
        if (name === null) return undefined;
        at += name[0].length;
        t = { k: "attr", obj: t, name: name[0] };
      } else if (c === "(") {
        at += 1;
        const args: Ast[] = [];
        space();
        if (src[at] === ")") at += 1;
        else {
          for (;;) {
            const a = expr();
            if (a === undefined) return undefined;
            args.push(a);
            space();
            if (src[at] === ",") {
              at += 1;
              space();
              if (src[at] === ")") {
                at += 1;
                break;
              }
              continue;
            }
            if (src[at] === ")") {
              at += 1;
              break;
            }
            return undefined;
          }
        }
        t = { k: "call", fn: t, args };
      } else if (c === "[") {
        at += 1;
        const idx = expr();
        space();
        if (idx === undefined || src[at] !== "]") return undefined;
        at += 1;
        t = { k: "index", obj: t, idx };
      } else {
        return t;
      }
    }
  };
  const e = expr();
  space();
  return at === src.length ? e : undefined;
}

/** A value a path expression takes: a repository path (`.` is the root), a string, or a module's dotted name. */
type Value =
  | { readonly path: string }
  | { readonly str: string }
  | { readonly dotted: string }
  | { readonly num: number }
  | { readonly parents: string }
  | { readonly method: string; readonly self: Value }
  | { readonly outside: true };

/** What an expression is evaluated against: the file it is in, the repository's absolute root, and the names the file binds. */
type Context = { readonly file: string; readonly root: string; readonly bound: ReadonlyMap<string, Ast | null> };

function asPath(v: Value | undefined): string | undefined {
  if (v === undefined) return undefined;
  if ("path" in v) return v.path;
  if ("str" in v) return within(v.str);
  return undefined;
}

/** A path normalised to the repository, or undefined where it leaves it. */
function within(path: string): string | undefined {
  const p = posix.normalize(path === "" ? "." : path).replace(/\/+$/, "") || ".";
  return p === ".." || p.startsWith("../") || p.startsWith("/") ? undefined : p;
}

function up(path: string, times: number): string | undefined {
  let p = path;
  for (let n = 0; n < times; n += 1) {
    if (p === ".") return undefined;
    p = posix.dirname(p);
  }
  return p;
}

function join(parts: readonly (Value | undefined)[]): Value | undefined {
  const [first, ...rest] = parts;
  if (first === undefined) return undefined;
  if ("outside" in first) return first;
  const pieces: string[] = [];
  for (const r of rest) {
    if (r === undefined || !("str" in r)) return undefined;
    pieces.push(r.str);
  }
  if ("path" in first) {
    const p = within(posix.join(first.path, ...pieces));
    return p === undefined ? undefined : { path: p };
  }
  if ("str" in first) return { str: posix.join(first.str, ...pieces) };
  return undefined;
}

const IDENTITY = new Set(["str", "os.fspath", "os.path.abspath", "os.path.realpath", "os.path.normpath"]);
const PATH_TYPES = new Set(["Path", "PurePath", "PosixPath", "pathlib.Path", "pathlib.PurePath", "pathlib.PosixPath"]);
const MODULES = new Set(["os", "pathlib", "sys"]);

/** What a path expression evaluates to, relative to `file` and the repository's root; undefined where it cannot be known here. */
function evaluate(ast: Ast, ctx: Context, trail: ReadonlySet<string>): Value | undefined {
  const ev = (a: Ast): Value | undefined => evaluate(a, ctx, trail);
  switch (ast.k) {
    case "str": {
      // An absolute path is the repository's where it lies inside it, and nothing of the repository's where it does not.
      if (!ast.v.startsWith("/")) return { str: ast.v };
      const rel = posix.relative(ctx.root, ast.v);
      const p = rel.startsWith("..") || posix.isAbsolute(rel) ? undefined : within(rel);
      return p === undefined ? { outside: true } : { path: p };
    }
    case "num":
      return { num: ast.v };
    case "name": {
      if (ast.v === "__file__") return { path: ctx.file };
      if (MODULES.has(ast.v) || PATH_TYPES.has(ast.v) || IDENTITY.has(ast.v)) return { dotted: ast.v };
      const b = ctx.bound.get(ast.v);
      if (b === undefined || b === null || trail.has(ast.v)) return undefined;
      return evaluate(b, ctx, new Set([...trail, ast.v]));
    }
    case "attr": {
      const obj = ev(ast.obj);
      if (obj === undefined) return undefined;
      if ("dotted" in obj) return { dotted: `${obj.dotted}.${ast.name}` };
      if (ast.name === "parent" && "path" in obj) {
        const p = up(obj.path, 1);
        return p === undefined ? undefined : { path: p };
      }
      if (ast.name === "parents" && "path" in obj) return { parents: obj.path };
      if (["resolve", "absolute", "expanduser", "joinpath"].includes(ast.name)) return { method: ast.name, self: obj };
      return undefined;
    }
    case "index": {
      const obj = ev(ast.obj);
      const idx = ev(ast.idx);
      if (obj === undefined || idx === undefined || !("parents" in obj) || !("num" in idx)) return undefined;
      const p = up(obj.parents, idx.num + 1);
      return p === undefined ? undefined : { path: p };
    }
    case "div": {
      const l = ev(ast.l);
      if (l === undefined || !("path" in l || "outside" in l)) return undefined;
      const r = ev(ast.r);
      return join([l, r]);
    }
    case "call": {
      const fn = ev(ast.fn);
      const args = ast.args.map(ev);
      if (fn !== undefined && "method" in fn) {
        if (fn.method === "joinpath") return join([fn.self, ...args]);
        return args.length === 0 ? fn.self : undefined;
      }
      if (fn === undefined || !("dotted" in fn)) return undefined;
      const name = fn.dotted;
      if (PATH_TYPES.has(name)) {
        const [first, ...rest] = args;
        if (first === undefined) return { path: "." };
        const base = "path" in first || "outside" in first ? first : "str" in first ? (() => {
          const p = asPath(first);
          return p === undefined ? undefined : { path: p };
        })() : undefined;
        return base === undefined ? undefined : join([base, ...rest]);
      }
      if (IDENTITY.has(name)) return args.length === 1 ? args[0] : undefined;
      if (name === "os.path.dirname" && args.length === 1) {
        const a = args[0];
        if (a !== undefined && "outside" in a) return a;
        if (a !== undefined && "path" in a) {
          const p = up(a.path, 1);
          return p === undefined ? undefined : { path: p };
        }
        if (a !== undefined && "str" in a) return { str: posix.dirname(a.str) };
        return undefined;
      }
      if (name === "os.path.join") return join(args);
      if (name === "os.getcwd" || name === "Path.cwd" || name === "pathlib.Path.cwd") return args.length === 0 ? { path: "." } : undefined;
      return undefined;
    }
  }
}

/** The arguments of the call opening at `open` (an index of its `(`), split at their top-level commas. */
function argumentsAt(text: string, open: number): string[] | undefined {
  let depth = 0;
  let quote: string | undefined;
  const args: string[] = [];
  let start = open + 1;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i] ?? "";
    if (quote !== undefined) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = undefined;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if ("([{".includes(c)) depth += 1;
    else if (")]}".includes(c)) {
      depth -= 1;
      if (depth === 0) {
        args.push(text.slice(start, i).trim());
        return args.filter((a) => a !== "");
      }
    } else if (c === "," && depth === 1) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return undefined;
}

/** `a/b.py` or `a/b/__init__.py` under `base`, for the dotted name `a.b`. */
function moduleFile(files: ReadonlySet<string>, base: string, dotted: string): string | undefined {
  const rel = dotted.split(".").join("/");
  const p = base === "." ? rel : `${base}/${rel}`;
  return [`${p}.py`, `${p}/__init__.py`].find((f) => files.has(f));
}

/** The imports of a Python file, resolved to repository files ([lLm]), with any `sys.path` addition it could not follow. */
export function pythonImports(root: string, file: string, text: string, files: ReadonlySet<string>): PythonImports {
  const statements = statementsOf(text);

  // Names bound once, to what: a name bound twice to different things is not known here.
  const bound = new Map<string, Ast | null>();
  const boundText = new Map<string, string>();
  for (const s of statements) {
    const m = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)\s*(.+)$/.exec(s);
    if (m?.[1] === undefined || m[2] === undefined) continue;
    const before = boundText.get(m[1]);
    if (before !== undefined && before !== m[2]) {
      bound.set(m[1], null);
      continue;
    }
    boundText.set(m[1], m[2]);
    bound.set(m[1], parseExpression(m[2]) ?? null);
  }

  // Directories the file adds to its import path, in the order Python would search them.
  const inserted: string[] = [];
  const appended: string[] = [];
  const unfollowed: string[] = [];
  for (const s of statements) {
    for (const m of s.matchAll(/\bsys\.path\s*(?:\.\s*(insert|append|extend)\s*\(|(\[|\+=|=(?!=)))/g)) {
      const how = m[1];
      if (how === "insert" || how === "append") {
        const args = argumentsAt(s, (m.index) + m[0].length - 1);
        const arg = how === "insert" ? args?.[1] : args?.[0];
        const ast = arg === undefined ? undefined : parseExpression(arg);
        const value = ast === undefined ? undefined : evaluate(ast, { file, root: posix.resolve(root), bound }, new Set());
        // A directory outside the repository holds none of its files: nothing to follow there.
        if (value !== undefined && "outside" in value) continue;
        const dir = asPath(value);
        if (dir === undefined) unfollowed.push(`sys.path.${how}(${args?.join(", ") ?? "…"})`);
        else (how === "insert" ? inserted : appended).push(dir);
      } else {
        unfollowed.push(s.length > 80 ? `${s.slice(0, 77)}...` : s);
      }
    }
  }

  const dir = posix.dirname(file);
  const isPackage = (d: string): boolean => files.has(posix.join(d, "__init__.py"));
  const roots = [...new Set([...inserted, ...(isPackage(dir) ? [] : [dir]), ".", "src", ...appended])];

  const targets = new Set<string>();
  const absolute = (dotted: string, name?: string): void => {
    for (const root of roots) {
      const hit = (name === undefined ? undefined : moduleFile(files, root, `${dotted}.${name}`)) ?? moduleFile(files, root, dotted);
      if (hit !== undefined) {
        targets.add(hit);
        return;
      }
    }
  };
  for (const s of statements) {
    const imp = /^import\s+(.+)$/.exec(s);
    if (imp?.[1] !== undefined) {
      for (const part of imp[1].split(",")) {
        const dotted = /^\s*([A-Za-z_][\w.]*)(?:\s+as\s+\w+)?\s*$/.exec(part)?.[1];
        if (dotted !== undefined) absolute(dotted);
      }
      continue;
    }
    const from = /^from\s+(\.*)([A-Za-z_][\w.]*)?\s+import\s+(.+)$/.exec(s);
    if (from === null) continue;
    const dots = (from[1] ?? "").length;
    const module = from[2];
    const names = (from[3] ?? "").replace(/[()]/g, "").split(",").map((n) => /^\s*(\*|[A-Za-z_]\w*)/.exec(n)?.[1]).filter((n): n is string => n !== undefined);
    if (dots === 0) {
      if (module === undefined) continue;
      for (const name of names) absolute(module, name === "*" ? undefined : name);
      continue;
    }
    const base = up(dir, dots - 1);
    if (base === undefined) continue;
    // `from . import c` names the module `c` in the package, or a name its `__init__.py` holds.
    const init = posix.join(base, "__init__.py");
    const whole = module === undefined ? (files.has(init) ? init : undefined) : moduleFile(files, base, module);
    for (const name of names) {
      const sub = name === "*" ? undefined : moduleFile(files, base, module === undefined ? name : `${module}.${name}`);
      const hit = sub ?? whole;
      if (hit !== undefined) targets.add(hit);
    }
  }
  targets.delete(file);
  return { targets: [...targets], unfollowed };
}
