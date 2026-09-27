// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

//! Writes the benchmark corpus to a file, so `query` can be timed as a whole process.
use railyard_index::layout::{Evidence, State};
use railyard_index::write::{Artifact, Link, Position};
use railyard_index::Builder;

fn main() {
    let out = std::env::args().nth(1).expect("an output path");
    let mut b = Builder::new();
    b.source("symbols/index.json", 11_789_903, 1_700_000_000_000_000_000);
    let commit = b.commit("0123456789abcdef0123456789abcdef01234567", "2026-09-21T00:00:00Z");
    let artifacts: Vec<u32> = (0..2_520)
        .map(|i| b.artifact(Artifact {
            kind: "spec".into(), path: format!("docs/specs/spec-{i}.md"),
            anchor: Some(format!("criterion-{}", i % 40)),
            label: format!("`spec-{i}` criterion {}", i % 40), id: Some(format!("a{:02}", i % 90)),
        })).collect();
    let links: Vec<u32> = (0..36_839)
        .map(|i| b.link(Link {
            artifact: artifacts[i % artifacts.len()], evidence: Evidence::Cited, state: State::Current,
            source: "code-citation".into(), linked_commit: Some(commit), current_commit: Some(commit),
        })).collect();
    let per_file = 19_096 / 551;
    let mut at = 0usize;
    for f in 0..551 {
        let positions = (0..per_file).map(|p| {
            let l = vec![links[at % links.len()], links[(at + 1) % links.len()]];
            at += 2;
            Position { start_line: (p as u32) * 6 + 1, start_col: 1, end_line: (p as u32) * 6 + 4,
                       end_col: 80, names: Some(format!("thing{p}")), links: l }
        }).collect();
        b.file(&format!("packages/some/module-{f:03}/file.ts"), positions);
    }
    std::fs::write(&out, b.build()).expect("writes");
    println!("wrote {out}");
}
