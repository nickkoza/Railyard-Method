# Architecture model

**Type:** Capability spec · **Status:** Draft · **Source:** the owner, 2026-09-23; [rZB], [yBq] · **ID:** [iVr]

## Purpose

A repository built with the method keeps an architecture model, and the code is held to it
([rZB]). The model has one job, fixing the shape of what is built, and people read it through
views that each have another: teaching, documenting a boundary, showing a flow.

This spec says what a model must be for the code to be held to it, how a model stays small
enough to keep, and how a view is drawn from it without drifting away.

## Acceptance criteria

1. [6aC] **Architecture has two jobs, and one picture serves neither.** The model fixes the
   shape of the built system: the code is held to it, and it holds every component and
   boundary because conformance needs all of them. It is never drawn whole for a person to
   read: one picture of the whole model is too dense to teach anything and too coarse to
   document any one thing. A person reads a view instead: a diagram drawn for one reader and
   one purpose (teaching someone how the system fits together, documenting a boundary for
   whoever will change it, showing how a request moves) holding only the elements that
   purpose needs. Who a view is for and what it is meant to accomplish are decided before it
   is drawn, following the SEI's *Documenting Software Architectures: Views and Beyond*.

2. [7m8] **A view lives in the artifact it clarifies.** A flow is drawn in the spec whose
   behaviour it shows, and a system design in the waymark that marks it. A view is never a
   separate document kept in step with the artifact it explains, because a document kept in
   step by hand is one that eventually is not.

3. [CC6] **A view is drawn from the model, never beside it.** Its components and connections
   are the model's own, named by their unique IDs, and what it shows of each (its name, its
   description) comes from the model rather than being copied into the view. A view that
   names a component or a connection the model does not have is reported against the
   artifact that holds it, as a dangling citation is, so a view can go stale but cannot go
   stale silently.

   An arrow between two boxes is the model's where the model connects them, or connects
   something each contains, by the model's own composition or deployment at any depth: a
   view that collapses a subsystem to one box ([CLM]) keeps the arrows that run through
   what it holds. And a view draws a component's connections with it: a component drawn
   with no arrow at all, where the model connects it, or something it holds and the view
   does not draw, to another box the view draws, is reported, since that is the model's
   components laid out with the connections left out. Found 2026-09-27, in an overview that
   collapsed a system to its one box: its arrow to a part the system reaches through a
   member was refused, so four of its twelve boxes were drawn with no arrow at all,
   and nothing said so.

4. [SKi] **A view stays small.** It shows at most twelve components. One that needs more is
   two views, or one with a subsystem collapsed to a single component, which is what the
   model's decomposition ([W7x]) is for. A view over the limit is reported, not drawn smaller
   by leaving the check out.

5. [CLM] **Every component can be seen in some view** (the owner, 2026-09-25: comprehension
   is kept, not hoped for). A component counts as seen where a view draws it, or draws a box
   that contains it, by the model's own composition or deployment. So an overview with a
   subsystem collapsed to one box covers everything inside it, and the views stay small
   ([SKi]) while nothing goes unseen: a component added to the model is reported until a
   view shows it, and a model of more than one component with no view at all is reported
   too. A box is a component or a boundary, and is drawn by the model's ID as any other is
   ([CC6]).

6. [C4P] **Every source file belongs to a component.** Each of the repository's own source
   files lies under the source path of exactly one component, at each level of the model. A
   file no component owns is code the model does not describe; a file two components own is
   a boundary the model has not decided. Either is reported, naming the file, and a file
   with no owner is reported with how to give it one: a node's `source-path`. Someone
   meeting the convention for the first time cannot guess it, and a report that only says
   what is wrong leaves them to (found 2026-09-26, in the first repository started from the
   skill alone). A source path that names nothing yet is noted too, as a component not built
   yet or a path to correct: it owns nothing, so nothing else would say so. It is a notice,
   not a finding, because a model may rightly run ahead of the code it describes.

7. [lLm] **A component reaches another only across a declared connection.** Where one
   component's code imports another's, the model declares that connection, from the
   importer to the imported, at the level both components sit in. An import across a
   boundary the model does not declare is reported, naming both files, and the model wins
   by default ([rZB]): the import is what is wrong until someone deliberately changes the
   model. Imports are read in JavaScript, TypeScript and Python, each resolved to a file the
   way that language's own resolver would find it. Where the check cannot read one, it says
   so rather than passing in silence, because a quiet check reads exactly like one that
   looked: a source file in a language whose imports it does not read is noted, by
   language, and so is a Python file that adds a directory to its import path in a way the
   check cannot follow. Both are notices, since nothing is known to be wrong. Found
   2026-09-27, in a Python repository whose modules imported three other components' code
   through `sys.path` with none of it declared, while the check, reading only scripts,
   reported nothing.

8. [W7x] **The model decomposes rather than grows.** Its top level names the parts and how
   they connect, never their insides. A part whose insides need a model of their own points
   at one, a detailed architecture that covers exactly that part's files, one level down.
   One flat model of everything is what nobody can read or keep: Railyard's reached 41
   components and 76 connections in a single file before anyone could say what it was for.

9. [L7b] **Every model is valid CALM and carries its own ID.** Each validates with
   `calm validate --strict`, and each names its stable ID in its metadata ([vKz]). A detailed
   architecture a component points at exists, under `docs/architecture/`. The check runs the
   repository's own CALM CLI, or one on the path; where there is none it says it could not
   validate, which is a finding, never a model taken as valid ([9p5]), and says how to install
   it, having run every other check.

## Decisions

1. [kV8] **How a view is written** ([CC6]). Conventional: any notation would do, and every view has
   to use the same one so a check can read it. The first view settled it (the owner,
   2026-09-23; the question was held open until then).

   - A view is a fenced `mermaid` block whose first line inside is
     `%% view-of: docs/architecture/<model>.json`, naming the model it is drawn from. It may
     be indented inside a list item, as a view in a numbered decision is ([8g5]).
   - A component is its model `unique-id`, written bare, with no label: the model supplies the
     name and the description, and tooling will dereference them. A `subgraph` is a box, and a
     box is a component or a boundary like any other: its ID is the model's, it counts towards
     the view's size ([SKi]), and what the model says it contains counts as seen in the view
     ([CLM]). A box named for nothing in the model groups by a rule the model does not hold, so
     it is not drawn (the owner, 2026-09-25).
   - A connection is `a --> b`, and exists in the model as a `connects` relationship from `a`
     to `b`, or, where `a` is an actor, an `interacts` relationship naming `b` among its nodes;
     or as either of those from something `a` contains to something `b` contains, each by
     `composed-of` or `deployed-in`, at any depth. A component a box holds and the view does
     not draw is reached through the nearest box that holds it and is drawn.

2. [tXG] **Ownership is a `source-path` on each node.** Conventional. CALM has no field for which
   code a component is, so each node carries a custom `source-path`: one path, or a list. A
   file belongs to the node whose path is its longest match at that level, so a detailed
   architecture's nodes sit inside their parent's without contradicting it.

3. [FIt] **How an import names a file** ([lLm]). Forced: the specifier is written the way the
   language's own resolver reads it, and the check has to find the same file it does, or an
   import across a boundary passes unseen, which reads exactly like a declared one. A relative
   specifier in `import`, `export … from`, a dynamic `import()` or a `require()` is resolved
   against the repository's own files, taking the first that exists: the path as written; the
   path with `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` or `.cjs` added; the path as a
   directory, with `index` and one of those; and a `.js`, `.jsx`, `.mjs` or `.cjs` path as the
   TypeScript file it names, `.ts`, `.tsx`, `.mts` or `.cts`. The last is TypeScript's `NodeNext`
   resolution, which has an import of `./x.ts` written `./x.js` (observed with TypeScript 6.0.3,
   2026-09-26). Found 2026-09-26 in the first repository started from the skill alone, whose
   imports read `./storage.js`: only a literal `.ts` specifier had been resolved, so every other
   import passed.

4. [Eq7] **How a Python import names a file** ([lLm]). Forced in what it resolves, since the check has
   to find the file Python's import system would; conventional in where it stops, since the
   import path is decided when the program runs and the check reads only the repository.
   `import a.b`, `from a.b import c`, `from . import c`, `from ..a import c`, several names
   after one `import`, names in parentheses across lines, and an import inside a function or
   after a `;` are read; one in a comment or a string is not. A relative import is resolved
   from the importing file's own package, one directory up for each dot past the first. An
   absolute one is looked for, taking the first place that holds it, in: each directory the file
   itself adds with `sys.path.insert` or `sys.path.append`; the file's own directory, where that
   is not a package (no `__init__.py`), since a script run directly has it on its path; the
   repository's root; and `src/`, the src layout. `a.b` is `a/b.py` or `a/b/__init__.py` there,
   and `from a import c` names the module `a/c` where there is one, and `a` otherwise; a package
   the import passes through on the way is not counted as imported. A directory added to the
   path is read where it is written as a path relative to `__file__` or the repository's root:
   `Path(__file__)` with `.resolve()`, `.parent`, `.parents[n]`, `/ "dir"` and `.joinpath`;
   `os.path.dirname`, `abspath`, `realpath` and `join`; `str()` around any of these; a string
   literal, from the root; an absolute path that lies inside the repository where the check
   runs; and a name bound once in the file to one of these. An absolute path outside the
   repository holds none of its files and is passed over; an addition made in any other way,
   from the environment or the home directory, is noted as one the check cannot follow. Not resolved, and not guessed at:
   `importlib.import_module` and `__import__`, a directory another module adds to the path,
   `PYTHONPATH`, `.pth` files, and installed packages, which lie outside the repository anyway.
   Found 2026-09-27, in a Python repository whose modules add `sim/arm` to the path as
   `Path(__file__).resolve().parents[2] / "sim" / "arm"`, bound to a name first or written in
   place, and whose scripts add it as an absolute path.

5. [yCu] **What is source, and what is a model.** Conventional. Source is the repository's own code
   and skills; a test is not source, whether it is named `*.test.ts` or `*.<kind>-test.ts`
   (`docker-test`, `live-test`, `perf-test`), nor is anything under a `testing/` or `tests/`
   directory. Every `.json` directly under `docs/architecture/` is a model, except the CALM
   documents that serve one: a pattern (a JSON Schema, with an `$id` and a `type`) and a URL
   mapping (an object from URLs to paths). They are told apart by what they are, never by
   failing to read, so a model that cannot be read is still reported ([L7b]).

6. [xvb] **The tools are pinned.** Forced: CALM's schema is someone else's and moves. Observed
   2026-09-23 with `@finos/calm-cli` 1.59.0, schema release 1.0, where a node's
   `details.detailed-architecture` is the only way to point at a lower level.

## Tests

| Criterion | Test | Status |
|---|---|---|
| [6aC], [7m8] (the model never drawn whole for a reader; views written into the artifact they clarify) | `method/architecture.test.ts` [1]: every diagram in an artifact is a view that names its model; drawing a large model whole is what 4's limit stops | Written |
| [CC6] (a view names only the model's components and connections, by ID; an arrow between two boxes held through what each contains, by composition or deployment; a component drawn with no arrow where the model connects it to another drawn box reported, and one only a box's member reaches not; a view indented inside a numbered decision read as any other) | `method/architecture.test.ts` [1] | Written |
| [SKi] (a view shows at most twelve components) | `method/architecture.test.ts` [1] | Written |
| [CLM] (every component seen in a view, drawn or inside a drawn box by composition or deployment; a model of more than one component with no view reported; a box drawn by the model's ID, and counted) | `method/architecture.test.ts` [1] | Written |
| [C4P] (every source file owned by exactly one component at each level, a file with none told how to get one; a source path naming nothing yet noted, not failed; every kind of test file counted as a test) | `method/architecture.test.ts` [1] | Written |
| [lLm] (every import across components is a declared connection, however its specifier is written: as the file, NodeNext's `.js` for `.ts`, without an extension, as a directory's index, or through `require`; a Python import however it is written, absolute, relative, from a package, the src layout, a script's own directory or a directory the file adds to `sys.path`; a language whose imports are not read, and a `sys.path` addition that cannot be followed, each noted) | `method/architecture.test.ts` [1] | Written |
| [W7x] (a detailed architecture covers exactly its parent's files) | `method/architecture.test.ts` [1] | Written |
| [L7b] (every model valid CALM with its own ID; a pointed-at detailed architecture exists; a pattern and a URL mapping beside it not taken for models, and a broken model still reported) | `method/architecture.test.ts` [2], running the pinned `calm validate --strict` | Written |
| [L7b], no CALM CLI (said as a finding, with how to install it, every other check run) | `method/architecture.test.ts` [1] | Written |
