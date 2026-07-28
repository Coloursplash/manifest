//! Managed app state and its on-disk config.
//!
//! Note the split enforced by the prime directive: the *library* (user data)
//! lives in the user's chosen folder, while this small `config.json` (just a
//! pointer to that folder) lives in the OS app-config dir. App state never
//! holds library data — it's re-read from disk on demand.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::library::watch::{self, WatchHandle};

/// Tauri-managed state. Both fields are lazily populated once a library
/// folder is chosen.
#[derive(Default)]
pub struct AppState {
    pub library: Mutex<Option<PathBuf>>,
    /// Retained so the watcher thread keeps running; replaced when the
    /// library folder changes.
    pub watcher: Mutex<Option<WatchHandle>>,
}

impl AppState {
    /// The active library root, or a user-facing error if none is set yet.
    pub fn library_root(&self) -> Result<PathBuf> {
        self.library
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| anyhow!("no library folder selected yet"))
    }
}

/// Persisted app config: a pointer to the library folder and the user's TMDB
/// key. Note this is the *only* thing outside the library that we persist.
#[derive(Serialize, Deserialize, Default)]
pub struct Config {
    pub library: Option<String>,
    #[serde(default)]
    pub tmdb_api_key: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .context("resolving app config dir")?;
    Ok(dir.join("config.json"))
}

pub fn read_config(app: &AppHandle) -> Config {
    let Ok(path) = config_path(app) else {
        return Config::default();
    };
    match std::fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => Config::default(),
    }
}

fn write_config(app: &AppHandle, cfg: &Config) -> Result<()> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("creating config dir")?;
    }
    let text = serde_json::to_string_pretty(cfg).context("serializing config")?;
    std::fs::write(&path, text).context("writing config")
}

/// Read-modify-write the config so updating one field never clobbers another.
pub fn update_config(app: &AppHandle, edit: impl FnOnce(&mut Config)) -> Result<()> {
    let mut cfg = read_config(app);
    edit(&mut cfg);
    write_config(app, &cfg)
}

/// The TMDB key, preferring the `TMDB_API_KEY` env var over stored config.
pub fn tmdb_key(app: &AppHandle) -> Option<String> {
    if let Ok(key) = std::env::var("TMDB_API_KEY") {
        if !key.trim().is_empty() {
            return Some(key);
        }
    }
    read_config(app)
        .tmdb_api_key
        .filter(|k| !k.trim().is_empty())
}

/// Point manifest at `root`: create the folder layout, remember it (in state
/// and config), and start watching it. Reused on startup to restore the last
/// library and by the "choose folder" command.
pub fn activate_library(app: &AppHandle, root: &Path) -> Result<()> {
    crate::library::store::ensure_layout(root)?;

    let state = app.state::<AppState>();
    *state.library.lock().unwrap() = Some(root.to_path_buf());

    // Start (and retain) a fresh watcher, dropping any previous one.
    let handle = watch::spawn(app.clone(), root)?;
    *state.watcher.lock().unwrap() = Some(handle);

    update_config(app, |cfg| {
        cfg.library = Some(root.to_string_lossy().to_string());
    })?;
    Ok(())
}
