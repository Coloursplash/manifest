//! The Movie Database — films and TV. Requires a free API key (user-supplied;
//! never committed). Search stays lightweight: we don't spend a second request
//! per hit to fetch directors here — that can be filled in on commit or by
//! hand.

use anyhow::{anyhow, Result};
use serde_json::{Map, Value};

use super::{client, Candidate};

#[derive(Clone, Copy)]
pub enum Kind {
    Movie,
    Tv,
}

impl Kind {
    pub fn path(self) -> &'static str {
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
        // Crew/genres need a per-title detail call; carry the id so we can make
        // it once, on commit, via `details`.
        let reference = r
            .get("id")
            .and_then(|v| v.as_i64())
            .map(|id| format!("{}:{}", kind.path(), id));

        out.push(Candidate {
            title,
            year,
            cover,
            subtitle: None,
            summary,
            fields: serde_json::Map::new(),
            reference,
        });
    }
    Ok(out)
}

/// Fetch crew, cast, genres, and runtime for one title. Uses
/// `append_to_response=credits` to keep it to a single request.
pub async fn details(key: &str, kind: Kind, id: &str) -> Result<Map<String, Value>> {
    let url = format!("https://api.themoviedb.org/3/{}/{}", kind.path(), id);
    let resp = client()
        .get(url)
        .query(&[("api_key", key), ("append_to_response", "credits")])
        .send()
        .await?
        .error_for_status()?;
    let json: Value = resp.json().await?;

    let mut fields = Map::new();

    // Genres → a plain string array (rendered as chips in the UI).
    let genres: Vec<Value> = json
        .get("genres")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|g| g.get("name").and_then(|n| n.as_str()))
                .map(|s| Value::from(s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if !genres.is_empty() {
        fields.insert("genres".into(), Value::Array(genres));
    }

    let crew = json.pointer("/credits/crew").and_then(|v| v.as_array());
    let cast: Vec<Value> = json
        .pointer("/credits/cast")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|c| c.get("name").and_then(|n| n.as_str()))
                .take(6)
                .map(|s| Value::from(s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    if !cast.is_empty() {
        fields.insert("cast".into(), Value::Array(cast));
    }

    match kind {
        Kind::Movie => {
            if let Some(dir) = crew_job(crew, "Director") {
                fields.insert("director".into(), dir.into());
            }
            if let Some(writer) = crew_job(crew, "Screenplay").or_else(|| crew_job(crew, "Writer")) {
                fields.insert("writer".into(), writer.into());
            }
            if let Some(rt) = json.get("runtime").and_then(|v| v.as_i64()).filter(|r| *r > 0) {
                fields.insert("runtime".into(), rt.into());
            }
        }
        Kind::Tv => {
            if let Some(creator) = json
                .pointer("/created_by/0/name")
                .and_then(|v| v.as_str())
            {
                fields.insert("creator".into(), creator.into());
            }
            if let Some(eps) = json.get("number_of_episodes").and_then(|v| v.as_i64()) {
                fields.insert("episodes".into(), eps.into());
            }
            if let Some(seasons) = json.get("number_of_seasons").and_then(|v| v.as_i64()) {
                fields.insert("seasons".into(), seasons.into());
            }
            if let Some(rt) = json
                .pointer("/episode_run_time/0")
                .and_then(|v| v.as_i64())
                .filter(|r| *r > 0)
            {
                fields.insert("episode_duration".into(), rt.into());
            }
        }
    }

    Ok(fields)
}

/// The first crew member with an exact `job` match.
fn crew_job(crew: Option<&Vec<Value>>, job: &str) -> Option<String> {
    crew?.iter().find_map(|c| {
        (c.get("job").and_then(|v| v.as_str()) == Some(job))
            .then(|| c.get("name").and_then(|v| v.as_str()).map(str::to_string))
            .flatten()
    })
}
