//! AniList — anime and manga. GraphQL, no API key required.

use anyhow::Result;
use serde_json::json;

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
      coverImage { large }
      description(asHtml: false)
      episodes
      chapters
      volumes
      studios(isMain: true) { nodes { name } }
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
    let json: serde_json::Value = resp.json().await?;

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

        let mut fields = serde_json::Map::new();
        let studio = m
            .pointer("/studios/nodes/0/name")
            .and_then(|v| v.as_str())
            .map(str::to_string);

        let subtitle = match kind {
            Kind::Anime => {
                if let Some(s) = &studio {
                    fields.insert("studio".into(), s.clone().into());
                }
                if let Some(eps) = m.get("episodes").and_then(|v| v.as_i64()) {
                    fields.insert("episodes".into(), eps.into());
                }
                studio
            }
            Kind::Manga => {
                if let Some(vols) = m.get("volumes").and_then(|v| v.as_i64()) {
                    fields.insert("volumes".into(), vols.into());
                }
                if let Some(chs) = m.get("chapters").and_then(|v| v.as_i64()) {
                    fields.insert("chapters".into(), chs.into());
                }
                None
            }
        };

        out.push(Candidate {
            title,
            year,
            cover,
            subtitle,
            summary,
            fields,
        });
    }
    Ok(out)
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
