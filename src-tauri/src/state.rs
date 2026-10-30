//! Managed app state and its on-disk config.
//!
//! The *library* (user data) is the one SQLite file the user chose. This small
//! `config.json` (a pointer to that file plus API keys) lives in the OS
//! app-config dir and never holds library data.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::library::db::{library_file, Db};

/// Tauri-managed state: the open library database, once a file is chosen.
#[derive(Default)]
pub struct AppState {
    pub db: Mutex<Option<Db>>,
}

impl AppState {
    /// Run `f` against the open library, or fail if none is open yet.
    pub fn with_db<T>(&self, f: impl FnOnce(&mut Db) -> Result<T>) -> Result<T> {
        let mut guard = self.db.lock().unwrap_or_else(|p| p.into_inner());
        let db = guard
            .as_mut()
            .ok_or_else(|| anyhow!("no library chosen yet"))?;
        f(db)
    }

    /// The open library's file, if any.
    pub fn library_path(&self) -> Option<PathBuf> {
        let guard = self.db.lock().unwrap_or_else(|p| p.into_inner());
        guard.as_ref().map(|db| db.path().to_path_buf())
    }
}

/// Persisted app config: a pointer to the library file and the user's API
/// keys. Note this is the *only* thing outside the library that we persist.
#[derive(Serialize, Deserialize, Default)]
pub struct Config {
    /// The library file. Older configs hold its folder; see [`library_file`].
    pub library: Option<String>,
    #[serde(default)]
    pub tmdb_api_key: Option<String>,
    /// RAWG key for videogame search (rawg.io). Music/anime/manga/books need none.
    #[serde(default)]
    pub rawg_api_key: Option<String>,
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

/// The RAWG key, preferring the `RAWG_API_KEY` env var over stored config.
pub fn rawg_key(app: &AppHandle) -> Option<String> {
    if let Ok(key) = std::env::var("RAWG_API_KEY") {
        if !key.trim().is_empty() {
            return Some(key);
        }
    }
    read_config(app)
        .rawg_api_key
        .filter(|k| !k.trim().is_empty())
}

/// Point manifest at the library `path` names: open (or create) the file and
/// remember it in config. A folder from an older config resolves to its
/// `library.sqlite`, and the config is rewritten to the file. Returns the file.
pub fn activate_library(app: &AppHandle, path: &Path) -> Result<PathBuf> {
    let file = library_file(path);
    let db = Db::open(&file)?;
    let state = app.state::<AppState>();
    *state.db.lock().unwrap_or_else(|p| p.into_inner()) = Some(db);

    update_config(app, |cfg| {
        cfg.library = Some(file.to_string_lossy().to_string());
    })?;
    Ok(file)
}
