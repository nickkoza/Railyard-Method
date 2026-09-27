// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

//! A standing measurement against the NFR: a query answered from a symbols directory returns in
//! 50 ms at p95, the command's own start-up counted. Built at this repository's own scale so the
//! number means something: 551 files, 19,096 positions, 36,839 links, 2,520 artifacts.
use railyard_index::layout::{Evidence, State};
use railyard_index::write::{Artifact, Link, Position};
use railyard_index::{Builder, Index};
use std::time::Instant;

fn main() {
    let built_at = Instant::now();
    let mut b = Builder::new();
    b.source("symbols/index.json", 11_789_903, 1_700_000_000_000_000_000);
    let commit = b.commit("0123456789abcdef0123456789abcdef01234567", "2026-09-21T00:00:00Z");
    let artifacts: Vec<u32> = (0..2_520)
        .map(|i| b.artifact(Artifact {
            kind: "spec".into(),
            path: format!("docs/specs/spec-{i}.md"),
            anchor: Some(format!("criterion-{}", i % 40)),
            label: format!("`spec-{i}` criterion {}", i % 40),
            id: Some(format!("a{:02}", i % 90)),
        }))
        .collect();
    let links: Vec<u32> = (0..36_839)
        .map(|i| b.link(Link {
            artifact: artifacts[i % artifacts.len()],
            evidence: Evidence::Cited,
            state: State::Current,
            source: "code-citation".into(),
            linked_commit: Some(commit),
            current_commit: Some(commit),
        }))
        .collect();
    let per_file = 19_096 / 551;
    let mut at = 0usize;
    for f in 0..551 {
        let positions = (0..per_file)
            .map(|p| {
                let l = vec![links[at % links.len()], links[(at + 1) % links.len()]];
                at += 2;
                Position {
                    start_line: (p as u32) * 6 + 1,
                    start_col: 1,
                    end_line: (p as u32) * 6 + 4,
                    end_col: 80,
                    names: Some(format!("thing{p}")),
                    links: l,
                }
            })
            .collect();
        b.file(&format!("packages/some/module-{f:03}/file.ts"), positions);
    }
    let bytes = b.build();
    let build_ms = built_at.elapsed().as_secs_f64() * 1000.0;

    let mut worst: f64 = 0.0;
    let mut total = 0.0;
    let runs = 2_000;
    for i in 0..runs {
        let t = Instant::now();
        let index = Index::open(&bytes).expect("opens");
        let path = format!("packages/some/module-{:03}/file.ts", i % 551);
        let found = index.positions_covering(&path, ((i % 30) as u32) * 6 + 2);
        let mut seen = 0;
        for p in &found {
            for l in index.links_of(p) {
                let _ = index.artifact(l.artifact);
                seen += 1;
            }
        }
        assert!(seen > 0, "the query found links");
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        total += ms;
        worst = worst.max(ms);
    }
    println!("index built: {build_ms:.0} ms, {} bytes", bytes.len());
    println!("backward query: mean {:.4} ms, worst of {runs} {:.4} ms", total / runs as f64, worst);
}
