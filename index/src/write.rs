// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

//! Building the derived index.
//!
//! The builder is the only thing that decides byte positions. The reader trusts what it finds
//! because this wrote it moments earlier against a witness the caller has already checked — which
//! is what lets the read path validate nothing, and is where the budget comes from.
//!
//! Two invariants the sections depend on, both established here rather than assumed downstream:
//! files are sorted by path bytes, and by-artifact records are sorted by artifact index. The
//! reader bisects both. Sorting at build time is paid once per update; a reader that could not
//! assume it would scan on every query.

use crate::layout::{header, record, Evidence, State, LAYOUT, MAGIC, NONE};

/// One source file the index is built from, as it was when it was read.
pub struct Source {
    pub path: String,
    pub size: u64,
    pub modified_ns: u64,
}

/// A range of a file, and the links it carries.
pub struct Position {
    pub start_line: u32,
    pub start_col: u32,
    pub end_line: u32,
    pub end_col: u32,
    /// What the position names, where it names anything. Absent is honest; a wrong name is worse.
    pub names: Option<String>,
    /// Indices into the links given to [`Builder::build`].
    pub links: Vec<u32>,
}

/// One artifact a link points at.
pub struct Artifact {
    pub kind: String,
    pub path: String,
    pub anchor: Option<String>,
    pub label: String,
    pub id: Option<String>,
}

/// One link, as the record holds it.
pub struct Link {
    pub artifact: u32,
    pub evidence: Evidence,
    pub state: State,
    pub source: String,
    pub linked_commit: Option<u32>,
    pub current_commit: Option<u32>,
}

/// Strings are written once and referred to. The same path appears in a file record, a witness and
/// an artifact; interning is what keeps the index proportional to distinct strings rather than to
/// mentions of them.
#[derive(Default)]
struct Strings {
    blob: Vec<u8>,
    seen: std::collections::HashMap<String, (u32, u32)>,
}

impl Strings {
    fn intern(&mut self, s: &str) -> (u32, u32) {
        if let Some(found) = self.seen.get(s) {
            return *found;
        }
        let at = self.blob.len() as u32;
        self.blob.extend_from_slice(s.as_bytes());
        let r = (at, s.len() as u32);
        self.seen.insert(s.to_string(), r);
        r
    }

    /// An absent string is a zero-length run at offset zero, which reads back as absent.
    fn intern_optional(&mut self, s: Option<&str>) -> (u32, u32) {
        match s {
            Some(text) if !text.is_empty() => self.intern(text),
            _ => (0, 0),
        }
    }
}

/// Everything one version of the record holds, ready to be laid out.
#[derive(Default)]
pub struct Builder {
    sources: Vec<Source>,
    /// Path, and the positions belonging to it.
    files: Vec<(String, Vec<Position>)>,
    links: Vec<Link>,
    artifacts: Vec<Artifact>,
    commits: Vec<(String, String)>,
}

impl Builder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn source(&mut self, path: &str, size: u64, modified_ns: u64) -> &mut Self {
        self.sources.push(Source { path: path.to_string(), size, modified_ns });
        self
    }

    pub fn file(&mut self, path: &str, positions: Vec<Position>) -> &mut Self {
        self.files.push((path.to_string(), positions));
        self
    }

    pub fn link(&mut self, link: Link) -> u32 {
        self.links.push(link);
        self.links.len() as u32 - 1
    }

    pub fn artifact(&mut self, artifact: Artifact) -> u32 {
        self.artifacts.push(artifact);
        self.artifacts.len() as u32 - 1
    }

    pub fn commit(&mut self, sha: &str, date: &str) -> u32 {
        self.commits.push((sha.to_string(), date.to_string()));
        self.commits.len() as u32 - 1
    }

    /// Lays everything out and returns the index's bytes.
    pub fn build(mut self) -> Vec<u8> {
        // Sorted by path bytes, because the reader bisects on exactly that ordering.
        self.files.sort_by(|a, b| a.0.cmp(&b.0));

        let mut strings = Strings::default();

        // Positions are flattened in file order, so a file's are contiguous and it needs only a
        // first index and a count. The same arrangement gives link refs and artifact entries.
        let mut position_rows: Vec<[u32; 8]> = Vec::new();
        let mut link_refs: Vec<u32> = Vec::new();
        let mut file_rows: Vec<(u32, u32, u32, u32)> = Vec::new();
        // artifact -> the (file, position) pairs that reach it.
        let mut by_artifact: std::collections::BTreeMap<u32, Vec<(u32, u32)>> = std::collections::BTreeMap::new();

        for (file_index, (path, positions)) in self.files.iter().enumerate() {
            let (path_at, path_len) = strings.intern(path);
            let first_position = position_rows.len() as u32;
            for position in positions {
                let (names_at, names_len) = strings.intern_optional(position.names.as_deref());
                let first_link_ref = link_refs.len() as u32;
                for which in &position.links {
                    link_refs.push(*which);
                    if let Some(link) = self.links.get(*which as usize) {
                        by_artifact
                            .entry(link.artifact)
                            .or_default()
                            .push((file_index as u32, position_rows.len() as u32));
                    }
                }
                position_rows.push([
                    position.start_line,
                    position.start_col,
                    position.end_line,
                    position.end_col,
                    names_at,
                    names_len,
                    first_link_ref,
                    position.links.len() as u32,
                ]);
            }
            file_rows.push((path_at, path_len, first_position, positions.len() as u32));
        }

        let witness_rows: Vec<(u32, u32, u64, u64)> = self
            .sources
            .iter()
            .map(|s| {
                let (at, len) = strings.intern(&s.path);
                (at, len, s.size, s.modified_ns)
            })
            .collect();

        let link_rows: Vec<[u32; 6]> = self
            .links
            .iter()
            .map(|l| {
                let (source_at, source_len) = strings.intern(&l.source);
                [
                    l.artifact,
                    ((l.evidence as u32) & 0xff) | (((l.state as u32) & 0xff) << 8),
                    source_at,
                    source_len,
                    l.linked_commit.unwrap_or(NONE),
                    l.current_commit.unwrap_or(NONE),
                ]
            })
            .collect();

        let artifact_rows: Vec<[u32; 10]> = self
            .artifacts
            .iter()
            .map(|a| {
                let kind = strings.intern(&a.kind);
                let path = strings.intern(&a.path);
                let anchor = strings.intern_optional(a.anchor.as_deref());
                let label = strings.intern(&a.label);
                let id = strings.intern_optional(a.id.as_deref());
                [kind.0, kind.1, path.0, path.1, anchor.0, anchor.1, label.0, label.1, id.0, id.1]
            })
            .collect();

        let commit_rows: Vec<[u32; 4]> = self
            .commits
            .iter()
            .map(|(sha, date)| {
                let s = strings.intern(sha);
                let d = strings.intern(date);
                [s.0, s.1, d.0, d.1]
            })
            .collect();

        // by_artifact is a BTreeMap, so iterating it is already sorted by artifact — which is the
        // ordering the reader bisects on.
        let mut artifact_entries: Vec<(u32, u32)> = Vec::new();
        let mut by_artifact_rows: Vec<(u32, u32, u32)> = Vec::new();
        for (artifact, entries) in &by_artifact {
            by_artifact_rows.push((*artifact, artifact_entries.len() as u32, entries.len() as u32));
            artifact_entries.extend(entries.iter().copied());
        }

        let mut out = vec![0u8; header::SIZE];
        out[header::MAGIC..header::MAGIC + 8].copy_from_slice(MAGIC);
        out[header::LAYOUT..header::LAYOUT + 4].copy_from_slice(&LAYOUT.to_le_bytes());

        let mut place = |out: &mut Vec<u8>, at: usize, count: usize| {
            let offset = out.len() as u64;
            out[at..at + 8].copy_from_slice(&offset.to_le_bytes());
            out.extend_from_slice(&(count as u32).to_le_bytes());
        };

        place(&mut out, header::WITNESS, witness_rows.len());
        for (at, len, size, modified) in &witness_rows {
            out.extend_from_slice(&at.to_le_bytes());
            out.extend_from_slice(&len.to_le_bytes());
            out.extend_from_slice(&size.to_le_bytes());
            out.extend_from_slice(&modified.to_le_bytes());
        }

        place(&mut out, header::FILES, file_rows.len());
        for (at, len, first, count) in &file_rows {
            for v in [at, len, first, count] {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }

        place(&mut out, header::POSITIONS, position_rows.len());
        for row in &position_rows {
            for v in row {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }

        place(&mut out, header::LINK_REFS, link_refs.len());
        for v in &link_refs {
            out.extend_from_slice(&v.to_le_bytes());
        }

        place(&mut out, header::LINKS, link_rows.len());
        for row in &link_rows {
            let before = out.len();
            // In the order `record::LINK` counts them: artifact; the packed evidence and state
            // pair with its two reserved bytes; source; the two commits; the two content
            // witnesses; the made-by triple.
            out.extend_from_slice(&row[0].to_le_bytes()); // artifact
            out.extend_from_slice(&row[1].to_le_bytes()); // evidence | state << 8, two bytes spare
            out.extend_from_slice(&row[2].to_le_bytes()); // source: offset
            out.extend_from_slice(&row[3].to_le_bytes()); // source: length
            out.extend_from_slice(&row[4].to_le_bytes()); // linked commit
            out.extend_from_slice(&row[5].to_le_bytes()); // current commit
            for _ in 0..4 {
                // linkedContent and currentContent, reserved here, written as absent strings.
                out.extend_from_slice(&0u32.to_le_bytes());
            }
            for _ in 0..3 {
                // made-by: commit, path, line — reserved here, written as absent.
                out.extend_from_slice(&NONE.to_le_bytes());
            }
            // The reader strides by `record::LINK`. A row that is not exactly that wide does not
            // fault anything: it shifts every later link by the difference, and each one reads its
            // neighbour's bytes and answers plausibly. This is the assertion that says otherwise.
            debug_assert_eq!(out.len() - before, record::LINK, "a link row is `record::LINK` wide");
        }

        place(&mut out, header::BY_ARTIFACT, by_artifact_rows.len());
        for (artifact, first, count) in &by_artifact_rows {
            for v in [artifact, first, count] {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }

        place(&mut out, header::ARTIFACT_ENTRIES, artifact_entries.len());
        for (file, position) in &artifact_entries {
            out.extend_from_slice(&file.to_le_bytes());
            out.extend_from_slice(&position.to_le_bytes());
        }

        place(&mut out, header::ARTIFACTS, artifact_rows.len());
        for row in &artifact_rows {
            for v in row {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }

        place(&mut out, header::COMMITS, commit_rows.len());
        for row in &commit_rows {
            for v in row {
                out.extend_from_slice(&v.to_le_bytes());
            }
        }

        let strings_at = out.len() as u64;
        out[header::STRINGS..header::STRINGS + 8].copy_from_slice(&strings_at.to_le_bytes());
        out.extend_from_slice(&strings.blob);

        out
    }
}
