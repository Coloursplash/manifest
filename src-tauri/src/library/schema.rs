//! The shared data model. An `Entry` is the structured view of one `.toml`
//! file that we hand to the frontend. Writes never go through this struct —
//! they mutate the on-disk `toml_edit` document directly so formatting,
//! key order, comments, and unknown keys survive (see `store.rs`).

use std::str::FromStr;

use serde::{Deserialize, Serialize};

/// The kinds of media manifest tracks. The canonical lowercase name
/// (`film`, `tv`, …) is used in entry ids and TOML; the plural `dir()` is the
/// on-disk folder under the library root.
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

    /// Canonical lowercase name, used in entry ids and as the TOML value.
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

    /// Folder name under the library root that holds this medium's entries.
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

/// Where an entry sits in the user's watch/read journey. Stored verbatim as
/// the `status` key; a missing/unknown value is represented as `None` rather
/// than being invented.
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

/// The structured, frontend-facing view of one entry file.
///
/// `extra` carries every top-level TOML key that isn't one of the well-known
/// shared fields — that's where per-medium fields (`director`, `author`, …)
/// and any keys the user added by hand live, so the UI can render them
/// generically and nothing gets silently dropped.
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

    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,

    /// All other top-level keys, preserved as JSON for display. Totals like
    /// `pages`/`episodes`/`volumes` live here (filled from metadata).
    #[serde(skip_serializing_if = "serde_json::Map::is_empty")]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// Top-level keys that map onto typed `Entry` fields; everything else falls
/// through to `extra`.
pub const KNOWN_KEYS: [&str; 12] = [
    "title", "year", "cover", "status", "rating", "tags", "owned", "started", "finished",
    "progress", "season", "notes",
];
