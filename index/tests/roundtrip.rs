// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

//! What the builder wrote, the reader reads back — and the failures that matter are the ones
//! where it reads back *something* rather than nothing.
//!
//! A reader that disagrees with the builder by one field width does not fault: it reads the next
//! field's bytes as this one's and answers plausibly. So these assert on values rather than on
//! absence of error, and several deliberately reach for a record that is not there to check the
//! answer is "no" rather than whatever bytes happen to be at that offset.

use railyard_index::layout::{Evidence, State, LAYOUT};
use railyard_index::read::Unreadable;
use railyard_index::write::{Artifact, Link, Position};
use railyard_index::{Builder, Index};

fn position(start: u32, end: u32, names: Option<&str>, links: Vec<u32>) -> Position {
    Position {
        start_line: start,
        start_col: 1,
        end_line: end,
        end_col: 80,
        names: names.map(str::to_string),
        links,
    }
}

/// A small index with two files, two artifacts and three links, built the way a real one is.
fn built() -> Vec<u8> {
    let mut b = Builder::new();
    b.source("symbols/index.json", 11_789_903, 1_700_000_000_000_000_000);
    b.source("symbols/versions/abc.json", 3_522_729, 1_700_000_000_000_000_001);

    let spec = b.artifact(Artifact {
        kind: "spec".into(),
        path: "docs/specs/desk.md".into(),
        anchor: Some("criterion-3".into()),
        label: "`desk` criterion 3".into(),
        id: Some("PIj".into()),
    });
    let node = b.artifact(Artifact {
        kind: "calm-node".into(),
        path: "docs/architecture/model.json".into(),
        anchor: None,
        label: "CALM node `desk`".into(),
        id: None,
    });

    let made = b.commit("0123456789abcdef0123456789abcdef01234567", "2026-09-21T00:00:00Z");
    let cited = b.link(Link {
        artifact: spec,
        evidence: Evidence::Cited,
        state: State::Current,
        source: "code-citation".into(),
        linked_commit: Some(made),
        current_commit: Some(made),
    });
    let recorded = b.link(Link {
        artifact: node,
        evidence: Evidence::Recorded,
        state: State::Suspect,
        source: "architecture-source-path".into(),
        linked_commit: None,
        current_commit: Some(made),
    });
    let tested = b.link(Link {
        artifact: spec,
        evidence: Evidence::Tested,
        state: State::Missing,
        source: "test-run".into(),
        linked_commit: None,
        current_commit: None,
    });

    // Given out of order on purpose: the builder sorts, and the reader bisects on that ordering.
    b.file("packages/web/app.js", vec![position(10, 12, Some("renderDeck"), vec![cited, tested])]);
    b.file("packages/daemon/main.ts", vec![position(1, 1, None, vec![recorded]), position(40, 45, Some("start"), vec![])]);
    b.build()
}

#[test]
fn a_file_is_found_however_the_builder_was_given_it() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    // "packages/daemon/main.ts" sorts before "packages/web/app.js"; both must be findable.
    assert_eq!(index.positions_covering("packages/web/app.js", 11).len(), 1);
    assert_eq!(index.positions_covering("packages/daemon/main.ts", 42).len(), 1);
}

#[test]
fn a_position_is_read_back_exactly_as_it_was_written() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    let found = index.positions_covering("packages/web/app.js", 11);
    let p = found.first().expect("a position covering line 11");
    assert_eq!((p.start_line, p.start_col, p.end_line, p.end_col), (10, 1, 12, 80));
    assert_eq!(index.names(p), Some("renderDeck"));
}

#[test]
fn a_position_that_names_nothing_reads_as_nothing_rather_than_as_an_empty_name() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    let found = index.positions_covering("packages/daemon/main.ts", 1);
    assert_eq!(index.names(found.first().expect("the position")), None);
}

#[test]
fn a_line_outside_every_position_finds_nothing() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    assert!(index.positions_covering("packages/web/app.js", 9).is_empty());
    assert!(index.positions_covering("packages/web/app.js", 99).is_empty());
}

#[test]
fn a_file_the_index_does_not_hold_finds_nothing_rather_than_someone_else_s_positions() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    assert!(index.positions_covering("packages/web/nothing.js", 1).is_empty());
    // A prefix of a path that IS held must not match it.
    assert!(index.positions_covering("packages/web/app", 11).is_empty());
}

#[test]
fn a_position_s_links_come_back_with_their_evidence_and_state() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    let found = index.positions_covering("packages/web/app.js", 11);
    let links = index.links_of(found.first().expect("the position"));
    assert_eq!(links.len(), 2);
    assert_eq!(links[0].evidence, Evidence::Cited);
    assert_eq!(links[0].state, State::Current);
    assert_eq!(index.source_of(&links[0]), Some("code-citation"));
    assert_eq!(links[1].evidence, Evidence::Tested);
    assert_eq!(links[1].state, State::Missing);
}

#[test]
fn a_commit_that_is_not_there_reads_as_absent_and_not_as_the_first_one() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    let found = index.positions_covering("packages/daemon/main.ts", 1);
    let links = index.links_of(found.first().expect("the position"));
    // `linked_commit` was None. Index 0 is a real commit, so reading absence AS zero would answer
    // with a real date and a real SHA, which is exactly the plausible-and-wrong failure.
    assert_eq!(links[0].linked_commit, None);
    assert!(links[0].current_commit.is_some());
}

#[test]
fn an_artifact_reads_back_with_its_anchor_and_id_where_it_has_them() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    let found = index.positions_covering("packages/web/app.js", 11);
    let links = index.links_of(found.first().expect("the position"));
    let (kind, path, anchor, label, id) = index.artifact(links[0].artifact).expect("the artifact");
    assert_eq!(kind, "spec");
    assert_eq!(path, "docs/specs/desk.md");
    assert_eq!(anchor, Some("criterion-3"));
    assert_eq!(label, "`desk` criterion 3");
    assert_eq!(id, Some("PIj"));
}

#[test]
fn an_artifact_without_an_anchor_or_an_id_reads_as_having_none() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    let found = index.positions_covering("packages/daemon/main.ts", 1);
    let links = index.links_of(found.first().expect("the position"));
    let (_, _, anchor, _, id) = index.artifact(links[0].artifact).expect("the artifact");
    assert_eq!(anchor, None, "absent is not the empty string");
    assert_eq!(id, None);
}

#[test]
fn the_reverse_direction_finds_every_position_that_reaches_an_artifact() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    let found = index.positions_covering("packages/web/app.js", 11);
    let links = index.links_of(found.first().expect("the position"));
    // The spec artifact is reached twice from app.js — once cited, once tested.
    let entries = index.entries_of_artifact(links[0].artifact);
    assert_eq!(entries.len(), 2);
    for (file, _) in &entries {
        assert_eq!(index.file_path(*file), Some("packages/web/app.js"));
    }
}

#[test]
fn an_artifact_nothing_reaches_finds_nothing() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    assert!(index.entries_of_artifact(999).is_empty());
}

#[test]
fn the_witness_reads_back_what_it_was_built_from() {
    let bytes = built();
    let index = Index::open(&bytes).expect("opens");
    let witness = index.witness().expect("a witness");
    assert_eq!(witness.len(), 2);
    assert_eq!(witness[0].path, "symbols/index.json");
    assert_eq!(witness[0].size, 11_789_903);
    assert_eq!(witness[1].modified_ns, 1_700_000_000_000_000_001);
}

#[test]
fn something_that_is_not_an_index_is_refused_rather_than_read() {
    assert_eq!(Index::open(b"").err(), Some(Unreadable::NotAnIndex));
    assert_eq!(Index::open(b"not an index at all, but long enough to be one").err(), Some(Unreadable::NotAnIndex));
}

#[test]
fn a_layout_this_build_does_not_know_is_refused_by_number_so_the_caller_can_rebuild() {
    let mut bytes = built();
    let wrong = LAYOUT + 7;
    bytes[8..12].copy_from_slice(&wrong.to_le_bytes());
    assert_eq!(Index::open(&bytes).err(), Some(Unreadable::Layout(wrong)));
}

#[test]
fn a_truncated_index_answers_nothing_rather_than_reading_past_its_end() {
    let bytes = built();
    // Keep the header, lose everything the header points at.
    let cut = &bytes[..96];
    let index = Index::open(cut).expect("the header alone still opens");
    assert!(index.positions_covering("packages/web/app.js", 11).is_empty());
    assert!(index.witness().is_none());
    assert!(index.entries_of_artifact(0).is_empty());
}

#[test]
fn an_empty_index_is_a_valid_one_that_holds_nothing() {
    let bytes = Builder::new().build();
    let index = Index::open(&bytes).expect("opens");
    assert!(index.positions_covering("anything", 1).is_empty());
    assert_eq!(index.witness().expect("an empty witness").len(), 0);
}
