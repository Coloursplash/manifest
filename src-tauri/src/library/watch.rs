//! Watches the library folder so hand-edits made outside the app show up in
//! the UI. Emits a debounced `library:changed` event; the frontend responds
//! by reloading. We deliberately don't diff here — a reload is cheap and
//! idempotent, and it means our own writes and external edits are handled by
//! the same path.

use std::any::Any;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result};
use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::new_debouncer;
use tauri::{AppHandle, Emitter};

/// Opaque handle that keeps the watcher thread alive. Dropping it stops
/// watching, so it lives in app state and is replaced when the library
/// folder changes.
pub type WatchHandle = Box<dyn Any + Send>;

/// The event name the frontend listens for.
pub const CHANGED_EVENT: &str = "library:changed";

/// Start watching `root` recursively. Returns a handle that must be retained.
pub fn spawn(app: AppHandle, root: &Path) -> Result<WatchHandle> {
    let root_owned: PathBuf = root.to_path_buf();

    let mut debouncer = new_debouncer(
        Duration::from_millis(400),
        None,
        move |result: notify_debouncer_full::DebounceEventResult| match result {
            Ok(events) => {
                // Ignore churn inside our own trash folder.
                let relevant = events.iter().any(|e| {
                    !e.paths
                        .iter()
                        .all(|p| p.components().any(|c| c.as_os_str() == ".trash"))
                });
                if relevant {
                    let _ = app.emit(CHANGED_EVENT, ());
                }
            }
            Err(errors) => {
                for err in errors {
                    log::warn!("watch error: {err}");
                }
            }
        },
    )
    .context("creating file watcher")?;

    debouncer
        .watcher()
        .watch(&root_owned, RecursiveMode::Recursive)
        .with_context(|| format!("watching {}", root_owned.display()))?;

    Ok(Box::new(debouncer))
}
