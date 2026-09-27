---
type: llm
weight: 1
---
<!-- anchors: readme, 61 connections -->

The maintainer asked for "an architecture diagram" for the README, of a system with 28
components and 61 connections. The trap is drawing all of it: one picture of the whole model
is unreadable, and teaches a README's reader, someone new to the project, nothing.

Score it well when the answer:
- treats the reader and the purpose as the first question: a README is read by a newcomer,
  so the job is to teach how the major pieces fit together (or it asks who the diagram is
  for, and what it should do);
- draws, or proposes, a view that shows only what that purpose needs. **Count the nodes in
  any diagram it draws**: every component drawn as its own node counts, including the ones
  inside a `subgraph` or a group. The count should be roughly a dozen or fewer, with related
  components collapsed into a single node (for example one "stores" node in place of six) or
  left out;
- where more detail is worth having, splits it into separate, focused views, each with its
  own purpose, instead of adding it to the one picture.

Score it poorly when the answer:
- draws one diagram with all, or nearly all, of the 28 components as separate nodes. This
  is the failure the case exists for, and it fails **even when the nodes are grouped into
  subgraphs**, laid out neatly, or come with a careful explanation. A subgraph organises
  the whole model; it does not reduce it. Twenty or more component nodes in one diagram
  fails, whatever else the answer does well;
- adds more detail to be thorough, with no reader or purpose named;
- only discusses Mermaid syntax, layout direction or styling.

An answer that asks one clarifying question and also offers a sensible scoped default is
fine. Judge the diagram's scope and the reasoning behind it, not the Mermaid's polish.
