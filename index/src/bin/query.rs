// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

//! One query, as the NFR measures it: a process that starts, reads a prebuilt index off disk,
//! answers, and exits. Nothing is warmed and nothing is kept.
use railyard_index::Index;

fn main() {
    let mut args = std::env::args().skip(1);
    let (path, file, line) = (
        args.next().expect("index path"),
        args.next().expect("file"),
        args.next().expect("line").parse::<u32>().expect("a line number"),
    );
    let bytes = std::fs::read(&path).expect("the index");
    let index = Index::open(&bytes).expect("opens");
    let mut found = 0;
    for p in index.positions_covering(&file, line) {
        for l in index.links_of(&p) {
            if let Some((_, artifact_path, anchor, _, _)) = index.artifact(l.artifact) {
                println!("{artifact_path}{}", anchor.map(|a| format!("#{a}")).unwrap_or_default());
                found += 1;
            }
        }
    }
    if found == 0 {
        println!("nothing traces to {file}:{line}");
    }
}
