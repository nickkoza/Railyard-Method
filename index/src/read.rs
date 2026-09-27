// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

//! Reading the derived index.
//!
//! Every accessor takes the whole file as bytes and reaches into it. Nothing is parsed up front
//! and nothing is copied: a query touches the header, one binary search, and the few hundred bytes
//! its answer is made of. That is the entire reason the index exists — the record it is built from
//! is megabytes, and an answer is kilobytes.
//!
//! Every read is bounds-checked and returns `None` rather than panicking. The index is a file on
//! disk that anything could have truncated or replaced, so it is treated as untrusted input even
//! though this crate wrote it: `Malformed` is a reason to rebuild, and rebuilding is cheap.

use crate::layout::{header, record, Evidence, State, LAYOUT, MAGIC, NONE, STR_REF};

/// A reason the index could not be read, each of which means rebuild rather than fail.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unreadable {
    /// Does not begin with the magic: not an index, whatever it is.
    NotAnIndex,
    /// A layout this build does not know. Not an error — the index is throw-away.
    Layout(u32),
    /// Truncated, or an offset pointing outside the file.
    Malformed,
}

/// The index, borrowed from bytes somebody else owns — mapped, read, or held in a test.
pub struct Index<'a> {
    bytes: &'a [u8],
}

/// Where a string is and how long it runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StrRef {
    pub at: u32,
    pub len: u32,
}

/// One source file the index was built from, and what it looked like then.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Witness<'a> {
    pub path: &'a str,
    pub size: u64,
    pub modified_ns: u64,
}

/// A range of a file, and where its links begin.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Position {
    pub start_line: u32,
    pub start_col: u32,
    pub end_line: u32,
    pub end_col: u32,
    names: StrRef,
    first_link_ref: u32,
    link_count: u32,
}

impl Position {
    /// Whether this position covers `line`. The end is exclusive as a pair, so a position that
    /// ends at the very start of a later line does not reach into it.
    pub fn covers(&self, line: u32) -> bool {
        if line < self.start_line || line > self.end_line {
            return false;
        }
        !(line == self.end_line && self.end_col == 1 && self.end_line > self.start_line)
    }
}

/// One artifact a position traces to, and how that is known.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Link {
    pub artifact: u32,
    pub evidence: Evidence,
    pub state: State,
    source: StrRef,
    pub linked_commit: Option<u32>,
    pub current_commit: Option<u32>,
}

/// An artifact a position traces to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Artifact {
    kind: StrRef,
    path: StrRef,
    anchor: StrRef,
    label: StrRef,
    id: StrRef,
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    bytes.get(at..at + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

fn u64_at(bytes: &[u8], at: usize) -> Option<u64> {
    bytes
        .get(at..at + 8)
        .map(|b| u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
}

fn str_ref_at(bytes: &[u8], at: usize) -> Option<StrRef> {
    Some(StrRef { at: u32_at(bytes, at)?, len: u32_at(bytes, at + 4)? })
}

/// `NONE` reads as absent; anything else is the index it says it is.
fn optional(raw: u32) -> Option<u32> {
    if raw == NONE {
        None
    } else {
        Some(raw)
    }
}

impl<'a> Index<'a> {
    /// Checks the magic and the layout stamp, and nothing else: everything below bounds-checks
    /// itself, so a truncated file is found where it is read rather than by a pass over the whole
    /// of it. The point of the index is not reading all of it.
    pub fn open(bytes: &'a [u8]) -> Result<Self, Unreadable> {
        if bytes.len() < header::SIZE || &bytes[header::MAGIC..header::MAGIC + 8] != MAGIC {
            return Err(Unreadable::NotAnIndex);
        }
        let stamp = u32_at(bytes, header::LAYOUT).ok_or(Unreadable::Malformed)?;
        if stamp != LAYOUT {
            return Err(Unreadable::Layout(stamp));
        }
        Ok(Self { bytes })
    }

    /// The string a reference names, or `None` where it runs outside the file or is not UTF-8.
    pub fn text(&self, r: StrRef) -> Option<&'a str> {
        let base = u64_at(self.bytes, header::STRINGS)? as usize;
        let at = base.checked_add(r.at as usize)?;
        let end = at.checked_add(r.len as usize)?;
        std::str::from_utf8(self.bytes.get(at..end)?).ok()
    }

    /// A section's first record and how many there are.
    fn section(&self, offset_at: usize, width: usize) -> Option<(usize, u32)> {
        let base = u64_at(self.bytes, offset_at)? as usize;
        let count = u32_at(self.bytes, base)?;
        // The count is followed immediately by the records themselves.
        let first = base.checked_add(4)?;
        // A count that could not fit in the file is a malformed index, not a long one.
        let bytes_needed = (count as usize).checked_mul(width)?;
        if first.checked_add(bytes_needed)? > self.bytes.len() {
            return None;
        }
        Some((first, count))
    }

    /// What the index was built from, for the caller to compare against what is on disk now.
    pub fn witness(&self) -> Option<Vec<Witness<'a>>> {
        let (first, count) = self.section(header::WITNESS, record::WITNESS)?;
        let mut out = Vec::with_capacity(count as usize);
        for i in 0..count as usize {
            let at = first + i * record::WITNESS;
            out.push(Witness {
                path: self.text(str_ref_at(self.bytes, at)?)?,
                size: u64_at(self.bytes, at + STR_REF)?,
                modified_ns: u64_at(self.bytes, at + STR_REF + 8)?,
            });
        }
        Some(out)
    }

    /// The record for `path`, found by bisecting the files section, which is sorted by path bytes.
    fn file_record(&self, path: &str) -> Option<(u32, u32)> {
        let (first, count) = self.section(header::FILES, record::FILE)?;
        let (mut lo, mut hi) = (0usize, count as usize);
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            let at = first + mid * record::FILE;
            let found = self.text(str_ref_at(self.bytes, at)?)?;
            match found.cmp(path) {
                std::cmp::Ordering::Less => lo = mid + 1,
                std::cmp::Ordering::Greater => hi = mid,
                std::cmp::Ordering::Equal => {
                    return Some((u32_at(self.bytes, at + STR_REF)?, u32_at(self.bytes, at + STR_REF + 4)?));
                }
            }
        }
        None
    }

    fn position_at(&self, i: u32) -> Option<Position> {
        let (first, count) = self.section(header::POSITIONS, record::POSITION)?;
        if i >= count {
            return None;
        }
        let at = first + i as usize * record::POSITION;
        Some(Position {
            start_line: u32_at(self.bytes, at)?,
            start_col: u32_at(self.bytes, at + 4)?,
            end_line: u32_at(self.bytes, at + 8)?,
            end_col: u32_at(self.bytes, at + 12)?,
            names: str_ref_at(self.bytes, at + 16)?,
            first_link_ref: u32_at(self.bytes, at + 24)?,
            link_count: u32_at(self.bytes, at + 28)?,
        })
    }

    /// What a position names — the function or binding its first line falls inside — or `None`
    /// where it names nothing, which the format says is honest rather than missing.
    pub fn names(&self, p: &Position) -> Option<&'a str> {
        if p.names.len == 0 {
            return None;
        }
        self.text(p.names)
    }

    /// Every position of `path` that covers `line`. The answer to `backward`.
    pub fn positions_covering(&self, path: &str, line: u32) -> Vec<Position> {
        let Some((first, count)) = self.file_record(path) else {
            return Vec::new();
        };
        (0..count)
            .filter_map(|i| self.position_at(first + i))
            .filter(|p| p.covers(line))
            .collect()
    }

    /// The links a position carries.
    pub fn links_of(&self, p: &Position) -> Vec<Link> {
        let Some((refs_first, refs_count)) = self.section(header::LINK_REFS, record::LINK_REF) else {
            return Vec::new();
        };
        let Some((links_first, links_count)) = self.section(header::LINKS, record::LINK) else {
            return Vec::new();
        };
        let mut out = Vec::with_capacity(p.link_count as usize);
        for i in 0..p.link_count {
            let r = p.first_link_ref + i;
            if r >= refs_count {
                break;
            }
            let Some(which) = u32_at(self.bytes, refs_first + r as usize * record::LINK_REF) else {
                break;
            };
            if which >= links_count {
                break;
            }
            let at = links_first + which as usize * record::LINK;
            let (Some(artifact), Some(evidence), Some(state)) = (
                u32_at(self.bytes, at),
                self.bytes.get(at + 4).copied().and_then(Evidence::from_byte),
                self.bytes.get(at + 5).copied().and_then(State::from_byte),
            ) else {
                break;
            };
            let (Some(source), Some(linked), Some(current)) = (
                str_ref_at(self.bytes, at + 8),
                u32_at(self.bytes, at + 16),
                u32_at(self.bytes, at + 20),
            ) else {
                break;
            };
            out.push(Link {
                artifact,
                evidence,
                state,
                source,
                linked_commit: optional(linked),
                current_commit: optional(current),
            });
        }
        out
    }

    /// The concrete source a link was read from, as the producer named it.
    pub fn source_of(&self, l: &Link) -> Option<&'a str> {
        self.text(l.source)
    }

    fn artifact_at(&self, i: u32) -> Option<Artifact> {
        let (first, count) = self.section(header::ARTIFACTS, record::ARTIFACT)?;
        if i >= count {
            return None;
        }
        let at = first + i as usize * record::ARTIFACT;
        Some(Artifact {
            kind: str_ref_at(self.bytes, at)?,
            path: str_ref_at(self.bytes, at + 8)?,
            anchor: str_ref_at(self.bytes, at + 16)?,
            label: str_ref_at(self.bytes, at + 24)?,
            id: str_ref_at(self.bytes, at + 32)?,
        })
    }

    /// An artifact by its index, with its strings resolved: kind, path, anchor, label, stable ID.
    /// An absent anchor or ID is `None` rather than an empty string, because the format's absence
    /// means "this artifact has none" and an empty string would read as one it has.
    pub fn artifact(&self, i: u32) -> Option<(&'a str, &'a str, Option<&'a str>, &'a str, Option<&'a str>)> {
        let a = self.artifact_at(i)?;
        let optional_text = |r: StrRef| if r.len == 0 { None } else { self.text(r) };
        Some((self.text(a.kind)?, self.text(a.path)?, optional_text(a.anchor), self.text(a.label)?, optional_text(a.id)))
    }

    /// Every position that traces to the artifact at `which`, as file index and position index.
    /// The answer to `forward`.
    pub fn entries_of_artifact(&self, which: u32) -> Vec<(u32, u32)> {
        let Some((first, count)) = self.section(header::BY_ARTIFACT, record::BY_ARTIFACT) else {
            return Vec::new();
        };
        let (mut lo, mut hi) = (0usize, count as usize);
        while lo < hi {
            let mid = lo + (hi - lo) / 2;
            let at = first + mid * record::BY_ARTIFACT;
            let Some(found) = u32_at(self.bytes, at) else { return Vec::new() };
            match found.cmp(&which) {
                std::cmp::Ordering::Less => lo = mid + 1,
                std::cmp::Ordering::Greater => hi = mid,
                std::cmp::Ordering::Equal => {
                    let (Some(entry_first), Some(entry_count)) =
                        (u32_at(self.bytes, at + 4), u32_at(self.bytes, at + 8))
                    else {
                        return Vec::new();
                    };
                    let Some((entries_first, entries_total)) =
                        self.section(header::ARTIFACT_ENTRIES, record::ARTIFACT_ENTRY)
                    else {
                        return Vec::new();
                    };
                    return (0..entry_count)
                        .filter(|i| entry_first + i < entries_total)
                        .filter_map(|i| {
                            let e = entries_first + (entry_first + i) as usize * record::ARTIFACT_ENTRY;
                            Some((u32_at(self.bytes, e)?, u32_at(self.bytes, e + 4)?))
                        })
                        .collect();
                }
            }
        }
        Vec::new()
    }

    /// A file's path by its index, for naming what `forward` found.
    pub fn file_path(&self, i: u32) -> Option<&'a str> {
        let (first, count) = self.section(header::FILES, record::FILE)?;
        if i >= count {
            return None;
        }
        self.text(str_ref_at(self.bytes, first + i as usize * record::FILE)?)
    }
}
