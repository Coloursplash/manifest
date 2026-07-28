//! Metadata providers. Each medium maps to a public API; a search returns a
//! list of [`Candidate`]s the user picks from. Providers are best-effort:
//! network errors and empty results degrade to an empty list rather than
//! blocking the add-entry flow, and everything a provider returns is a
//! *suggestion* the user can override before it's written to disk.

pub mod anilist;
pub mod books;
pub mod musicbrainz;
pub mod rawg;
pub mod tmdb;

use std::sync::OnceLock;

use anyhow::Result;
use serde::Serialize;

use crate::library::Medium;

/// A search hit, shaped to prefill an entry. `cover` is a remote URL (cached
/// locally only once the user commits). `fields` carries per-medium metadata
/// (director, author, studio, …) ready to drop into an entry's TOML.
#[derive(Debug, Clone, Serialize)]
pub struct Candidate {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    /// Short one-line descriptor (director / author / studio) for the picker.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "serde_json::Map::is_empty")]
    pub fields: serde_json::Map<String, serde_json::Value>,
    /// Opaque provider handle for a follow-up detail fetch (see [`details`]).
    /// Set by providers whose search response is too thin to carry crew/genres
    /// (TMDB); `None` when search already returned everything (AniList, books).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<String>,
}

/// A shared reqwest client with a descriptive User-Agent and sane timeouts.
pub fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent(concat!(
                "manifest/",
                env!("CARGO_PKG_VERSION"),
                " (+https://github.com/chris/manifest)"
            ))
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .expect("building HTTP client")
    })
}

/// Dispatch a search to the right provider(s) for the medium. `tmdb_key` is
/// required for film/TV and `rawg_key` for games; both are ignored for the
/// keyless providers (anime, manga, books, music).
pub async fn search(
    medium: Medium,
    query: &str,
    tmdb_key: Option<&str>,
    rawg_key: Option<&str>,
) -> Result<Vec<Candidate>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    match medium {
        Medium::Film => tmdb::search(query, tmdb_key, tmdb::Kind::Movie).await,
        Medium::Tv => tmdb::search(query, tmdb_key, tmdb::Kind::Tv).await,
        Medium::Anime => anilist::search(query, anilist::Kind::Anime).await,
        Medium::Manga => anilist::search(query, anilist::Kind::Manga).await,
        Medium::Book => books::search(query).await,
        Medium::Game => rawg::search(query, rawg_key).await,
        Medium::Music => musicbrainz::search(query).await,
    }
}

/// Fetch the extra fields (crew, cast, genres, runtime) that a provider's
/// search response omitted, keyed by a [`Candidate::reference`]. Called once,
/// when the user commits an entry — never per search hit. Providers that
/// already return everything have no reference, so this is a no-op for them.
pub async fn details(
    medium: Medium,
    reference: &str,
    tmdb_key: Option<&str>,
    rawg_key: Option<&str>,
) -> Result<serde_json::Map<String, serde_json::Value>> {
    match medium {
        Medium::Film | Medium::Tv => {
            let (kind, id) = reference
                .split_once(':')
                .ok_or_else(|| anyhow::anyhow!("malformed reference: {reference}"))?;
            let kind = match kind {
                "movie" => tmdb::Kind::Movie,
                "tv" => tmdb::Kind::Tv,
                other => anyhow::bail!("unknown tmdb kind: {other}"),
            };
            let key = tmdb_key.ok_or_else(|| anyhow::anyhow!("TMDB API key not set"))?;
            tmdb::details(key, kind, id).await
        }
        Medium::Book => books::details(reference).await,
        Medium::Game => {
            let key = rawg_key.ok_or_else(|| anyhow::anyhow!("RAWG API key not set"))?;
            rawg::details(key, reference).await
        }
        Medium::Anime | Medium::Manga | Medium::Music => Ok(serde_json::Map::new()),
    }
}
