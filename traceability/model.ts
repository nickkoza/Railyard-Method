// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// The query's model ([63N], [EaR], and its Decisions): positions in files,
// commits, and references to artifacts. Nothing here knows a language, a
// framework or an artifact format; adapters do. An answer is validated against
// these schemas before it is given.
import { z } from "zod";

export const Sha = z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
export const Instant = z.iso.datetime({ offset: true });

/** A commit, with its committer date and time for people to read. */
export const Version = z.strictObject({
  commit: Sha,
  date: Instant,
  /** A hash of the artifact's own content at this version — the criterion's text, not the file's.
   *
   * The witness, where the ID and the commit are the address ([EaR]). Two of these, one on each
   * end of a link, decide whether it is suspect: equal means the artifact has not moved under it,
   * and that is one comparison rather than a walk through history. It is what makes the question
   * askable without a repository in reach, and askable of every link at once.
   *
   * Absent on a version written before this was carried. Absent is not "unchanged": a reader that
   * cannot compare says it cannot, and falls back to reading the artifact. */
  content: z.string().min(1).optional(),
});
export type Version = z.infer<typeof Version>;

/** How a link is known: [63N]'s four kinds. */
export const EVIDENCE = ["recorded", "cited", "tested", "confirmed"] as const;
export const Evidence = z.enum(EVIDENCE);
export type Evidence = z.infer<typeof Evidence>;

/** The concrete source a link was read from, in the order of trust answers list them in. */
export const SOURCES = ["architecture-source-path", "asserted-link", "tests-table", "code-citation", "commit-message", "commit-trailer"] as const;
export const Source = z.enum(SOURCES);
export type Source = z.infer<typeof Source>;

/** An artifact: its kind as its adapter names it, its repository path, an anchor within it, and how people cite it. */
export const Artifact = z.strictObject({
  kind: z.string().min(1),
  path: z.string().min(1),
  anchor: z.string().min(1).nullable(),
  label: z.string().min(1),
  /** The artifact's stable ID, where it declares one ([EaR]).
   *
   * This is the reference; the path and the label are for a person to read. Renaming a spec or
   * renumbering a criterion moves both of those and leaves this alone, which is the whole point.
   * Absent where the artifact declares none — an architecture node, or a document outside the
   * repositories that mint IDs — never invented, because a guessed reference is worse than none. */
  id: z.string().min(1).optional(),
});
export type Artifact = z.infer<typeof Artifact>;

export const State = z.enum(["current", "suspect", "missing"]);
export type State = z.infer<typeof State>;

/** Where a link was found: a commit, and the file and line in it when the link is written in one. */
export const MadeBy = z.strictObject({
  commit: Sha,
  path: z.string().min(1).nullable(),
  line: z.number().int().positive().nullable(),
});
export type MadeBy = z.infer<typeof MadeBy>;

export const Link = z.strictObject({
  artifact: Artifact,
  kind: Evidence,
  source: Source,
  /** Suspect once the artifact's own text changed after the link was made, or when it did not exist then; missing when it is not at the commit read. */
  state: State,
  /**
   * The artifact's own version when the link was made: the last commit at or before the link's at which its own text
   * (a criterion's, a node's, or the file's) changed ([EaR]). Null when it did not exist then, and the
   * link is then suspect: it was never checked against what the artifact says.
   */
  linked: Version.nullable(),
  /** The artifact's own version at the commit read, found as `linked` is; null when it is missing. */
  current: Version.nullable(),
  madeBy: MadeBy,
});
export type Link = z.infer<typeof Link>;

/** A source that could not be read, and why. */
export const Unreadable = z.strictObject({ path: z.string().min(1), reason: z.string().min(1) });
export type Unreadable = z.infer<typeof Unreadable>;

export const Trailer = z.strictObject({ key: z.string().min(1), value: z.string() });
export type Trailer = z.infer<typeof Trailer>;

export const BackwardAnswer = z.strictObject({
  query: z.literal("backward"),
  at: Version,
  position: z.strictObject({ path: z.string().min(1), line: z.number().int().positive() }),
  text: z.string(),
  /** The commit that last changed the line: what its history records, not an artifact link. */
  lineCommit: z.strictObject({ commit: Sha, date: Instant, author: z.string(), subject: z.string(), trailers: z.array(Trailer) }),
  traced: z.boolean(),
  links: z.array(Link),
  unreadable: z.array(Unreadable),
});
export type BackwardAnswer = z.infer<typeof BackwardAnswer>;

/** A position in a file at the commit read: a range of lines, or the whole file when both ends are null. */
export const Position = z.strictObject({
  path: z.string().min(1),
  start: z.number().int().positive().nullable(),
  end: z.number().int().positive().nullable(),
});
export type Position = z.infer<typeof Position>;

export const ForwardAnswer = z.strictObject({
  query: z.literal("forward"),
  at: Version,
  artifact: Artifact,
  /** The artifact's own version at the commit read ([EaR]); null when it is not there. */
  current: Version.nullable(),
  traced: z.boolean(),
  /** Each position with the link that ties it to the artifact, or, for a spec, to one of its criteria. */
  positions: z.array(z.strictObject({ position: Position, link: Link })),
  unreadable: z.array(Unreadable),
});
export type ForwardAnswer = z.infer<typeof ForwardAnswer>;

/** The query could not be answered: not a repository, an unknown commit, a position or an artifact that does not exist. */
export class TraceRefusal extends Error {
  override readonly name = "TraceRefusal";
}

/** The repository at one commit, as an adapter may read it. */
export type Snapshot = {
  readonly commit: string;
  /** Every file at the commit. */
  files(): ReadonlySet<string>;
  /**
   * Every file at the commit that is source: `files()` less the records. A symbols directory checked in beside the
   * source it describes is the record itself, and no query that walks source walks it ([QBm]).
   */
  sourceFiles(): ReadonlySet<string>;
  /** Whether the path is inside a symbols directory checked into this tree, and so is record rather than source. */
  isRecord(path: string): boolean;
  /** A file's text at the commit; undefined when there is no such file. */
  read(path: string): string | undefined;
};

/** Something a document says about an artifact, and the line it says it on. */
export type Named = { readonly artifact: Artifact; readonly doc: string; readonly line: number };
/** A test file a document names for an artifact: as written, and the files at the commit it can mean. */
export type TestNamed = Named & { readonly name: string; readonly tests: readonly string[] };
/** A source path a document assigns to an artifact. */
export type SourcePath = Named & { readonly sourcePath: string };
export type Readings<T> = { readonly entries: readonly T[]; readonly unreadable: readonly Unreadable[] };

/** What the query needs from an artifact format. The query itself knows none. */
export type Adapter = {
  readonly name: string;
  /** The artifact kinds this adapter owns. */
  readonly kinds: readonly string[];
  /** Whether a file is one of this adapter's artifact documents, rather than something built from them. */
  isArtifactFile(path: string): boolean;
  /** The artifacts a piece of text cites. */
  cite(text: string, at: Snapshot): readonly Artifact[];
  /** The artifact a repository path and anchor name, when this adapter owns it. */
  fromPath(path: string, anchor: string | null, at: Snapshot): Artifact | undefined;
  /** An extended regular expression every citation of an artifact it owns matches, to find candidates that `cite` then confirms.
   *
   * It takes the snapshot because an artifact's stable ID is declared in its own text and cannot be
   * derived from its path. A pattern that misses the ID narrows the search to nothing, and `cite`
   * never sees the line. */
  pattern(artifact: Artifact, at: Snapshot): string;
  /** An artifact's own text at a commit, to tell whether it changed; undefined when it is not there. */
  textOf(artifact: Artifact, at: Snapshot): string | undefined;
  /** The test files documents name for artifacts. */
  testsNamed(at: Snapshot): Readings<TestNamed>;
  /** The source paths documents assign to artifacts. */
  sourcePaths(at: Snapshot): Readings<SourcePath>;
};

/** An extended regular expression, or a JavaScript one, matching `text` literally. */
export function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
