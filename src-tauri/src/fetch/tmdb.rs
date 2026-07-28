//! The Movie Database — films and TV. Requires a free API key (user-supplied;
//! never committed). Search stays lightweight: we don't spend a second request
//! per hit to fetch directors here — that can be filled in on commit or by
//! hand.

use anyhow::{anyhow, Result};

use super::{client, Candidate};

#[derive(Clone, Copy)]
pub enum Kind {
    Movie,
    Tv,
}

impl Kind {
    fn path(self) -> &'static str {
        match self {
            Kind::Movie => "movie",
            Kind::Tv => "tv",
        }
    }
    /// TMDB names the title/date fields differently for movies vs TV.
    fn title_key(self) -> &'static str {
        match self {
            Kind::Movie => "title",
            Kind::Tv => "name",
        }
    }
    fn date_key(self) -> &'static str {
        match self {
            Kind::Movie => "release_date",
            Kind::Tv => "first_air_date",
        }
    }
}

pub async fn search(query: &str, key: Option<&str>, kind: Kind) -> Result<Vec<Candidate>> {
    let key = key.ok_or_else(|| {
        anyhow!("TMDB API key not set — add one in settings to search films and TV")
    })?;

    let url = format!("https://api.themoviedb.org/3/search/{}", kind.path());
    let resp = client()
        .get(url)
        .query(&[
            ("api_key", key),
            ("query", query),
            ("include_adult", "false"),
        ])
        .send()
        .await?
        .error_for_status()?;
    let json: serde_json::Value = resp.json().await?;

    let results = json
        .get("results")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for r in results.iter().take(12) {
        let title = r
            .get(kind.title_key())
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if title.is_empty() {
            continue;
        }
        let year = r
            .get(kind.date_key())
            .and_then(|v| v.as_str())
            .and_then(|d| d.get(0..4))
            .and_then(|y| y.parse::<i64>().ok());
        let cover = r
            .get("poster_path")
            .and_then(|v| v.as_str())
            .filter(|p| !p.is_empty())
            .map(|p| format!("https://image.tmdb.org/t/p/w500{p}"));
        let summary = r
            .get("overview")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);

        out.push(Candidate {
            title,
            year,
            cover,
            subtitle: None,
            summary,
            fields: serde_json::Map::new(),
        });
    }
    Ok(out)
}
