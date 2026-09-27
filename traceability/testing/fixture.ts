// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// A fixture repository with real git, built in a temporary directory for the
// traceability tests. Each commit is dated one minute after the last, from a
// fixed start, so that dates can be asserted. Git's system and global
// configuration are ignored, here and in the queries the tests run.
//
// The widget repository's contents are data, in widget.json beside this file.
// They cite artifacts, and this module only builds from them.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

process.env["GIT_CONFIG_NOSYSTEM"] = "1";
process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";

export type Made = { readonly sha: string; readonly date: string };

export type Fixture = {
  readonly dir: string;
  /** Writes (or, for `null`, removes) each file, commits them with whatever else is staged, and returns the commit. */
  commit(message: string, files: Readonly<Record<string, string | null>>, author?: string): Made;
  /** Runs git in the repository, for what a commit cannot make: a submodule's entry, the repository's own configuration. */
  git(...args: string[]): string;
  remove(): void;
};

export function fixtureRepository(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "trace-"));
  let minutes = 0;
  const git = (env: Readonly<Record<string, string>>, ...args: string[]): string =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } }).trim();
  git({}, "init", "-q", "-b", "main");
  return {
    dir,
    commit(message, files, author = "Fixture Author") {
      for (const [path, text] of Object.entries(files)) {
        if (text === null) {
          git({}, "rm", "-q", "--", path);
        } else {
          mkdirSync(dirname(join(dir, path)), { recursive: true });
          writeFileSync(join(dir, path), text);
          git({}, "add", "--", path);
        }
      }
      minutes += 1;
      const date = `2026-01-01T10:${String(minutes).padStart(2, "0")}:00+00:00`;
      git({ GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, "-c", `user.name=${author}`, "-c", "user.email=fixture@example.com", "commit", "-q", "-m", message);
      return { sha: git({}, "rev-parse", "HEAD"), date };
    },
    git: (...args) => git({}, ...args),
    remove() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const NAMES = ["docs", "model", "code", "plain", "stops", "broken"] as const;
const WidgetData = z.strictObject({
  commits: z.array(z.strictObject({
    name: z.enum(NAMES),
    message: z.string().min(1),
    author: z.string().min(1).optional(),
    files: z.record(z.string().min(1), z.array(z.string()).nullable()),
  })).length(NAMES.length),
});

/** Line 13 of the widget's spec: criterion 2's Tests row. */
export const STOP_ROW = 13;

/**
 * The widget repository, one commit per field, in order. Of src/widget/spin.ts's
 * lines: 1 cites the widget spec's first criterion, as the file's opening block; 5 cites the
 * second ADR, above line 6; and 11 cites the ninth, which no file carries, above
 * line 12.
 */
export type Widget = {
  readonly fixture: Fixture;
  /** The first and second ADRs, and the widget's spec. */
  readonly docs: Made;
  /** The architecture model: `widget`, and `widget-core` nested in it. */
  readonly model: Made;
  /** The widget's code. Its message cites the first ADR and criteria 1–2, and a `Refs` trailer cites the second ADR. */
  readonly code: Made;
  /** A file nothing cites, under no node, by another author. */
  readonly plain: Made;
  /** Criterion 2's text changes. */
  readonly stops: Made;
  /** An architecture document that cannot be read; HEAD. */
  readonly broken: Made;
};

export function widgetRepository(): Widget {
  const data = WidgetData.parse(JSON.parse(readFileSync(join(import.meta.dirname, "widget.json"), "utf8")));
  const fixture = fixtureRepository();
  const made = new Map<string, Made>();
  for (const c of data.commits) {
    const files = Object.fromEntries(Object.entries(c.files).map(([path, lines]) => [path, lines === null ? null : `${lines.join("\n")}\n`]));
    made.set(c.name, fixture.commit(c.message, files, c.author));
  }
  const get = (name: (typeof NAMES)[number]): Made => {
    const m = made.get(name);
    if (m === undefined) throw new Error(`widget.json has no commit ${name}`);
    return m;
  };
  return { fixture, docs: get("docs"), model: get("model"), code: get("code"), plain: get("plain"), stops: get("stops"), broken: get("broken") };
}

const DamagedData = z.strictObject({
  commits: z.array(z.strictObject({ message: z.string().min(1), files: z.record(z.string().min(1), z.array(z.string())) })).min(1),
  submodule: z.strictObject({ path: z.string().min(1), message: z.string().min(1) }),
  unreadable: z.string().min(1),
});

/** The damaged repository: its last commit of damaged.json's, whose file cites the ADR; and the one adding a submodule, HEAD. */
export type Damaged = { readonly fixture: Fixture; readonly cited: Made; readonly vendored: Made };

/**
 * A repository some of which git cannot read, built from damaged.json beside
 * this file: its commits, then one adding a submodule, which is no file. Last,
 * the object of the file damaged.json names is deleted from the store, so git
 * lists that file but cannot read it. With `cutHistory`, the first commit's
 * object is deleted too, so git cannot walk the whole history, though it can
 * still blame the last commits' lines.
 */
export function damagedRepository(options: { readonly cutHistory?: boolean } = {}): Damaged {
  const data = DamagedData.parse(JSON.parse(readFileSync(join(import.meta.dirname, "damaged.json"), "utf8")));
  const fixture = fixtureRepository();
  const made = data.commits.map((c) => fixture.commit(c.message, Object.fromEntries(Object.entries(c.files).map(([path, lines]) => [path, `${lines.join("\n")}\n`]))));
  const [first] = made;
  const cited = made.at(-1);
  if (first === undefined || cited === undefined) throw new Error("damaged.json has no commits");
  fixture.git("update-index", "--add", "--cacheinfo", `160000,${cited.sha},${data.submodule.path}`);
  const vendored = fixture.commit(data.submodule.message, {});
  const lost = [fixture.git("rev-parse", `${vendored.sha}:${data.unreadable}`), ...(options.cutHistory === true ? [first.sha] : [])];
  for (const object of lost) rmSync(join(fixture.dir, ".git", "objects", object.slice(0, 2), object.slice(2)));
  return { fixture, cited, vendored };
}

export type Renamed = { readonly fixture: Fixture; readonly cited: Made; readonly renamed: Made };

/**
 * A spec, and a file whose opening line cites the spec's criterion 2, an
 * M-name's criterion 1 (a spec that never existed), and a name that is not in a
 * spec name's shape. Then the spec is renamed, so at HEAD the citation's spec
 * is missing.
 */
export function renamedSpecRepository(): Renamed {
  const fixture = fixtureRepository();
  const spec = "# Widget\n\n## Acceptance criteria\n\n1. **It spins.** The widget spins.\n2. **It stops.** The widget stops.\n";
  const cited = fixture.commit("The widget's spec, and a file citing it", {
    "docs/specs/widget.md": spec,
    "src/cite.ts": "// `widget` criterion 2; `M1-gate` criterion 1; `notASpec` criterion 3.\nexport const stops = true;\n",
  });
  const renamed = fixture.commit("The widget becomes the gizmo", {
    "docs/specs/widget.md": null,
    "docs/specs/gizmo.md": spec.replace("# Widget", "# Gizmo"),
  });
  return { fixture, cited, renamed };
}
