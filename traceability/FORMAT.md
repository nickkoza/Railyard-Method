# railyard-symbols 0.3.3 — the symbols file format

**A symbols file records positions in source, and for each position its links back
to the artifacts that caused it.** It is kept beside the source it describes, as
debug symbols are kept beside a binary, and it is looked up by the hash the build
carries.

This document and the schema beside it (`symbols.schema.json`) are MIT-licensed, so
that any tool may produce or read the format. Railyard is one producer and one
consumer of it among others.

## What the format assumes

Nothing about a language, a framework or a build tool. A file is a path. A position
is lines and columns in that file, and the name of the thing those lines fall inside. An
artifact is a stable ID, a document, optionally a part of one, and a label people read it
by. That is the whole vocabulary.

**A position names what it is in, where there is something to name.** `names` carries the
function, class, method or binding the position's first line falls inside. Lines and columns
say where a position sits today and are destroyed by an edit anywhere above it; a name
survives that edit, a reformat, and a move within the file. A producer that can work out the
name emits it, a producer that cannot leaves it out, and a consumer that has it should prefer
it to the numbers. It is absent — never guessed — where nothing names the position, because a
wrong name is worse than none: a reader believes it.

## Compatibility

- The format is versioned by semantic versions, in `formatVersion`.
- **A reader ignores a field it does not know.** New fields may be added within a
  minor version; a reader that refuses an unknown field is not conformant.
- A reader that meets a `formatVersion` it does not know says so and stops, rather
  than half-reading the document. **While the major version is 0, the minor version
  is the compatibility unit**, as semantic versioning has it for 0.x: a 0.3.x reader
  refuses a 0.2.x document, and the other way about.
- **`$id` is a stable identifier, not a fetchable location.** The format has no hosted
  schema registry, so the schema's `$id` (`/railyard-symbols/0.3.3/symbols.schema.json`)
  is a root-relative reference, not a URL: nothing is served at it, and a reader should
  not try to fetch it. It exists to name the schema and its version uniquely, the way
  `formatVersion` does for a document.

## A symbols directory

```
symbols/
  index.json              the tables every version shares, and the list of versions
  versions/<commit>.json  one version, holding only what changed since its base
```

The directory is checked in beside the source. Committing it is the repository
owner's act; a producer only writes the files.

**The directory names the tree it describes, by `root`:** the path from the
directory to the root the file paths are relative to. A directory at `symbols/` in
the root of that tree records `".."`. So a reader that has the directory has the
tree, with no git, no remote URL and no configuration, in a checkout, a copy or an
export. A reader given no root of its own resolves against that one, and a producer
writing a version into a directory whose root would differ is refused, naming both:
a directory that moved against its tree describes paths the tree no longer has.

**A producer never records the symbols directory itself.** Its files are the index,
not source, and indexing them would change the tree that is indexed at every run.

### `index.json`

| Field | What it holds |
|---|---|
| `format` | `railyard-symbols` |
| `formatVersion` | `0.3.3` |
| `root` | The path from this directory to the root of the tree its file paths are relative to, POSIX, relative. `".."` for a directory in that root |
| `files` | Every path any version names, relative to the root of the tree. Referred to by its place in the list |
| `artifacts` | Every artifact any version links to: `id`, `kind`, `path`, `anchor`, `label` |
| `commits` | Every commit any version names: `sha`, and `date` where it is known |
| `links` | Every distinct link any version carries, written once. A position names its links by their place in this list |
| `versions` | Each version: its `commit`, the `base` it is a delta against, its `file`, and the `builds` it answers for |

The tables are why a symbols directory stays small: paths, artifacts, commits and
links are written once for the directory, and a version refers to them by number.
A link such as "this file is under that architecture node" is true of every
position of every file under it, so writing it out at each position is almost all
of what a symbols file would otherwise weigh.

### `versions/<commit>.json`

| Field | What it holds |
|---|---|
| `format` | `railyard-symbols-version` |
| `commit`, `base` | The version's own commit and its base's, in full, so the file stands alone. They must agree with the index |
| `generated` | When the file was written |
| `files` | The positions of each file that changed since the base, **each file restated whole**. The key is the file's place in `files`, in decimal |
| `removed` | The files whose positions are gone at this version |

**Resolving a version** means walking its chain of bases to the root and taking,
for each file, the newest statement of it. A file no version in the chain mentions
has no positions, and every position of it is untraced.

A version is written only when something changed. Two builds of one commit made
with different settings have different build hashes, and one version answers for
both unless what is built differs.

## A position

```json
{ "at": [6, 1, 6, 23], "links": [3, 17] }
```

`links` names this position's links by their place in the index's `links` table.
`at` is `[start line, start column, end line, end column]`. Lines and columns are
1-based. **The start is inclusive and the end exclusive**, read as the pair
`(line, column)`:

- A whole line *L* of *n* characters is `[L, 1, L, n + 1]`.
- Consecutive lines with the same links are one position, so a run of lines *a* to
  *b* ends at `[b, len(b) + 1]`.
- A range whose start equals its end covers exactly that one position. That is how
  an empty line is covered.

A position covers `(line, column)` when the pair is at or after the start and
before the end, or when the range is that one position.

**A position that traces to nothing is not recorded.** Absence means untraced, and
a reader says so rather than guessing.

## A link

Links live in the index's `links` table, each written once, and positions name
them by index.

```json
{
  "artifact": 3,
  "evidence": "recorded",
  "source": "architecture-source-path",
  "state": "current",
  "linked": 2,
  "current": 2,
  "madeBy": { "commit": 5, "path": 7, "line": 12 }
}
```

- **`evidence`** is how the link is known: `recorded` when it was recorded as the
  code was made, `cited` when it is cited in the code or in a message, `tested`
  when a criterion's tests were seen to run this position, `confirmed` when it was
  proposed and a person confirmed it. **A cited or inferred link is never shown as
  verified.**
- **`source`** is the concrete source the link was read from, which is what makes
  the evidence checkable. A producer may name sources of its own; a reader shows
  the name as written. Railyard's are `architecture-source-path`, `tests-table`,
  `code-citation`, `commit-message` and `commit-trailer`.
- **`state`** is `current`, `suspect` or `missing`. A link is *suspect* once the
  artifact's own text changed after the link was made, or when the artifact did not
  exist then; it waits to be confirmed again. It is *missing* when the artifact is
  not there at the version's commit.
- **`linked`** and **`current`** are the artifact's own version when the link was
  made and at the version's commit, and **`linkedContent`** and **`currentContent`** are a
  hash of the artifact's own content at each — the part the link names, not the whole file.
  An artifact version is referred to by its **stable `id`** plus a commit, with a date and
  time beside it for people to read.
- **The two hashes are what decide whether a link is suspect**, and they decide it without a
  repository: equal means the artifact has not moved under the link. That is one comparison
  at each end rather than a walk through history, which is what makes the question askable
  of a deployed build, and askable of every link at once instead of one at a time. A hash is
  a witness and never an address — it changes on every edit, so it can say a link needs
  attention and can never say what the link points at. Absent means a reader cannot compare,
  never that nothing changed.
  The `id` is the reference: `path`, `anchor` and `label` all move when a document is
  renamed or a part of it renumbered, and the ID does not, so a link held by ID
  survives what a link held by position does not. A producer whose artifacts carry no
  such ID leaves the field out, and its links are then held by position and are worth
  what that is worth.
- **`madeBy`** is where the link was made: a commit, and the file and line it is
  written in when it is written in one.

A link's state was true at the version's commit. A reader is told which commit that
is, and re-indexing is what refreshes it.

## The build hash

A built artifact carries **one** thing, so that its symbols can be looked up: the
build's hash, under the name `dev.railyard.build-hash`. It carries no link, no
artifact's name and no source position.

The hash is a SHA-256 over the build's own content: the scheme tag
`railyard-build/v1`, then every file of the build sorted by its path, each hashed
as its path, its length and its bytes. **Each file is hashed with its own stamp
removed first**, so that stamping is idempotent and any reader can recompute the
hash from what was shipped. The value is 64 lowercase hex characters.

Where it rides, by the kind of artifact:

| Kind | Where |
|---|---|
| A page | `<meta name="dev.railyard.build-hash" content="<hex>">` |
| A script bundle | A trailing `//# dev.railyard.build-hash=<hex>` line |
| A source map | A top-level `"dev.railyard.build-hash"` member. JSON carries no comment |
| An image | The OCI annotation `dev.railyard.build-hash` |
| A binary | A `.note.dev.railyard.build-hash` section |

A standard field the format borrows, such as a source map's Debug ID or OCI's
`org.opencontainers.image.revision`, keeps its standard name and may sit beside
this one.

## Mapping what was built back to source

Where the build made a source map, a position in a built file maps through the map
to a source position, and from there the symbols file takes it to the artifacts.
Only the standard is needed: `version`, `sources`, `sourceRoot` and `mappings`,
decoded as base64 VLQ. Code with no source map is traced at its own positions.

**An index map — one carrying `sections` rather than `mappings` — is refused in
words, naming the file.** ECMA-426 lets a map be a list of sections, each with its
own offset and its own inner map, and a reader that took only the outer document
would answer with positions it never actually resolved. Refusing is the same rule
as an unknown `formatVersion`: say so and stop, rather than half-read. A data-URI
map is read where it is one, and a mapped source that falls outside the root is
said to fall outside it, never guessed at.

## What a tool answers with

A reader is something a person waits at a terminal for, and something a build
script branches on, so the exit status is part of the format's contract:

| Status | Meaning |
|---|---|
| `0` | It answered. An untraced position is an answer, not a failure |
| `1` | It could not answer: a directory, index, version or source that is missing, unreadable, or not this format; a build hash no version carries, or one two versions carry |
| `2` | The caller asked wrongly — an unknown flag, a position that does not parse |

The split matters because "untraced" and "broken" are different facts. A build
step that treats every non-zero status as breakage still behaves correctly, and one
that wants to tell the two apart can.

## The tools

`railyard-trace` produces and reads the format, without any daemon or server:

```
railyard-trace index --symbols <dir> [--repo <dir>] [--at <commit>] [--build <hash>]
railyard-trace backward <file>:<line>[:<column>] --symbols <dir> [--build <hash>] [--built <dir>] [--root <dir>]
railyard-trace stamp <path>…
```

`index` records the directory's `root` the first time it writes into it, from where the
repository's root lies against the directory, and refuses a later version whose root
would differ. `backward --symbols` resolves a mapped source against that root unless
`--root` names another.

The library is the same, imported by the package's name.
