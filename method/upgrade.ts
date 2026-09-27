// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// [o7Y]: carrying a repository laid out under an older version of the method to this one.
//
// An upgrade moves what the method owns — the artifacts at a conventional path that has changed —
// and reports what it does not. The repository's other files may name an old path in a script, a
// config or a paragraph, and those are the repository's: a scripted rewrite across them is exactly
// the change nobody reviews. So each is listed, and whoever ran the upgrade fixes them knowingly.
//
// Every move is checked before any is made. A half-moved repository is worse than an unmoved one,
// because it reads as neither layout.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { ARTIFACT_PATHS } from "./paths.ts";
import { recordsAMoment } from "./repository.ts";
import { carryDecisionsIn, takeIds } from "./decisions-by-id.ts";
import type { DecisionsReport } from "./decisions-by-id.ts";
import { testsById } from "./tests-by-id.ts";
import type { Report } from "./tests-by-id.ts";
import { METHOD_VERSION, plan, writeMethodVersion } from "./version.ts";

/** What each version changed, in order: the paths it moved, from and to, and whether it carried Tests rows and decisions to IDs. */
export const STEPS: readonly { readonly to: string; readonly moves: readonly (readonly [string, string])[]; readonly testsById?: true; readonly decisionsById?: true }[] = [
  // 0.2.0 (the owner, 2026-09-23): every artifact lives under docs/, each directory named for what it holds.
  { to: "0.2.0", moves: [["architecture", "docs/architecture"], ["docs/adr", "docs/waymarks"]] },
  // 1.0.0: a Tests row names its criteria by ID ([Xtd]), carried as the migration carries it ([R6P]),
  // and every decision is numbered with an ID ([8g5]), carried as its migration carries it ([RVv]).
  { to: "1.0.0", moves: [], testsById: true, decisionsById: true },
];

export type Upgrade =
  | { readonly done: "nothing" }
  | { readonly done: "recorded"; readonly version: string }
  | { readonly done: "refused"; readonly why: string }
  | {
      readonly done: "upgraded";
      readonly from: string;
      readonly to: string;
      readonly moved: readonly { readonly from: string; readonly to: string }[];
      /** The repository's own files that still name a path that moved, and which one. */
      readonly stillNaming: readonly { readonly file: string; readonly old: string }[];
      /** What carrying the Tests rows to IDs did, where this upgrade did it. */
      readonly carried?: Report;
      /** What numbering the decisions with IDs did, where this upgrade did it. */
      readonly decisions?: DecisionsReport;
    };

function newer(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i += 1) {
    const d = (x?.[i] ?? 0) - (y?.[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * An old path, as a reference to it is written: `architecture/…`, or a multi-segment path such as
 * `docs/adr` standing alone. Never the bare word, never inside a longer path (`docs/architecture/`),
 * and never a sibling whose name begins the same way (`docs/adr-numbers.md`).
 */
function naming(old: string): RegExp {
  const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alone = old.includes("/") ? `|${escaped}(?![\\w./-])` : "";
  return new RegExp(`(?<![\\w./-])(?:${escaped}/${alone})`);
}

/**
 * The files under `root` that are the repository's own: what git tracks or would track, so build
 * output it ignores is not reported, and never a document the repository says records a moment
 * (`repository.ts`), which must be left exactly as it was written. Outside git, every file.
 */
function filesOf(root: string): string[] {
  let files: string[];
  try {
    files = execFileSync("git", ["-c", "core.fsmonitor=false", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split("\0").filter((f) => f !== "" && existsSync(join(root, f)));
  } catch {
    files = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile()) files.push(relative(root, path).split(sep).join("/"));
      }
    };
    walk(root);
  }
  return files.filter((f) => !recordsAMoment(root, f)).sort();
}

/** Carries the repository at `root` forward to `to`, this skill's version but in a test, or says why it will not. */
export async function upgrade(root: string, to: string = METHOD_VERSION): Promise<Upgrade> {
  const what = plan(root, to);
  if (what.do === "refuse") return { done: "refused", why: what.why };
  // [o7Y]: a repository the method has not worked in has its marker written on the way out.
  if (what.do === "record") {
    writeMethodVersion(root, what.to);
    return { done: "recorded", version: what.to };
  }
  if (what.do !== "upgrade") return { done: "nothing" };

  const steps = STEPS.filter((s) => newer(s.to, what.from) && !newer(s.to, what.to));
  const moves = steps.flatMap((s) => s.moves);
  const due = moves.filter(([from]) => existsSync(join(root, from)));
  const blocked = due.find(([, dest]) => existsSync(join(root, dest)));
  if (blocked !== undefined) {
    return { done: "refused", why: `${blocked[1]} already exists, so ${blocked[0]} cannot be moved there; nothing was changed` };
  }
  // Specs never move, so the rows are checked where they are, before anything else is changed.
  const carrying = steps.some((s) => s.testsById === true);
  if (carrying) {
    const left = testsById(root, { write: false }).left;
    if (left.length > 0) {
      return { done: "refused", why: `${String(left.length)} Tests ${left.length === 1 ? "row" : "rows"} cannot be carried to IDs, so nothing was changed. Say which criterion each means, by its ID, and upgrade again:\n${left.map((l) => `  ${l.where}: ${l.why}`).join("\n")}` };
    }
  }

  // The decisions too, where the waymarks are before any move, and their IDs taken before anything
  // is changed: where none can be, nothing is.
  const numbering = steps.some((s) => s.decisionsById === true);
  let ids: readonly string[] = [];
  if (numbering) {
    const before = [ARTIFACT_PATHS.specs, due.find(([, dest]) => dest === ARTIFACT_PATHS.waymarks)?.[0] ?? ARTIFACT_PATHS.waymarks];
    const plan = carryDecisionsIn(root, { write: false, dirs: before });
    if (plan.left.length > 0) {
      return { done: "refused", why: `${String(plan.left.length)} ${plan.left.length === 1 ? "section" : "sections"} of decisions cannot be numbered with IDs, so nothing was changed. Say what each decision is, and upgrade again:\n${plan.left.map((l) => `  ${l.where}: ${l.why}`).join("\n")}` };
    }
    const taken = await takeIds(root, plan.needed);
    if ("why" in taken) return { done: "refused", why: `${String(plan.needed)} ${plan.needed === 1 ? "decision needs" : "decisions need"} an ID, and ${taken.why}; nothing was changed` };
    ids = taken.ids;
  }

  for (const [from, dest] of due) {
    mkdirSync(dirname(join(root, dest)), { recursive: true });
    renameSync(join(root, from), join(root, dest));
  }
  const carried = carrying ? testsById(root, { write: true }) : undefined;
  const decisions = numbering ? carryDecisionsIn(root, { write: true, ids }) : undefined;
  writeMethodVersion(root, what.to);

  const stillNaming = filesOf(root).flatMap((file) => {
    const text = readFileSync(join(root, file));
    if (text.includes(0)) return [];
    const body = text.toString("utf8");
    return moves.filter(([old]) => naming(old).test(body)).map(([old]) => ({ file, old }));
  });
  const moved = due.map(([from, dest]) => ({ from, to: dest }));
  return {
    done: "upgraded", from: what.from, to: what.to, moved, stillNaming,
    ...(carried === undefined ? {} : { carried }),
    ...(decisions === undefined ? {} : { decisions: { changed: decisions.changed, left: decisions.left, specLinks: decisions.specLinks } }),
  };
}
