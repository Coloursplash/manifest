//! Books — Open Library first (no key), Google Books as fallback.

use anyhow::Result;

use super::{client, Candidate};

pub async fn search(query: &str) -> Result<Vec<Candidate>> {
    let mut hits = open_library(query).await.unwrap_or_default();
    if hits.is_empty() {
        hits = google_books(query).await.unwrap_or_default();
    }
    Ok(hits)
}

async fn open_library(query: &str) -> Result<Vec<Candidate>> {
    let resp = client()
        .get("https://openlibrary.org/search.json")
        // Bias toward English editions so the default `cover_i` isn't a random
        // translation's cover.
        .query(&[("q", query), ("language", "eng"), ("limit", "12")])
        .send()
        .await?
        .error_for_status()?;
    let json: serde_json::Value = resp.json().await?;

    let docs = json
        .get("docs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for d in &docs {
        let title = d.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if title.is_empty() {
            continue;
        }
        let year = d.get("first_publish_year").and_then(|v| v.as_i64());
        let author = d
            .pointer("/author_name/0")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        let cover = d
            .get("cover_i")
            .and_then(|v| v.as_i64())
            .map(|id| format!("https://covers.openlibrary.org/b/id/{id}-L.jpg"));

        let mut fields = serde_json::Map::new();
        if let Some(a) = &author {
            fields.insert("author".into(), a.clone().into());
        }
        if let Some(pages) = d.get("number_of_pages_median").and_then(|v| v.as_i64()) {
            fields.insert("pages".into(), pages.into());
        }

        out.push(Candidate {
            title,
            year,
            cover,
            subtitle: author,
            summary: None,
            fields,
        });
    }
    Ok(out)
}

async fn google_books(query: &str) -> Result<Vec<Candidate>> {
    let resp = client()
        .get("https://www.googleapis.com/books/v1/volumes")
        .query(&[("q", query), ("maxResults", "12")])
        .send()
        .await?
        .error_for_status()?;
    let json: serde_json::Value = resp.json().await?;

    let items = json
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for item in &items {
        let info = match item.get("volumeInfo") {
            Some(v) => v,
            None => continue,
        };
        let title = info.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if title.is_empty() {
            continue;
        }
        let year = info
            .get("publishedDate")
            .and_then(|v| v.as_str())
            .and_then(|d| d.get(0..4))
            .and_then(|y| y.parse::<i64>().ok());
        let author = info
            .pointer("/authors/0")
            .and_then(|v| v.as_str())
            .map(str::to_string);
        // Google serves http thumbnails; prefer https for the webview.
        let cover = info
            .pointer("/imageLinks/thumbnail")
            .and_then(|v| v.as_str())
            .map(|u| u.replacen("http://", "https://", 1));
        let summary = info
            .get("description")
            .and_then(|v| v.as_str())
            .map(str::to_string);

        let mut fields = serde_json::Map::new();
        if let Some(a) = &author {
            fields.insert("author".into(), a.clone().into());
        }
        if let Some(pages) = info.get("pageCount").and_then(|v| v.as_i64()) {
            fields.insert("pages".into(), pages.into());
        }

        out.push(Candidate {
            title,
            year,
            cover,
            subtitle: author,
            summary,
            fields,
        });
    }
    Ok(out)
}
