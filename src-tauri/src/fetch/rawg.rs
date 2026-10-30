//! RAWG.io — videogames. Requires a free API key (user-supplied; never
//! committed). The list endpoint carries title/year/cover/genres/platforms;
//! developer, publisher and description need a per-title detail call, so search
//! hits carry the game id as their `reference` for a follow-up on commit.

use anyhow::{anyhow, Result};
use serde_json::{Map, Value};

use super::{client, Candidate};

pub async fn search(query: &str, key: Option<&str>) -> Result<Vec<Candidate>> {
    let key = key.ok_or_else(|| {
        anyhow!("RAWG API key not set — add one in settings to search videogames")
    })?;

    let resp = client()
        .get("https://api.rawg.io/api/games")
        .query(&[("key", key), ("search", query), ("page_size", "12")])
        .send()
        .await?
        .error_for_status()?;
    let json: Value = resp.json().await?;

    let results = json
        .get("results")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for r in &results {
        let title = r
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if title.is_empty() {
            continue;
        }
        let year = r
            .get("released")
            .and_then(|v| v.as_str())
            .and_then(|d| d.get(0..4))
            .and_then(|y| y.parse::<i64>().ok());
        let cover = r
            .get("background_image")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_string);

        let mut fields = Map::new();
        if let Some(platforms) = names(r.pointer("/platforms"), "/platform/name") {
            fields.insert("platforms".into(), platforms);
        }
        if let Some(genres) = names(r.get("genres"), "/name") {
            fields.insert("genres".into(), genres);
        }
        if let Some(mc) = r.get("metacritic").and_then(|v| v.as_i64()) {
            fields.insert("metacritic".into(), mc.into());
        }
        // The platform list doubles as the picker subtitle.
        let subtitle = fields
            .get("platforms")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|p| p.as_str())
                    .take(3)
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .filter(|s| !s.is_empty());

        // Developer / publisher / description come from the detail call.
        let reference = r
            .get("id")
            .and_then(|v| v.as_i64())
            .map(|id| id.to_string());

        out.push(Candidate {
            title,
            year,
            cover,
            subtitle,
            summary: None,
            fields,
            reference,
        });
    }
    Ok(out)
}

/// Fetch developer, publisher and description for one game.
pub async fn details(key: &str, id: &str) -> Result<Map<String, Value>> {
    let url = format!("https://api.rawg.io/api/games/{id}");
    let resp = client()
        .get(url)
        .query(&[("key", key)])
        .send()
        .await?
        .error_for_status()?;
    let json: Value = resp.json().await?;

    let mut fields = Map::new();

    if let Some(dev) = names(json.get("developers"), "/name") {
        // A single string reads better in the detail table than a one-item list.
        fields.insert("developer".into(), join(&dev));
    }
    if let Some(pubs) = names(json.get("publishers"), "/name") {
        fields.insert("publisher".into(), join(&pubs));
    }
    if let Some(genres) = names(json.get("genres"), "/name") {
        fields.insert("genres".into(), genres);
    }
    if let Some(platforms) = names(json.pointer("/platforms"), "/platform/name") {
        fields.insert("platforms".into(), platforms);
    }
    if let Some(mc) = json.get("metacritic").and_then(|v| v.as_i64()) {
        fields.insert("metacritic".into(), mc.into());
    }
    // RAWG serves a plain-text synopsis alongside the HTML one.
    if let Some(desc) = json
        .get("description_raw")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        fields.insert("summary".into(), desc.into());
    }

    Ok(fields)
}

/// Pull a string array out of a list of objects, reading `pointer` on each
/// element (e.g. `/name`, or `/platform/name` for a nested field). Returns
/// `None` when nothing usable is found.
fn names(list: Option<&Value>, pointer: &str) -> Option<Value> {
    let arr = list?.as_array()?;
    let picked: Vec<Value> = arr
        .iter()
        .filter_map(|e| e.pointer(pointer).and_then(|v| v.as_str()))
        .map(|s| Value::from(s.to_string()))
        .collect();
    (!picked.is_empty()).then_some(Value::Array(picked))
}

/// Comma-join a string `Value::Array` into a single `Value::String`.
fn join(arr: &Value) -> Value {
    let joined = arr
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    Value::from(joined)
}
