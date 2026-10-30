//! Shared helpers for the backend integration suites.
//!
//! These tests drive the real `Db` against a real SQLite file in a temp
//! directory — no Tauri app, no mocks.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

/// A temp library folder that deletes itself when dropped, so each test gets a
/// clean root even when Cargo runs the suite in parallel. We avoid pulling in
/// `tempfile` (and its dep tree) to keep the offline `nix flake check` build
/// lean — a process-id + atomic-counter name is unique enough within a run.
pub struct TempLib {
    pub root: PathBuf,
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

impl TempLib {
    /// Create a fresh, empty library root under the OS temp dir.
    pub fn new() -> Self {
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("manifest-it-{}-{}", std::process::id(), n));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("create temp library root");
        TempLib { root }
    }
}

impl Drop for TempLib {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
