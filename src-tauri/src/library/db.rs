//! The library database: one SQLite file, `library.sqlite`, in the folder the
//! user picked. Every read and write of library data goes through [`Db`].
//!
//! Two tables:
//! - `entries` — one row per title. The shared fields are typed columns; the
//!   per-medium metadata (`director`, `episodes`, …) is a JSON object in
//!   `extra`, and `tags` is a JSON array.
//! - `logs` — one row per dated block of an entry's log, with its own stable
//!   `id`. Edits and deletes address a log by that id, never by position.
//!
//! Every write runs in a transaction, so a crash leaves the old state or the
//! new one, never half of each. Trashing an entry sets `trashed_at` rather than
//! deleting the row, so it can be recovered.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use serde_json::{Map, Value as Json};

use super::schema::{Entry, LogEntry, Medium, Status};

pub const DB_FILE: &str = "library.sqlite";

/// Bump when `SCHEMA` changes, and add a migration step in [`migrate`].
const SCHEMA_VERSION: i64 = 1;

const SCHEMA: &str = "
CREATE TABLE entries (
    id         TEXT PRIMARY KEY,           -- \"film/blade-runner-2049\"
    medium     TEXT NOT NULL,
    title      TEXT NOT NULL,
    year       INTEGER,
    cover      TEXT,                       -- remote URL; the local cache is derived
    status     TEXT,
    rating     REAL,
    tags       TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
    owned      INTEGER,                    -- 1 / 0 / NULL (NULL = not owned)
    started    TEXT,                       -- YYYY-MM-DD
    finished   TEXT,
    progress   INTEGER,
    season     INTEGER,
    extra      TEXT NOT NULL DEFAULT '{}', -- JSON object: per-medium metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    trashed_at TEXT
);
CREATE TABLE logs (
    id       INTEGER PRIMARY KEY,
    entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    date     TEXT NOT NULL,                -- YYYY-MM-DD
    end      TEXT,                         -- last day of a span, or NULL
    tags     TEXT NOT NULL DEFAULT '[]',
    body     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX logs_by_entry ON logs(entry_id, date);
";

/// Fields with their own column (or otherwise not patchable as metadata). A
/// provider field with one of these names is never written into `extra`.
const RESERVED: [&str; 16] = [
    "id", "medium", "slug", "title", "year", "cover", "status", "rating", "tags", "owned",
    "started", "finished", "progress", "season", "notes", "logs",
];

const ENTRY_COLUMNS: &str = "id, medium, title, year, cover, status, rating, tags, owned, \
                             started, finished, progress, season, extra";

/// A brand-new entry, as the add flow creates it.
pub struct NewEntry {
    pub medium: Medium,
    pub title: String,
    pub year: Option<i64>,
    pub cover: Option<String>,
    pub status: Option<Status>,
    /// Per-medium metadata from the provider (director, author, …).
    pub fields: Map<String, Json>,
}

/// What the log editor submits. Validated by [`clean_log`] before it's stored.
pub struct LogDraft {
    pub date: String,
    pub end: Option<String>,
    pub tags: Vec<String>,
    pub body: String,
}

pub struct Db {
    conn: Connection,
    root: PathBuf,
}

impl Db {
    /// Open (or create) the database in `root`. A brand-new database imports
    /// any legacy `.toml` library found in the same folder, once.
    pub fn open(root: &Path) -> Result<Db> {
        std::fs::create_dir_all(root)
            .with_context(|| format!("creating library folder {}", root.display()))?;
        let path = root.join(DB_FILE);
        let conn =
            Connection::open(&path).with_context(|| format!("opening {}", path.display()))?;
        // Rollback journal rather than WAL: WAL keeps -wal/-shm files beside the
        // database, which sync tools (iCloud, Dropbox) can copy out of step.
        conn.execute_batch(
            "PRAGMA journal_mode = DELETE;
             PRAGMA synchronous = FULL;
             PRAGMA foreign_keys = ON;",
        )?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;

        let mut db = Db {
            conn,
            root: root.to_path_buf(),
        };
        let fresh = db.migrate()?;
        if fresh {
            let legacy = super::import::read_legacy(root);
            if !legacy.is_empty() {
                let n = db.import(legacy)?;
                log::info!("imported {n} entries from the legacy .toml library");
            }
        }
        Ok(db)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Bring the schema up to date. Returns true when the database was new.
    fn migrate(&mut self) -> Result<bool> {
        let version: i64 = self
            .conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > SCHEMA_VERSION {
            bail!(
                "this library was written by a newer version of manifest \
                 (schema {version}, this build knows {SCHEMA_VERSION})"
            );
        }
        if version == 0 {
            let tx = self.conn.transaction()?;
            tx.execute_batch(SCHEMA)?;
            tx.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION}"))?;
            tx.commit()?;
            return Ok(true);
        }
        Ok(false)
    }

    // --- reads --------------------------------------------------------------

    /// Every entry not in the trash, sorted by title, each with its logs.
    pub fn list(&self) -> Result<Vec<Entry>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {ENTRY_COLUMNS} FROM entries WHERE trashed_at IS NULL
             ORDER BY title COLLATE NOCASE, id"
        ))?;
        let mut entries = stmt
            .query_map([], entry_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut stmt = self.conn.prepare(
            "SELECT entry_id, id, date, end, tags, body FROM logs ORDER BY date, end, id",
        )?;
        let mut by_entry: std::collections::HashMap<String, Vec<LogEntry>> = Default::default();
        for row in stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, log_from_row(r, 1)?)))? {
            let (entry_id, log) = row?;
            by_entry.entry(entry_id).or_default().push(log);
        }
        for e in &mut entries {
            e.logs = by_entry.remove(&e.id).unwrap_or_default();
        }
        Ok(entries)
    }

    /// One entry with its logs. Errors if it doesn't exist or is in the trash.
    pub fn get(&self, id: &str) -> Result<Entry> {
        get_entry(&self.conn, id)
    }

    // --- writes -------------------------------------------------------------

    /// Create an entry. Its id is a slug of the title, made unique: a second
    /// "Dune" becomes `film/dune-2021`, then `film/dune-2`, and so on.
    pub fn create(&mut self, new: NewEntry) -> Result<Entry> {
        let title = new.title.trim();
        if title.is_empty() {
            bail!("a title is required");
        }
        let tx = self.conn.transaction()?;
        let id = unique_id(&tx, new.medium, title, new.year)?;
        let extra: Map<String, Json> = new
            .fields
            .into_iter()
            .filter(|(k, v)| !RESERVED.contains(&k.as_str()) && !v.is_null())
            .collect();
        let entry = Entry {
            slug: slug_of(&id).to_string(),
            id,
            medium: new.medium,
            title: title.to_string(),
            year: new.year,
            cover: new.cover.filter(|c| !c.trim().is_empty()),
            status: Some(new.status.unwrap_or(Status::Want)),
            rating: None,
            tags: Vec::new(),
            owned: None,
            started: None,
            finished: None,
            progress: None,
            season: None,
            logs: Vec::new(),
            extra,
        };
        insert_entry(&tx, &entry)?;
        let created = get_entry(&tx, &entry.id)?;
        tx.commit()?;
        Ok(created)
    }

    /// Set or clear fields. A JSON `null` clears one. Typed fields are checked
    /// (a date must be `YYYY-MM-DD`, a year an integer, …); any other key is
    /// per-medium metadata and lands in `extra`.
    pub fn patch(&mut self, id: &str, patch: &Map<String, Json>) -> Result<Entry> {
        let tx = self.conn.transaction()?;
        let mut e = get_entry(&tx, id)?;
        for (key, val) in patch {
            apply_field(&mut e, key, val)?;
        }
        update_entry(&tx, &e)?;
        let updated = get_entry(&tx, id)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn add_log(&mut self, id: &str, draft: LogDraft) -> Result<Entry> {
        let log = clean_log(draft)?;
        let tx = self.conn.transaction()?;
        get_entry(&tx, id)?; // must exist and not be trashed
        insert_log(&tx, id, &log)?;
        touch(&tx, id)?;
        let updated = get_entry(&tx, id)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn update_log(&mut self, log_id: i64, draft: LogDraft) -> Result<Entry> {
        let log = clean_log(draft)?;
        let tx = self.conn.transaction()?;
        let entry_id = log_owner(&tx, log_id)?;
        tx.execute(
            "UPDATE logs SET date = ?1, end = ?2, tags = ?3, body = ?4 WHERE id = ?5",
            params![log.date, log.end, to_json(&log.tags), log.body, log_id],
        )?;
        touch(&tx, &entry_id)?;
        let updated = get_entry(&tx, &entry_id)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn delete_log(&mut self, log_id: i64) -> Result<Entry> {
        let tx = self.conn.transaction()?;
        let entry_id = log_owner(&tx, log_id)?;
        tx.execute("DELETE FROM logs WHERE id = ?1", [log_id])?;
        touch(&tx, &entry_id)?;
        let updated = get_entry(&tx, &entry_id)?;
        tx.commit()?;
        Ok(updated)
    }

    /// Move an entry to the trash. The row (and its logs) stay in the file.
    pub fn trash(&mut self, id: &str) -> Result<()> {
        let n = self.conn.execute(
            "UPDATE entries SET trashed_at = datetime('now')
             WHERE id = ?1 AND trashed_at IS NULL",
            [id],
        )?;
        if n == 0 {
            bail!("no entry {id}");
        }
        Ok(())
    }

    /// Insert entries read from the legacy `.toml` library, keeping their ids.
    /// All or nothing: one transaction.
    pub fn import(&mut self, legacy: Vec<(Entry, Vec<LogDraft>)>) -> Result<usize> {
        let tx = self.conn.transaction()?;
        let mut n = 0;
        for (entry, logs) in legacy {
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM entries WHERE id = ?1)",
                [&entry.id],
                |r| r.get(0),
            )?;
            if exists {
                continue;
            }
            insert_entry(&tx, &entry)?;
            for draft in logs {
                match clean_log(draft) {
                    Ok(log) => insert_log(&tx, &entry.id, &log)?,
                    Err(err) => log::warn!("skipping a log on {}: {err:#}", entry.id),
                }
            }
            n += 1;
        }
        tx.commit()?;
        Ok(n)
    }
}

// --- row mapping ---------------------------------------------------------------

fn entry_from_row(r: &Row) -> rusqlite::Result<Entry> {
    let id: String = r.get("id")?;
    let medium: String = r.get("medium")?;
    let status: Option<String> = r.get("status")?;
    let tags: String = r.get("tags")?;
    let extra: String = r.get("extra")?;
    let owned: Option<i64> = r.get("owned")?;
    Ok(Entry {
        slug: slug_of(&id).to_string(),
        // Written by this module only, so an unknown medium is corruption; fall
        // back rather than refusing to show the whole library.
        medium: medium.parse().unwrap_or(Medium::Film),
        id,
        title: r.get("title")?,
        year: r.get("year")?,
        cover: r.get("cover")?,
        status: status.and_then(|s| s.parse().ok()),
        rating: r.get("rating")?,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        owned: owned.map(|n| n != 0),
        started: r.get("started")?,
        finished: r.get("finished")?,
        progress: r.get("progress")?,
        season: r.get("season")?,
        logs: Vec::new(),
        extra: serde_json::from_str(&extra).unwrap_or_default(),
    })
}

/// A `logs` row whose `id, date, end, tags, body` start at column `at`.
fn log_from_row(r: &Row, at: usize) -> rusqlite::Result<LogEntry> {
    let tags: String = r.get(at + 3)?;
    Ok(LogEntry {
        id: r.get(at)?,
        date: r.get(at + 1)?,
        end: r.get(at + 2)?,
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        body: r.get(at + 4)?,
    })
}

fn get_entry(conn: &Connection, id: &str) -> Result<Entry> {
    let mut entry = conn
        .query_row(
            &format!("SELECT {ENTRY_COLUMNS} FROM entries WHERE id = ?1 AND trashed_at IS NULL"),
            [id],
            entry_from_row,
        )
        .optional()?
        .ok_or_else(|| anyhow!("no entry {id}"))?;
    let mut stmt = conn.prepare(
        "SELECT id, date, end, tags, body FROM logs WHERE entry_id = ?1 ORDER BY date, end, id",
    )?;
    entry.logs = stmt
        .query_map([id], |r| log_from_row(r, 0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(entry)
}

fn insert_entry(tx: &Transaction, e: &Entry) -> Result<()> {
    tx.execute(
        &format!("INSERT INTO entries ({ENTRY_COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)"),
        params![
            e.id,
            e.medium.as_str(),
            e.title,
            e.year,
            e.cover,
            e.status.map(Status::as_str),
            e.rating,
            to_json(&e.tags),
            e.owned,
            e.started,
            e.finished,
            e.progress,
            e.season,
            Json::Object(e.extra.clone()).to_string(),
        ],
    )?;
    Ok(())
}

fn update_entry(tx: &Transaction, e: &Entry) -> Result<()> {
    tx.execute(
        "UPDATE entries SET title = ?2, year = ?3, cover = ?4, status = ?5, rating = ?6,
             tags = ?7, owned = ?8, started = ?9, finished = ?10, progress = ?11,
             season = ?12, extra = ?13, updated_at = datetime('now')
         WHERE id = ?1",
        params![
            e.id,
            e.title,
            e.year,
            e.cover,
            e.status.map(Status::as_str),
            e.rating,
            to_json(&e.tags),
            e.owned,
            e.started,
            e.finished,
            e.progress,
            e.season,
            Json::Object(e.extra.clone()).to_string(),
        ],
    )?;
    Ok(())
}

fn insert_log(tx: &Transaction, entry_id: &str, log: &LogDraft) -> Result<()> {
    tx.execute(
        "INSERT INTO logs (entry_id, date, end, tags, body) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entry_id, log.date, log.end, to_json(&log.tags), log.body],
    )?;
    Ok(())
}

/// The (non-trashed) entry a log belongs to.
fn log_owner(tx: &Transaction, log_id: i64) -> Result<String> {
    tx.query_row(
        "SELECT l.entry_id FROM logs l JOIN entries e ON e.id = l.entry_id
         WHERE l.id = ?1 AND e.trashed_at IS NULL",
        [log_id],
        |r| r.get(0),
    )
    .optional()?
    .ok_or_else(|| anyhow!("that log entry no longer exists"))
}

fn touch(tx: &Transaction, id: &str) -> Result<()> {
    tx.execute(
        "UPDATE entries SET updated_at = datetime('now') WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

fn to_json(tags: &[String]) -> String {
    serde_json::to_string(tags).unwrap_or_else(|_| "[]".into())
}

// --- validation ----------------------------------------------------------------

/// Apply one patched field to an entry, checking its type.
fn apply_field(e: &mut Entry, key: &str, val: &Json) -> Result<()> {
    let null = val.is_null();
    let int = || -> Result<Option<i64>> {
        if null {
            return Ok(None);
        }
        val.as_i64()
            .map(Some)
            .ok_or_else(|| anyhow!("{key} must be a whole number"))
    };
    let text = || -> Result<Option<String>> {
        if null {
            return Ok(None);
        }
        val.as_str()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .map(Some)
            .ok_or_else(|| anyhow!("{key} must be text"))
    };
    let date = || -> Result<Option<String>> {
        let d = text()?;
        match &d {
            Some(s) if !is_date(s) => bail!("{key} must be a YYYY-MM-DD date, got {s:?}"),
            _ => Ok(d),
        }
    };
    match key {
        "title" => e.title = text()?.ok_or_else(|| anyhow!("a title is required"))?,
        "year" => e.year = int()?,
        "progress" => e.progress = int()?,
        "season" => e.season = int()?,
        "cover" => e.cover = text()?,
        "started" => e.started = date()?,
        "finished" => e.finished = date()?,
        "rating" => {
            e.rating = if null {
                None
            } else {
                Some(
                    val.as_f64()
                        .ok_or_else(|| anyhow!("rating must be a number"))?,
                )
            }
        }
        "status" => {
            e.status = match text()? {
                None => None,
                Some(s) => Some(s.parse().map_err(|_| anyhow!("unknown status {s:?}"))?),
            }
        }
        "owned" => {
            e.owned = if null {
                None
            } else {
                Some(
                    val.as_bool()
                        .ok_or_else(|| anyhow!("owned must be true or false"))?,
                )
            }
        }
        "tags" => {
            e.tags = if null {
                Vec::new()
            } else {
                let arr = val
                    .as_array()
                    .ok_or_else(|| anyhow!("tags must be a list"))?;
                clean_tags(arr.iter().filter_map(Json::as_str))
            }
        }
        "id" | "medium" | "slug" | "notes" | "logs" => bail!("{key} can't be changed"),
        _ => {
            if null {
                e.extra.remove(key);
            } else {
                e.extra.insert(key.to_string(), val.clone());
            }
        }
    }
    Ok(())
}

/// Check and normalise a log before it's stored: a real date, a span that
/// doesn't run backwards (and collapses when both ends match), clean tags.
fn clean_log(d: LogDraft) -> Result<LogDraft> {
    let date = d.date.trim().to_string();
    if !is_date(&date) {
        bail!("a log needs a YYYY-MM-DD date, got {date:?}");
    }
    let end = match d
        .end
        .map(|e| e.trim().to_string())
        .filter(|e| !e.is_empty())
    {
        None => None,
        Some(end) if !is_date(&end) => bail!("the end date must be YYYY-MM-DD, got {end:?}"),
        Some(end) if end < date => bail!("the end date {end} is before the start {date}"),
        Some(end) if end == date => None,
        Some(end) => Some(end),
    };
    Ok(LogDraft {
        date,
        end,
        tags: clean_tags(d.tags.iter().map(String::as_str)),
        body: d.body.trim_end().to_string(),
    })
}

/// One tag, normalised: no leading `#`, whitespace runs become `-`, and only
/// letters, digits, `_` and `-` survive. Mirrored by `normalizeTag` in
/// `src/lib/notes.ts`.
pub fn clean_tag(raw: &str) -> Option<String> {
    let joined = raw
        .trim()
        .trim_start_matches('#')
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-");
    let tag: String = joined
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .flat_map(char::to_lowercase)
        .collect();
    (!tag.is_empty()).then_some(tag)
}

fn clean_tags<'a>(raw: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in raw.filter_map(clean_tag) {
        if !out.contains(&t) {
            out.push(t);
        }
    }
    out
}

/// `YYYY-MM-DD` with a plausible month and day. ISO dates also compare
/// correctly as strings, which the span check relies on.
pub fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let digits = |r: std::ops::Range<usize>| b[r].iter().all(u8::is_ascii_digit);
    if !(digits(0..4) && digits(5..7) && digits(8..10)) {
        return false;
    }
    let month: u32 = s[5..7].parse().unwrap_or(0);
    let day: u32 = s[8..10].parse().unwrap_or(0);
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

// --- ids -----------------------------------------------------------------------

fn slug_of(id: &str) -> &str {
    id.split_once('/').map(|(_, s)| s).unwrap_or(id)
}

/// Turn a title into an id-safe slug: lowercase ASCII letters and digits,
/// everything else collapsed to single hyphens.
pub fn slugify(title: &str) -> String {
    let mut slug = String::with_capacity(title.len());
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug
    }
}

/// The first free id for a title: `medium/slug`, then `medium/slug-YEAR`,
/// then `medium/slug-2`, `-3`, … Trashed entries still hold their id.
fn unique_id(tx: &Transaction, medium: Medium, title: &str, year: Option<i64>) -> Result<String> {
    let base = format!("{}/{}", medium.as_str(), slugify(title));
    let taken = |id: &str| -> Result<bool> {
        Ok(tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM entries WHERE id = ?1)",
            [id],
            |r| r.get(0),
        )?)
    };
    if !taken(&base)? {
        return Ok(base);
    }
    if let Some(y) = year {
        let with_year = format!("{base}-{y}");
        if !taken(&with_year)? {
            return Ok(with_year);
        }
    }
    for n in 2.. {
        let id = format!("{base}-{n}");
        if !taken(&id)? {
            return Ok(id);
        }
    }
    unreachable!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basics() {
        assert_eq!(slugify("Blade Runner 2049"), "blade-runner-2049");
        assert_eq!(slugify("  Spirited Away!! "), "spirited-away");
        assert_eq!(slugify("N/A ::: ---"), "n-a");
        assert_eq!(slugify("日本語 title"), "title");
        assert_eq!(slugify(""), "untitled");
    }

    #[test]
    fn dates() {
        assert!(is_date("2026-03-01"));
        assert!(!is_date(""));
        assert!(!is_date("2026-3-01"));
        assert!(!is_date("2026-13-01"));
        assert!(!is_date("2026-03-00"));
        assert!(!is_date("２０２６-03-01"));
    }

    #[test]
    fn tags_are_normalised() {
        assert_eq!(clean_tag("#Rewatch").as_deref(), Some("rewatch"));
        assert_eq!(clean_tag("  my   tag ").as_deref(), Some("my-tag"));
        assert_eq!(clean_tag("ネタバレ").as_deref(), Some("ネタバレ"));
        assert_eq!(clean_tag("a,b!").as_deref(), Some("ab"));
        assert_eq!(clean_tag("#  "), None);
    }

    #[test]
    fn logs_are_validated() {
        let draft = |date: &str, end: Option<&str>| LogDraft {
            date: date.into(),
            end: end.map(Into::into),
            tags: vec!["Re watch".into(), "re-watch".into()],
            body: "  kept  \n".into(),
        };
        assert!(clean_log(draft("", None)).is_err());
        assert!(clean_log(draft("2026-03-10", Some("2026-03-01"))).is_err());
        let same = clean_log(draft("2026-03-01", Some("2026-03-01"))).unwrap();
        assert_eq!(same.end, None);
        assert_eq!(same.tags, vec!["re-watch"]);
        assert_eq!(same.body, "  kept");
    }
}
