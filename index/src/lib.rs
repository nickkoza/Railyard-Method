// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

//! The derived index a symbols directory is queried through.
//!
//! The record is JSON, checked in beside the source, written by several agents at once. It is
//! authoritative and it stays legible. This is not that: it is built from the record, laid out to
//! be seeked rather than parsed, holds no fact the record does not, and can be deleted at any
//! moment by anyone — the only consequence is that the next query rebuilds it.
//!
//! Anything here that disagrees with the record is a defect here, never a finding about the code.

pub mod layout;
pub mod read;
pub mod write;

pub use layout::{Evidence, State, LAYOUT, MAGIC};
pub use read::{Index, Position, Unreadable, Witness};
pub use write::Builder;
