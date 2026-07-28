//! MusicBrainz — albums (release-groups). No API key; MusicBrainz asks only for
//! a descriptive User-Agent (set on the shared `client`) and light rate limits,
//! which the on-demand search flow respects. Covers come from the Cover Art
//! Archive, keyed by the release-group id; a missing cover 404s and degrades
//! gracefully rather than blocking the add.

use anyhow::Result;
use serde_json::{Map, Value};

use super::{client, Candidate};

pub async fn search(query: &str) -> Result<Vec<Candidate>> {
    let resp = client()
        .get("https://musicbrainz.org/ws/2/release-group")
        .query(&[("query", query), ("fmt", "json"), ("limit", "12")])
        .send()
        .await?
        .error_for_status()?;
    let json: Value = resp.json().await?;

    let groups = json
        .get("release-groups")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for g in &groups {
        let title = g.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if title.is_empty() {
            continue;
        }
        let year = g
            .get("first-release-date")
            .and_then(|v| v.as_str())
            .and_then(|d| d.get(0..4))
            .and_then(|y| y.parse::<i64>().ok());
        let artist = artist_credit(g);
        let cover = g
            .get("id")
            .and_then(|v| v.as_str())
            .map(|id| format!("https://coverartarchive.org/release-group/{id}/front-500"));

        let mut fields = Map::new();
        if let Some(a) = &artist {
            fields.insert("artist".into(), a.clone().into());
        }
        // "Album" / "EP" / "Single" — a useful tag on the entry.
        if let Some(kind) = g.get("primary-type").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            fields.insert("type".into(), kind.into());
        }

        out.push(Candidate {
            title,
            year,
            cover,
            subtitle: artist,
            summary: None,
            fields,
            reference: None,
        });
    }
    Ok(out)
}

/// Join a release-group's `artist-credit` entries (name + joinphrase) into a
/// single display string, e.g. "Radiohead" or "Jay-Z & Kanye West".
fn artist_credit(group: &Value) -> Option<String> {
    let credits = group.get("artist-credit")?.as_array()?;
    let mut s = String::new();
    for c in credits {
        if let Some(name) = c.get("name").and_then(|v| v.as_str()) {
            s.push_str(name);
        }
        if let Some(join) = c.get("joinphrase").and_then(|v| v.as_str()) {
            s.push_str(join);
        }
    }
    let s = s.trim().to_string();
    (!s.is_empty()).then_some(s)
}
