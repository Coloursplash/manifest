//! Thin Tauri command layer. These do argument marshalling and error
//! stringification only; all real logic lives in `library::db` and `state`.

use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};

use crate::cover;
use crate::fetch::{self, Candidate};
use crate::library::db::{LogDraft, NewEntry, DB_FILE};
use crate::library::{Entry, Medium};
use crate::state::{self, AppState};

/// Map any internal error to a plain string for the frontend.
fn err<E: std::fmt::Display>(e: E) -> String {
    format!("{e:#}")
}

/// The currently open library file, if any.
#[tauri::command]
fn get_library_path(state: State<AppState>) -> Option<String> {
    state
        .library_path()
        .map(|p| p.to_string_lossy().to_string())
}

/// Run a native file dialog off the main thread, then activate the library
/// file the user chose and return its path. `None` if they cancel.
///
/// The commands using it must be async: sync commands run on the main thread,
/// and blocking there while the dialog waits on that thread's event loop
/// deadlocks.
async fn pick_library(
    app: AppHandle,
    pick: impl FnOnce(FileDialogBuilder<tauri::Wry>) -> Option<FilePath> + Send + 'static,
) -> Result<Option<String>, String> {
    let dialog = app
        .dialog()
        .file()
        .add_filter("manifest library", &["sqlite"]);
    let chosen = tauri::async_runtime::spawn_blocking(move || pick(dialog))
        .await
        .map_err(err)?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let path = chosen.into_path().map_err(err)?;
    let file = state::activate_library(&app, &path).map_err(err)?;
    Ok(Some(file.to_string_lossy().to_string()))
}

/// Pick an existing library file and open it.
#[tauri::command]
async fn open_library(app: AppHandle) -> Result<Option<String>, String> {
    pick_library(app, |d| d.set_title("Open a library").blocking_pick_file()).await
}

/// Choose where to save a new library file and create it. Choosing a file
/// that already exists opens it; it is never overwritten.
#[tauri::command]
async fn new_library(app: AppHandle) -> Result<Option<String>, String> {
    pick_library(app, |d| {
        d.set_title("New library")
            .set_file_name(DB_FILE)
            .blocking_save_file()
    })
    .await
}

/// Activate a library by explicit path (switching to a recent library).
/// Returns the file it resolved to: a folder from an older recent-libraries
/// list resolves to the `library.sqlite` inside it.
#[tauri::command]
fn set_library(app: AppHandle, path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(path);
    if !path.exists() {
        return Err(format!("{} no longer exists", path.display()));
    }
    let file = state::activate_library(&app, &path).map_err(err)?;
    Ok(file.to_string_lossy().to_string())
}

#[tauri::command]
fn list_entries(state: State<AppState>) -> Result<Vec<Entry>, String> {
    state.with_db(|db| db.list()).map_err(err)
}

#[tauri::command]
fn get_entry(state: State<AppState>, id: String) -> Result<Entry, String> {
    state.with_db(|db| db.get(&id)).map_err(err)
}

/// Add a dated block to an entry's log ("log a watch/read"). `end` makes it a
/// span, for the media you get through over days or weeks. Returns the entry.
#[tauri::command]
fn add_log(
    state: State<AppState>,
    id: String,
    date: String,
    end: Option<String>,
    tags: Vec<String>,
    body: String,
) -> Result<Entry, String> {
    let draft = LogDraft {
        date,
        end,
        tags,
        body,
    };
    state.with_db(|db| db.add_log(&id, draft)).map_err(err)
}

/// Replace one log block, addressed by its id. Returns the owning entry.
#[tauri::command]
fn update_log(
    state: State<AppState>,
    log_id: i64,
    date: String,
    end: Option<String>,
    tags: Vec<String>,
    body: String,
) -> Result<Entry, String> {
    let draft = LogDraft {
        date,
        end,
        tags,
        body,
    };
    state
        .with_db(|db| db.update_log(log_id, draft))
        .map_err(err)
}

/// Delete one log block by id. Returns the owning entry.
#[tauri::command]
fn delete_log(state: State<AppState>, log_id: i64) -> Result<Entry, String> {
    state.with_db(|db| db.delete_log(log_id)).map_err(err)
}

/// Set/clear fields (status, rating, dates, progress, metadata). A `null`
/// value clears one.
#[tauri::command]
fn patch_entry(
    state: State<AppState>,
    id: String,
    patch: serde_json::Map<String, serde_json::Value>,
) -> Result<Entry, String> {
    state.with_db(|db| db.patch(&id, &patch)).map_err(err)
}

#[derive(Deserialize)]
pub struct CreatePayload {
    pub medium: String,
    pub title: String,
    #[serde(default)]
    pub year: Option<i64>,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    /// Per-medium fields (director, author, …).
    #[serde(default)]
    pub fields: serde_json::Map<String, serde_json::Value>,
}

#[tauri::command]
fn create_entry(state: State<AppState>, payload: CreatePayload) -> Result<Entry, String> {
    let medium: Medium = payload
        .medium
        .parse()
        .map_err(|_| format!("unknown medium: {}", payload.medium))?;
    let status = match payload.status {
        Some(s) => Some(s.parse().map_err(|_| format!("unknown status: {s}"))?),
        None => None,
    };
    let new = NewEntry {
        medium,
        title: payload.title,
        year: payload.year,
        cover: payload.cover,
        status,
        fields: payload.fields,
    };
    state.with_db(|db| db.create(new)).map_err(err)
}

/// Move an entry to the trash (kept in the database, hidden from the library).
#[tauri::command]
fn delete_entry(state: State<AppState>, id: String) -> Result<(), String> {
    state.with_db(|db| db.trash(&id)).map_err(err)
}

// --- fetch + covers (M2) ---

/// Search the appropriate metadata provider for a medium; returns suggestions.
#[tauri::command]
async fn search_metadata(
    app: AppHandle,
    medium: String,
    query: String,
) -> Result<Vec<Candidate>, String> {
    let medium: Medium = medium
        .parse()
        .map_err(|_| format!("unknown medium: {medium}"))?;
    let tmdb = state::tmdb_key(&app);
    let rawg = state::rawg_key(&app);
    fetch::search(medium, &query, tmdb.as_deref(), rawg.as_deref())
        .await
        .map_err(err)
}

/// Fetch the extra metadata (crew, cast, genres, runtime) for a chosen search
/// hit, keyed by its provider `reference`. Called once, on commit; returns a
/// bag of fields to merge into the new entry. Degrades to an empty map when a
/// provider needs no follow-up.
#[tauri::command]
async fn fetch_details(
    app: AppHandle,
    medium: String,
    reference: String,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let medium: Medium = medium
        .parse()
        .map_err(|_| format!("unknown medium: {medium}"))?;
    let tmdb = state::tmdb_key(&app);
    let rawg = state::rawg_key(&app);
    fetch::details(medium, &reference, tmdb.as_deref(), rawg.as_deref())
        .await
        .map_err(err)
}

/// Download a cover into the local cache and return its file path.
#[tauri::command]
async fn cache_cover(app: AppHandle, url: String) -> Result<String, String> {
    let path = cover::cache(&app, &url).await.map_err(err)?;
    Ok(path.to_string_lossy().to_string())
}

/// Whether a TMDB key is configured (via env or stored config). We don't hand
/// the key itself back to the frontend.
#[tauri::command]
fn has_tmdb_key(app: AppHandle) -> bool {
    state::tmdb_key(&app).is_some()
}

/// Store (or clear, with an empty string) the user's TMDB key.
#[tauri::command]
fn set_tmdb_key(app: AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    state::update_config(&app, |cfg| {
        cfg.tmdb_api_key = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
    })
    .map_err(err)
}

/// Whether a RAWG key is configured (via env or stored config), gating
/// videogame search the same way `has_tmdb_key` gates film/TV.
#[tauri::command]
fn has_rawg_key(app: AppHandle) -> bool {
    state::rawg_key(&app).is_some()
}

/// Store (or clear, with an empty string) the user's RAWG key.
#[tauri::command]
fn set_rawg_key(app: AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim().to_string();
    state::update_config(&app, |cfg| {
        cfg.rawg_api_key = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
    })
    .map_err(err)
}

/// The set of commands exposed to the frontend.
pub fn handlers() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        get_library_path,
        open_library,
        new_library,
        set_library,
        list_entries,
        get_entry,
        add_log,
        update_log,
        delete_log,
        patch_entry,
        create_entry,
        delete_entry,
        search_metadata,
        fetch_details,
        cache_cover,
        has_tmdb_key,
        set_tmdb_key,
        has_rawg_key,
        set_rawg_key,
    ]
}
