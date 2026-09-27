// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

//! The derived index's byte layout, as `traceability.md`'s Decisions pins it.
//!
//! Little-endian throughout, every offset absolute from the start of the file, every record
//! fixed-width so a lookup is arithmetic rather than a scan.
//!
//! This is not a published format and carries no compatibility promise. The index is throw-away
//! and rebuilt by the version that reads it, so `LAYOUT` is a stamp rather than a contract: a
//! reader meeting a number it does not know rebuilds, exactly as it does for a stale witness.
//!
//! Every width here is also written in the specification. They are stated twice on purpose — two
//! implementations read this, and a reader that disagrees with the builder by one field width does
//! not fault. It reads the next field's bytes as this one's and answers plausibly, which is the
//! failure this whole arrangement exists to make impossible rather than unlikely.

/// Eight bytes at offset 0. A file that does not start with these is not ours, whatever its name.
pub const MAGIC: &[u8; 8] = b"RYSYMIDX";

/// Bumped by any change to the layout below. A reader that meets another number rebuilds.
pub const LAYOUT: u32 = 1;

/// Byte offsets within the header, which is the only part found by position rather than by offset.
pub mod header {
    pub const MAGIC: usize = 0;
    pub const LAYOUT: usize = 8;
    /// Reserved, and written as zero, so a later field does not move what is already placed.
    pub const FLAGS: usize = 12;
    pub const WITNESS: usize = 16;
    pub const FILES: usize = 24;
    pub const POSITIONS: usize = 32;
    pub const LINK_REFS: usize = 40;
    pub const LINKS: usize = 48;
    pub const BY_ARTIFACT: usize = 56;
    pub const ARTIFACT_ENTRIES: usize = 64;
    pub const ARTIFACTS: usize = 72;
    pub const COMMITS: usize = 80;
    pub const STRINGS: usize = 88;
    /// Every section offset is a `u64` and every section begins with its own `u32` count.
    pub const SIZE: usize = 96;
}

/// A string is stored once and referred to by where it is and how long it runs: two `u32`.
pub const STR_REF: usize = 8;

/// Widths of one record in each section, in bytes.
pub mod record {
    /// path: StrRef, size: u64, modified_ns: u64 — what a witness check reads.
    pub const WITNESS: usize = 8 + 8 + 8;
    /// path: StrRef, first position: u32, count: u32. Sorted by path bytes, so a lookup bisects.
    pub const FILE: usize = 8 + 4 + 4;
    /// start line, start column, end line, end column: u32 each; names: StrRef; first link ref and
    /// count: u32 each.
    pub const POSITION: usize = 4 * 4 + 8 + 4 + 4;
    /// An index into `links`.
    pub const LINK_REF: usize = 4;
    /// artifact: u32; evidence and state: u8 each, then two bytes reserved so the next field is
    /// aligned; source: StrRef; linked and current commit: u32 each; the two content witnesses:
    /// StrRef each; made-by commit, path and line: u32 each.
    pub const LINK: usize = 4 + 1 + 1 + 2 + 8 + 4 + 4 + 8 + 8 + 4 + 4 + 4;
    /// artifact: u32; first entry: u32; count: u32. Sorted by artifact, so a lookup bisects.
    pub const BY_ARTIFACT: usize = 4 + 4 + 4;
    /// file: u32, position: u32 — the reverse direction, from an artifact back to where it landed.
    pub const ARTIFACT_ENTRY: usize = 4 + 4;
    /// kind, path, anchor, label, id: StrRef each. An absent anchor or id is a zero-length run.
    pub const ARTIFACT: usize = 8 * 5;
    /// sha and date: StrRef each.
    pub const COMMIT: usize = 8 + 8;
}

/// `null` where the format allows one: a commit that is not there, an artifact that is not named.
/// Chosen as the maximum rather than zero because zero is a valid index and a mistaken zero reads
/// as "the first one" — an answer, and a plausible one.
pub const NONE: u32 = u32::MAX;

/// How a link was known, in the order the symbols format lists them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Evidence {
    Recorded = 0,
    Cited = 1,
    Tested = 2,
    Confirmed = 3,
}

/// Whether the artifact has moved under the link since it was made.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum State {
    Current = 0,
    Suspect = 1,
    Missing = 2,
}

impl Evidence {
    /// The byte as written, or `None` where it is one this layout does not define — which is a
    /// reason to rebuild rather than to guess at which of four it meant.
    pub fn from_byte(b: u8) -> Option<Self> {
        match b {
            0 => Some(Self::Recorded),
            1 => Some(Self::Cited),
            2 => Some(Self::Tested),
            3 => Some(Self::Confirmed),
            _ => None,
        }
    }
}

impl State {
    pub fn from_byte(b: u8) -> Option<Self> {
        match b {
            0 => Some(Self::Current),
            1 => Some(Self::Suspect),
            2 => Some(Self::Missing),
            _ => None,
        }
    }
}
