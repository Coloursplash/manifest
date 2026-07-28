//! AniList — anime and manga. GraphQL, no API key required.
//!
//! One query returns everything we show, so unlike TMDB there's no second
//! detail round-trip: staff, studios, genres, format, and score all come back
//! in the search response and get stored on commit.

use anyhow::Result;
use serde_json::{json, Map, Value};

use super::{client, Candidate};

#[derive(Clone, Copy)]
pub enum Kind {
    Anime,
    Manga,
}

impl Kind {
    fn media_type(self) -> &'static str {
        match self {
            Kind::Anime => "ANIME",
            Kind::Manga => "MANGA",
        }
    }
}

const QUERY: &str = r#"
query ($search: String, $type: MediaType) {
  Page(perPage: 12) {
    media(search: $search, type: $type, sort: SEARCH_MATCH) {
      title { english romaji }
      startDate { year }
      season
      seasonYear
      format
      status
      episodes
      chapters
      volumes
      duration
      genres
      averageScore
      source
      coverImage { large }
      description(asHtml: false)
      studios(isMain: true) { nodes { name } }
      staff(perPage: 8, sort: RELEVANCE) {
        edges { role node { name { full } } }
      }
    }
  }
}
"#;

pub async fn search(query: &str, kind: Kind) -> Result<Vec<Candidate>> {
    let body = json!({
        "query": QUERY,
        "variables": { "search": query, "type": kind.media_type() }
    });

    let resp = client()
        .post("https://graphql.anilist.co")
        .json(&body)
        .send()
        .await?
        .error_for_status()?;
    let json: Value = resp.json().await?;

    let media = json
        .pointer("/data/Page/media")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for m in &media {
        let title = m
            .pointer("/title/english")
            .and_then(|v| v.as_str())
            .or_else(|| m.pointer("/title/romaji").and_then(|v| v.as_str()))
            .unwrap_or("")
            .to_string();
        if title.is_empty() {
            continue;
        }

        let year = m.pointer("/startDate/year").and_then(|v| v.as_i64());
        let cover = m
            .pointer("/coverImage/large")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let summary = m
            .get("description")
            .and_then(|v| v.as_str())
            .map(strip_html)
            .filter(|s| !s.is_empty());

        let studio = m
            .pointer("/studios/nodes/0/name")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let format = m
            .get("format")
            .and_then(|v| v.as_str())
            .map(pretty_format);

        let mut fields = Map::new();
        // Genres, source, and score are shared across anime and manga.
        let genres = m
            .get("genres")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|g| g.as_str())
                    .take(6)
                    .map(|s| Value::from(s.to_string()))
                    .collect::<Vec<_>>()
            })
            .filter(|g| !g.is_empty());
        if let Some(g) = genres {
            fields.insert("genres".into(), Value::Array(g));
        }
        if let Some(src) = m.get("source").and_then(|v| v.as_str()) {
            fields.insert("source".into(), pretty_source(src).into());
        }
        if let Some(score) = m.get("averageScore").and_then(|v| v.as_i64()) {
            fields.insert("community_score".into(), score.into());
        }
        if let Some(f) = &format {
            fields.insert("format".into(), f.clone().into());
        }

        let subtitle = match kind {
            Kind::Anime => {
                if let Some(s) = &studio {
                    fields.insert("studio".into(), s.clone().into());
                }
                if let Some(dir) = staff_role(m, |r| r.contains("director")) {
                    fields.insert("director".into(), dir.into());
                }
                if let Some(eps) = m.get("episodes").and_then(|v| v.as_i64()) {
                    fields.insert("episodes".into(), eps.into());
                }
                if let Some(dur) = m.get("duration").and_then(|v| v.as_i64()) {
                    fields.insert("episode_duration".into(), dur.into());
                }
                if let Some(season) = season_label(m) {
                    fields.insert("season_premiere".into(), season.into());
                }
                // A descriptor that separates a show from its sequels/spin-offs
                // at a glance: "TV · 2013 · Wit Studio".
                descriptor(&[
                    format.clone(),
                    m.get("seasonYear").and_then(|v| v.as_i64()).or(year).map(|y| y.to_string()),
                    studio,
                ])
            }
            Kind::Manga => {
                if let Some(author) = staff_role(m, |r| {
                    r.contains("story") || r.contains("original creator")
                }) {
                    fields.insert("author".into(), author.into());
                }
                if let Some(artist) = staff_role(m, |r| r == "art") {
                    fields.insert("artist".into(), artist.into());
                }
                if let Some(vols) = m.get("volumes").and_then(|v| v.as_i64()) {
                    fields.insert("volumes".into(), vols.into());
                }
                if let Some(chs) = m.get("chapters").and_then(|v| v.as_i64()) {
                    fields.insert("chapters".into(), chs.into());
                }
                descriptor(&[format.clone(), year.map(|y| y.to_string())])
            }
        };

        out.push(Candidate {
            title,
            year,
            cover,
            subtitle,
            summary,
            fields,
            reference: None,
        });
    }
    Ok(out)
}

/// The full name of the first staff member whose role matches `pred` (role is
/// lower-cased before the test), e.g. the director or the manga's writer.
fn staff_role(m: &Value, pred: impl Fn(&str) -> bool) -> Option<String> {
    let edges = m.pointer("/staff/edges").and_then(|v| v.as_array())?;
    edges.iter().find_map(|e| {
        let role = e.get("role").and_then(|v| v.as_str())?.to_ascii_lowercase();
        if pred(&role) {
            e.pointer("/node/name/full")
                .and_then(|v| v.as_str())
                .map(str::to_string)
        } else {
            None
        }
    })
}

/// "Fall 2013" from AniList's `season` + `seasonYear`.
fn season_label(m: &Value) -> Option<String> {
    let season = m.get("season").and_then(|v| v.as_str())?;
    let year = m.get("seasonYear").and_then(|v| v.as_i64())?;
    Some(format!("{} {}", pretty_season(season), year))
}

/// Join the present pieces with " · " for a search-card subtitle.
fn descriptor(parts: &[Option<String>]) -> Option<String> {
    let joined = parts
        .iter()
        .flatten()
        .cloned()
        .collect::<Vec<_>>()
        .join(" · ");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

fn pretty_format(f: &str) -> String {
    match f {
        "TV" => "TV",
        "TV_SHORT" => "TV Short",
        "MOVIE" => "Movie",
        "SPECIAL" => "Special",
        "OVA" => "OVA",
        "ONA" => "ONA",
        "MUSIC" => "Music",
        "MANGA" => "Manga",
        "NOVEL" => "Light Novel",
        "ONE_SHOT" => "One-shot",
        other => other,
    }
    .to_string()
}

fn pretty_source(s: &str) -> String {
    match s {
        "ORIGINAL" => "Original",
        "MANGA" => "Manga",
        "LIGHT_NOVEL" => "Light novel",
        "VISUAL_NOVEL" => "Visual novel",
        "VIDEO_GAME" => "Video game",
        "NOVEL" => "Novel",
        "DOUJINSHI" => "Doujinshi",
        "ANIME" => "Anime",
        "WEB_NOVEL" => "Web novel",
        "LIVE_ACTION" => "Live action",
        "GAME" => "Game",
        "COMIC" => "Comic",
        "MULTIMEDIA_PROJECT" => "Multimedia project",
        "PICTURE_BOOK" => "Picture book",
        other => other,
    }
    .to_string()
}

fn pretty_season(s: &str) -> &str {
    match s {
        "WINTER" => "Winter",
        "SPRING" => "Spring",
        "SUMMER" => "Summer",
        "FALL" => "Fall",
        other => other,
    }
}

/// AniList descriptions embed a little HTML (`<br>`, `<i>`, …) even with
/// `asHtml: false`; drop tags and collapse whitespace for a plain summary.
fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
