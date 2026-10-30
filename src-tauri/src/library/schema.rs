//! The shared data model handed to the frontend. An `Entry` is one row of the
//! `entries` table plus its `logs` rows (see `db.rs`).

use std::str::FromStr;

use serde::{Deserialize, Serialize};

/// The kinds of media manifest tracks. The canonical lowercase name
/// (`film`, `tv`, …) is used in entry ids; the plural `dir()` is the folder the
/// old `.toml` library kept them in (read once, by `import.rs`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Medium {
    Film,
    Tv,
    Anime,
    Book,
    Manga,
    Game,
    Music,
}

impl Medium {
    pub const ALL: [Medium; 7] = [
        Medium::Film,
        Medium::Tv,
        Medium::Anime,
        Medium::Book,
        Medium::Manga,
        Medium::Game,
        Medium::Music,
    ];

    /// Canonical lowercase name, used in entry ids and the `medium` column.
    pub fn as_str(self) -> &'static str {
        match self {
            Medium::Film => "film",
            Medium::Tv => "tv",
            Medium::Anime => "anime",
            Medium::Book => "book",
            Medium::Manga => "manga",
            Medium::Game => "game",
            Medium::Music => "music",
        }
    }

    /// Folder the legacy `.toml` library kept this medium's entries in.
    pub fn dir(self) -> &'static str {
        match self {
            Medium::Film => "films",
            Medium::Tv => "tv",
            Medium::Anime => "anime",
            Medium::Book => "books",
            Medium::Manga => "manga",
            Medium::Game => "games",
            Medium::Music => "music",
        }
    }
}

impl FromStr for Medium {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "film" | "films" | "movie" => Ok(Medium::Film),
            "tv" | "show" | "series" => Ok(Medium::Tv),
            "anime" => Ok(Medium::Anime),
            "book" | "books" => Ok(Medium::Book),
            "manga" => Ok(Medium::Manga),
            "game" | "games" | "videogame" | "video-game" => Ok(Medium::Game),
            "music" | "album" | "albums" => Ok(Medium::Music),
            _ => Err(()),
        }
    }
}

/// Where an entry sits in the user's watch/read journey. A missing value is
/// `None` rather than being invented.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Want,
    Active,
    Done,
    Dropped,
    Paused,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Want => "want",
            Status::Active => "active",
            Status::Done => "done",
            Status::Dropped => "dropped",
            Status::Paused => "paused",
        }
    }
}

impl FromStr for Status {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim().to_ascii_lowercase().as_str() {
            "want" => Ok(Status::Want),
            "active" => Ok(Status::Active),
            "done" => Ok(Status::Done),
            "dropped" => Ok(Status::Dropped),
            "paused" => Ok(Status::Paused),
            _ => Err(()),
        }
    }
}

/// The frontend-facing view of one entry.
///
/// `extra` carries every field that isn't one of the typed shared ones — the
/// per-medium metadata (`director`, `author`, `episodes`, …) — so the UI can
/// render it generically.
#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    /// Stable id: `"{medium}/{slug}"`, e.g. `"film/blade-runner-2049"`.
    pub id: String,
    pub medium: Medium,
    pub slug: String,
    pub title: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<f64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// Do you own a copy? Only meaningful for media you buy (games, books) —
    /// the UI uses it to split "backlog" (owned, unplayed) from "wishlist"
    /// (want it, don't have it). Absent means not owned.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owned: Option<bool>,

    // --- progress: interpreted per medium by the UI ---
    /// Date started (reading/watching): `YYYY-MM-DD`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started: Option<String>,
    /// Date finished: `YYYY-MM-DD`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished: Option<String>,
    /// How far in: page (books/manga), episode (tv/anime).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<i64>,
    /// Current season (tv/anime).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub season: Option<i64>,

    /// The dated log, oldest first. Each row has a stable `id`, so editing or
    /// deleting one can never land on its neighbour.
    pub logs: Vec<LogEntry>,

    /// Per-medium metadata as JSON. Totals like `pages`/`episodes`/`volumes`
    /// live here (filled from metadata).
    #[serde(skip_serializing_if = "serde_json::Map::is_empty")]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// One dated block in an entry's log: a single day, or a span (`end`) for the
/// media you get through over days or weeks rather than in one sitting.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LogEntry {
    pub id: i64,
    /// `YYYY-MM-DD` — the day, or the first day of a span.
    pub date: String,
    /// Last day of a span. Absent for a single day; never equal to `date`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<String>,
    pub tags: Vec<String>,
    pub body: String,
}
