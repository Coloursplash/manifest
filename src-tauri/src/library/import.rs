//! One-time import of the legacy library: one `.toml` file per entry under
//! `<root>/<medium dir>/`, with the log kept as dated text blocks in `notes`.
//!
//! Runs when a folder is opened for the first time without a `library.sqlite`.
//! The `.toml` files are only read, never changed or deleted.

use std::path::Path;

use toml_edit::{DocumentMut, Item, Value};

use super::db::{is_date, slugify, LogDraft};
use super::schema::{Entry, Medium, Status};

/// Keys with their own `Entry` field; anything else goes to `extra`.
const TYPED_KEYS: [&str; 12] = [
    "title", "year", "cover", "status", "rating", "tags", "owned", "started", "finished",
    "progress", "season", "notes",
];

/// Where undated text from `notes` (anything before the first dated block)
/// is kept, so the import never drops what the user wrote.
pub const UNDATED_NOTES_KEY: &str = "undated_notes";

/// Every readable legacy entry, with its logs. A file that fails to parse is
/// skipped (and logged) so one bad file can't block the import.
pub fn read_legacy(root: &Path) -> Vec<(Entry, Vec<LogDraft>)> {
    let mut out = Vec::new();
    for medium in Medium::ALL {
        let Ok(dir) = std::fs::read_dir(root.join(medium.dir())) else {
            continue;
        };
        let mut paths: Vec<_> = dir
            .flatten()
            .map(|d| d.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("toml"))
            .collect();
        paths.sort();
        for path in paths {
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let parsed = std::fs::read_to_string(&path)
                .map_err(anyhow::Error::from)
                .and_then(|text| Ok(text.parse::<DocumentMut>()?));
            match parsed {
                Ok(doc) => out.push(entry_from_doc(medium, &slugify(stem), &doc)),
                Err(err) => log::warn!("not importing {}: {err:#}", path.display()),
            }
        }
    }
    out
}

fn entry_from_doc(medium: Medium, slug: &str, doc: &DocumentMut) -> (Entry, Vec<LogDraft>) {
    let get_str = |k: &str| {
        doc.get(k)
            .and_then(|i| i.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let get_int = |k: &str| doc.get(k).and_then(|i| i.as_integer());
    let get_date = |k: &str| get_str(k).filter(|d| is_date(d));

    let mut extra = serde_json::Map::new();
    for (key, item) in doc.as_table().iter() {
        if !TYPED_KEYS.contains(&key) {
            extra.insert(key.to_string(), item_to_json(item));
        }
    }

    let (logs, undated) = parse_notes(&get_str("notes").unwrap_or_default());
    if !undated.is_empty() {
        extra.insert(UNDATED_NOTES_KEY.into(), undated.into());
    }

    let entry = Entry {
        id: format!("{}/{}", medium.as_str(), slug),
        medium,
        slug: slug.to_string(),
        title: get_str("title").unwrap_or_else(|| slug.to_string()),
        year: get_int("year"),
        cover: get_str("cover"),
        status: get_str("status").and_then(|s| s.parse::<Status>().ok()),
        rating: doc
            .get("rating")
            .and_then(|i| i.as_float().or_else(|| i.as_integer().map(|n| n as f64))),
        tags: doc
            .get("tags")
            .and_then(|i| i.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        // Typed on purpose: a hand-written `owned = "yes"` isn't a boolean.
        owned: doc.get("owned").and_then(|i| i.as_bool()),
        started: get_date("started"),
        finished: get_date("finished"),
        progress: get_int("progress"),
        season: get_int("season"),
        logs: Vec::new(),
        extra,
    };
    (entry, logs)
}

/// Split the legacy `notes` text into dated logs.
///
/// A block starts at a line beginning with a `YYYY-MM-DD` date that is the
/// first line or follows a blank line. Blank lines *inside* a block (a review
/// in paragraphs) stay part of its body. Text before the first dated block is
/// returned separately as the undated remainder.
pub fn parse_notes(notes: &str) -> (Vec<LogDraft>, String) {
    let mut logs: Vec<LogDraft> = Vec::new();
    let mut undated: Vec<&str> = Vec::new();
    let mut body: Vec<&str> = Vec::new();
    let mut prev_blank = true;

    let finish = |logs: &mut Vec<LogDraft>, body: &mut Vec<&str>| {
        // The header's leftover text (e.g. "(IMAX)") leads the body.
        if let Some(log) = logs.last_mut() {
            let text = format!("{}\n{}", log.body, body.join("\n"));
            log.body = text.trim().to_string();
        }
        body.clear();
    };

    for line in notes.lines() {
        let blank = line.trim().is_empty();
        let header = (!blank && prev_blank)
            .then(|| parse_header(line.trim()))
            .flatten();
        if let Some(log) = header {
            finish(&mut logs, &mut body);
            logs.push(log);
        } else if logs.is_empty() {
            undated.push(line);
        } else {
            body.push(line);
        }
        prev_blank = blank;
    }
    finish(&mut logs, &mut body);
    (logs, undated.join("\n").trim().to_string())
}

/// `2026-03-01`, `2026-03-01..2026-03-19 #rewatch (IMAX)`, … Anything on the
/// header that isn't a date or a `#tag` (e.g. "(IMAX)") opens the body, so
/// it's kept.
fn parse_header(line: &str) -> Option<LogDraft> {
    let date = line.get(..10).filter(|d| is_date(d))?.to_string();
    let mut rest = &line[10..];

    let mut end = None;
    let trimmed = rest.trim_start();
    for sep in ["..", "→", "–", "—", "-", "to"] {
        if let Some(after) = trimmed.strip_prefix(sep) {
            let after = after.trim_start();
            if let Some(d) = after.get(..10).filter(|d| is_date(d)) {
                end = (d != date).then(|| d.to_string());
                rest = &after[10..];
                break;
            }
        }
    }

    let mut tags = Vec::new();
    let mut words = Vec::new();
    for word in rest.split_whitespace() {
        match word.strip_prefix('#') {
            Some(tag) if !tag.is_empty() => tags.push(tag.to_string()),
            _ => words.push(word),
        }
    }
    Some(LogDraft {
        date,
        end,
        tags,
        body: words.join(" "),
    })
}

// --- TOML → JSON, for the `extra` bag ---

fn item_to_json(item: &Item) -> serde_json::Value {
    use serde_json::Value as J;
    match item {
        Item::Value(v) => value_to_json(v),
        Item::Table(t) => J::Object(
            t.iter()
                .map(|(k, v)| (k.to_string(), item_to_json(v)))
                .collect(),
        ),
        Item::ArrayOfTables(a) => J::Array(
            a.iter()
                .map(|t| {
                    J::Object(
                        t.iter()
                            .map(|(k, v)| (k.to_string(), item_to_json(v)))
                            .collect(),
                    )
                })
                .collect(),
        ),
        Item::None => J::Null,
    }
}

fn value_to_json(v: &Value) -> serde_json::Value {
    use serde_json::Value as J;
    match v {
        Value::String(f) => J::String(f.value().clone()),
        Value::Integer(f) => J::Number((*f.value()).into()),
        Value::Float(f) => serde_json::Number::from_f64(*f.value())
            .map(J::Number)
            .unwrap_or(J::Null),
        Value::Boolean(f) => J::Bool(*f.value()),
        Value::Datetime(f) => J::String(f.value().to_string()),
        Value::Array(a) => J::Array(a.iter().map(value_to_json).collect()),
        Value::InlineTable(t) => J::Object(
            t.iter()
                .map(|(k, v)| (k.to_string(), value_to_json(v)))
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_blank_line_inside_a_review_does_not_split_it() {
        let (logs, undated) = parse_notes(
            "2026-03-01..2026-03-19 #rewatch\nFirst paragraph.\n\nSecond paragraph.\n\n2026-04-02\n",
        );
        assert_eq!(undated, "");
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].date, "2026-03-01");
        assert_eq!(logs[0].end.as_deref(), Some("2026-03-19"));
        assert_eq!(logs[0].tags, vec!["rewatch"]);
        assert_eq!(logs[0].body, "First paragraph.\n\nSecond paragraph.");
        assert_eq!(logs[1].date, "2026-04-02");
        assert_eq!(logs[1].body, "");
    }

    #[test]
    fn header_extras_and_separators() {
        let (logs, _) =
            parse_notes("2017-10-06 (IMAX)\nDeliberate pacing.\n\n2026-01-01 → 2026-01-01");
        assert_eq!(logs[0].body, "(IMAX)\nDeliberate pacing.");
        assert_eq!(
            logs[1].end, None,
            "a span that ends where it starts is a day"
        );

        let (logs, _) = parse_notes("2026-02-01 to 2026-02-09");
        assert_eq!(logs[0].end.as_deref(), Some("2026-02-09"));
    }

    #[test]
    fn a_date_mid_paragraph_is_body_and_undated_text_is_kept() {
        let (logs, undated) =
            parse_notes("Loved the book.\n\n2026-05-01\nRead it in a week\n2026-05-08 was the end");
        assert_eq!(undated, "Loved the book.");
        assert_eq!(logs.len(), 1);
        assert!(logs[0].body.ends_with("2026-05-08 was the end"));
    }
}
