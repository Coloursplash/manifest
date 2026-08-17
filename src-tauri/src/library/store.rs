//! On-disk operations over the library folder.
//!
//! Reads produce [`Entry`] structs; writes mutate the parsed `toml_edit`
//! document in place and re-serialize, so untouched keys, comments, and
//! formatting are preserved byte-for-byte. The `notes` block is only ever
//! appended to — existing dated entries are never rewritten.

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use toml_edit::{value, Array, DocumentMut, Item, Value};

use super::schema::{Entry, Medium, Status, KNOWN_KEYS};

/// Split a `"{medium}/{slug}"` id into its parts.
pub fn parse_id(id: &str) -> Result<(Medium, String)> {
    let (medium_str, slug) = id
        .split_once('/')
        .ok_or_else(|| anyhow!("malformed entry id (expected 'medium/slug'): {id}"))?;
    let medium: Medium = medium_str
        .parse()
        .map_err(|_| anyhow!("unknown medium in id: {medium_str}"))?;
    if slug.is_empty() || slug.contains('/') {
        return Err(anyhow!("malformed slug in id: {id}"));
    }
    Ok((medium, slug.to_string()))
}

/// Absolute path of an entry's file: `<root>/<dir>/<slug>.toml`.
pub fn entry_path(root: &Path, medium: Medium, slug: &str) -> PathBuf {
    root.join(medium.dir()).join(format!("{slug}.toml"))
}

/// Turn a human title into a filesystem-safe slug: lowercase, alphanumerics
/// kept, everything else collapsed to single hyphens, no leading/trailing `-`.
pub fn slugify(title: &str) -> String {
    let mut slug = String::with_capacity(title.len());
    let mut prev_dash = false;
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !slug.is_empty() {
            slug.push('-');
            prev_dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug
    }
}

/// Create the per-medium subfolders under the library root if missing.
pub fn ensure_layout(root: &Path) -> Result<()> {
    for medium in Medium::ALL {
        std::fs::create_dir_all(root.join(medium.dir()))
            .with_context(|| format!("creating {} folder", medium.dir()))?;
    }
    Ok(())
}

/// Scan the whole library, skipping (but logging) any file that fails to
/// parse so one bad file never blanks the shelf. Sorted by title.
pub fn load_all(root: &Path) -> Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for medium in Medium::ALL {
        let dir = root.join(medium.dir());
        let read = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue, // folder may not exist yet
        };
        for dirent in read.flatten() {
            let path = dirent.path();
            if path.extension().and_then(|e| e.to_str()) != Some("toml") {
                continue;
            }
            let slug = match path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_string(),
                None => continue,
            };
            match read_entry(&path, medium, &slug) {
                Ok(entry) => entries.push(entry),
                Err(err) => log::warn!("skipping {}: {err:#}", path.display()),
            }
        }
    }
    entries.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    Ok(entries)
}

/// Load a single entry by id.
pub fn load_one(root: &Path, id: &str) -> Result<Entry> {
    let (medium, slug) = parse_id(id)?;
    let path = entry_path(root, medium, &slug);
    read_entry(&path, medium, &slug)
}

fn read_doc(path: &Path) -> Result<DocumentMut> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("reading {}", path.display()))?;
    text.parse::<DocumentMut>()
        .with_context(|| format!("parsing {}", path.display()))
}

fn read_entry(path: &Path, medium: Medium, slug: &str) -> Result<Entry> {
    let doc = read_doc(path)?;
    Ok(entry_from_doc(medium, slug, &doc))
}

fn entry_from_doc(medium: Medium, slug: &str, doc: &DocumentMut) -> Entry {
    let get_str = |k: &str| doc.get(k).and_then(|i| i.as_str()).map(str::to_string);

    let title = get_str("title").unwrap_or_else(|| slug.to_string());
    let year = doc.get("year").and_then(|i| i.as_integer());
    let cover = get_str("cover");
    let status = get_str("status").and_then(|s| s.parse::<Status>().ok());
    let rating = doc
        .get("rating")
        .and_then(|i| i.as_float().or_else(|| i.as_integer().map(|n| n as f64)));
    // Typed on purpose: a hand-written `owned = "yes"` is not a boolean, so it
    // reads as absent (not owned) rather than being silently coerced true.
    let owned = doc.get("owned").and_then(|i| i.as_bool());
    let started = get_str("started");
    let finished = get_str("finished");
    let progress = doc.get("progress").and_then(|i| i.as_integer());
    let season = doc.get("season").and_then(|i| i.as_integer());
    let notes = get_str("notes");

    let tags = doc
        .get("tags")
        .and_then(|i| i.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    let mut extra = serde_json::Map::new();
    for (key, item) in doc.as_table().iter() {
        if KNOWN_KEYS.contains(&key) {
            continue;
        }
        extra.insert(key.to_string(), item_to_json(item));
    }

    Entry {
        id: format!("{}/{}", medium.as_str(), slug),
        medium,
        slug: slug.to_string(),
        title,
        year,
        cover,
        status,
        rating,
        tags,
        owned,
        started,
        finished,
        progress,
        season,
        notes,
        extra,
    }
}

/// Build one note block: a `YYYY-MM-DD` header with any `tags` as `#tag`, and
/// an optional body. Empty body → a bare dated line ("watched it").
fn build_block(date: &str, tags: &[String], body: &str) -> String {
    let mut header = date.trim().to_string();
    for tag in tags {
        let t = tag.trim().trim_start_matches('#');
        if !t.is_empty() {
            header.push_str(" #");
            header.push_str(t);
        }
    }
    let body = body.trim_end();
    if body.is_empty() {
        header
    } else {
        format!("{header}\n{body}")
    }
}

/// Split a notes string into blocks on blank lines (matching the frontend
/// parser), so blocks can be addressed by index for edit/delete.
fn split_blocks(notes: &str) -> Vec<String> {
    let mut blocks = Vec::new();
    let mut cur: Vec<&str> = Vec::new();
    for line in notes.lines() {
        if line.trim().is_empty() {
            if !cur.is_empty() {
                blocks.push(cur.join("\n"));
                cur.clear();
            }
        } else {
            cur.push(line);
        }
    }
    if !cur.is_empty() {
        blocks.push(cur.join("\n"));
    }
    blocks
}

/// Write note blocks back (or remove `notes` entirely if none remain).
/// Assigning a plain multi-line string lets toml_edit pick a `"""` repr.
fn write_blocks(doc: &mut DocumentMut, blocks: &[String]) {
    if blocks.is_empty() {
        doc.as_table_mut().remove("notes");
    } else {
        doc["notes"] = value(format!("{}\n", blocks.join("\n\n")));
    }
}

/// Append a new dated block to an entry's `notes`, preserving everything else.
pub fn append_note(root: &Path, id: &str, date: &str, tags: &[String], body: &str) -> Result<Entry> {
    let (medium, slug) = parse_id(id)?;
    let path = entry_path(root, medium, &slug);
    let mut doc = read_doc(&path)?;

    let block = build_block(date, tags, body);
    let existing = doc.get("notes").and_then(|i| i.as_str()).unwrap_or("");
    let updated = if existing.trim().is_empty() {
        format!("{block}\n")
    } else {
        format!("{}\n\n{}\n", existing.trim_end(), block)
    };

    doc["notes"] = value(updated);
    write_doc(&path, &doc)?;
    Ok(entry_from_doc(medium, &slug, &doc))
}

/// Replace the note block at `index` with a rebuilt one; other blocks and the
/// rest of the file are preserved.
pub fn edit_note(
    root: &Path,
    id: &str,
    index: usize,
    date: &str,
    tags: &[String],
    body: &str,
) -> Result<Entry> {
    let (medium, slug) = parse_id(id)?;
    let path = entry_path(root, medium, &slug);
    let mut doc = read_doc(&path)?;

    let mut blocks = split_blocks(doc.get("notes").and_then(|i| i.as_str()).unwrap_or(""));
    if index >= blocks.len() {
        return Err(anyhow!("note {index} does not exist"));
    }
    blocks[index] = build_block(date, tags, body);
    write_blocks(&mut doc, &blocks);
    write_doc(&path, &doc)?;
    Ok(entry_from_doc(medium, &slug, &doc))
}

/// Delete the note block at `index`.
pub fn delete_note(root: &Path, id: &str, index: usize) -> Result<Entry> {
    let (medium, slug) = parse_id(id)?;
    let path = entry_path(root, medium, &slug);
    let mut doc = read_doc(&path)?;

    let mut blocks = split_blocks(doc.get("notes").and_then(|i| i.as_str()).unwrap_or(""));
    if index >= blocks.len() {
        return Err(anyhow!("note {index} does not exist"));
    }
    blocks.remove(index);
    write_blocks(&mut doc, &blocks);
    write_doc(&path, &doc)?;
    Ok(entry_from_doc(medium, &slug, &doc))
}

/// Set (or clear) an entry's `status`, preserving everything else.
pub fn set_status(root: &Path, id: &str, status: Option<Status>) -> Result<Entry> {
    let (medium, slug) = parse_id(id)?;
    let path = entry_path(root, medium, &slug);
    let mut doc = read_doc(&path)?;

    match status {
        Some(s) => doc["status"] = value(s.as_str()),
        None => {
            doc.as_table_mut().remove("status");
        }
    }
    write_doc(&path, &doc)?;
    Ok(entry_from_doc(medium, &slug, &doc))
}

/// Set (or remove, when a value is JSON `null`) arbitrary top-level scalar
/// keys, preserving everything else. Used for progress fields (started,
/// finished, progress, season), status, rating, and tags. `notes` is ignored
/// here — it only changes via [`append_note`] — and any newly-added key is
/// inserted before `notes` so the log stays at the bottom of the file.
pub fn patch_entry(
    root: &Path,
    id: &str,
    patch: &serde_json::Map<String, serde_json::Value>,
) -> Result<Entry> {
    let (medium, slug) = parse_id(id)?;
    let path = entry_path(root, medium, &slug);
    let mut doc = read_doc(&path)?;

    // To keep `notes` last, lift it out while we add any brand-new keys, then
    // re-append it. Only bother if we're actually adding a new key.
    let adding_new = patch
        .iter()
        .any(|(k, v)| k != "notes" && !v.is_null() && !doc.as_table().contains_key(k));
    let notes_item = if adding_new {
        doc.as_table_mut().remove("notes")
    } else {
        None
    };

    for (key, val) in patch {
        if key == "notes" {
            continue; // notes are append-only, never patched
        }
        if val.is_null() {
            doc.as_table_mut().remove(key);
        } else if let Some(item) = json_to_item(val) {
            doc[key.as_str()] = item;
        }
    }

    if let Some(item) = notes_item {
        doc.as_table_mut().insert("notes", item);
    }

    write_doc(&path, &doc)?;
    Ok(entry_from_doc(medium, &slug, &doc))
}

/// Payload for creating a brand-new entry file.
pub struct NewEntry {
    pub medium: Medium,
    pub title: String,
    pub year: Option<i64>,
    pub cover: Option<String>,
    pub status: Option<Status>,
    /// Per-medium fields (director, author, …) written after the shared keys.
    pub fields: serde_json::Map<String, serde_json::Value>,
    pub notes: Option<String>,
}

/// Write a new entry file, refusing to clobber an existing one. Returns the
/// created entry (with its assigned id/slug).
pub fn create_entry(root: &Path, new: NewEntry) -> Result<Entry> {
    ensure_layout(root)?;
    let slug = slugify(&new.title);
    let path = entry_path(root, new.medium, &slug);
    if path.exists() {
        return Err(anyhow!("an entry already exists at {}", path.display()));
    }

    let mut doc = DocumentMut::new();
    doc["title"] = value(new.title.clone());
    // Per-medium fields sit between title and the shared metadata.
    for (key, val) in &new.fields {
        if KNOWN_KEYS.contains(&key.as_str()) {
            continue;
        }
        if let Some(item) = json_to_item(val) {
            doc[key] = item;
        }
    }
    if let Some(year) = new.year {
        doc["year"] = value(year);
    }
    if let Some(cover) = &new.cover {
        doc["cover"] = value(cover.clone());
    }
    doc["status"] = value(new.status.unwrap_or(Status::Want).as_str());
    if let Some(notes) = &new.notes {
        if !notes.trim().is_empty() {
            let body = format!("{}\n", notes.trim_end());
            doc["notes"] = value(body);
        }
    }

    write_doc(&path, &doc)?;
    Ok(entry_from_doc(new.medium, &slug, &doc))
}

/// Move an entry to a `.trash/` folder in the library rather than hard-deleting.
pub fn trash_entry(root: &Path, id: &str) -> Result<()> {
    let (medium, slug) = parse_id(id)?;
    let path = entry_path(root, medium, &slug);
    let trash = root.join(".trash").join(medium.dir());
    std::fs::create_dir_all(&trash).context("creating trash folder")?;
    let dest = trash.join(format!("{slug}.toml"));
    std::fs::rename(&path, &dest)
        .with_context(|| format!("moving {} to trash", path.display()))?;
    Ok(())
}

fn write_doc(path: &Path, doc: &DocumentMut) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(path, doc.to_string())
        .with_context(|| format!("writing {}", path.display()))
}

// --- TOML <-> JSON bridging for the `extra` bag and create payloads ---

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

fn json_to_item(v: &serde_json::Value) -> Option<Item> {
    json_to_value(v).map(Item::Value)
}

fn json_to_value(v: &serde_json::Value) -> Option<Value> {
    use serde_json::Value as J;
    match v {
        J::String(s) => Some(Value::from(s.clone())),
        J::Bool(b) => Some(Value::from(*b)),
        J::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(Value::from(i))
            } else {
                n.as_f64().map(Value::from)
            }
        }
        J::Array(a) => {
            let mut arr = Array::new();
            for e in a {
                if let Some(val) = json_to_value(e) {
                    arr.push(val);
                }
            }
            Some(Value::Array(arr))
        }
        // Nested objects and nulls are dropped on create; hand-editing the
        // file is the escape hatch for anything this rich.
        J::Object(_) | J::Null => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_basics() {
        assert_eq!(slugify("Blade Runner 2049"), "blade-runner-2049");
        assert_eq!(slugify("  Spirited Away!! "), "spirited-away");
        assert_eq!(slugify("N/A ::: ---"), "n-a");
        assert_eq!(slugify("日本語 title"), "title");
        assert_eq!(slugify(""), "untitled");
    }

    #[test]
    fn parse_id_roundtrip() {
        let (m, s) = parse_id("film/blade-runner-2049").unwrap();
        assert_eq!(m, Medium::Film);
        assert_eq!(s, "blade-runner-2049");
        assert!(parse_id("nope").is_err());
        assert!(parse_id("bogus/x").is_err());
    }

    /// The core guarantee: appending a note must not disturb comments, key
    /// order, or the other keys' formatting, and must keep `notes` as a
    /// multi-line `"""` block.
    #[test]
    fn append_note_preserves_the_rest() {
        let dir = std::env::temp_dir().join(format!("manifest-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        ensure_layout(&dir).unwrap();

        let path = entry_path(&dir, Medium::Film, "br2049");
        let original = r#"title = "Blade Runner 2049"
director = "Denis Villeneuve" # my favourite
year = 2017

notes = """
2017-10-06 (IMAX)
Deliberate pacing.
"""
"#;
        std::fs::write(&path, original).unwrap();

        append_note(
            &dir,
            "film/br2049",
            "2026-07-09",
            &["rewatch".to_string()],
            "Sound design stands out.",
        )
        .unwrap();

        let after = std::fs::read_to_string(&path).unwrap();
        // Untouched keys and the inline comment survive verbatim.
        assert!(after.contains("director = \"Denis Villeneuve\" # my favourite"));
        assert!(after.contains("year = 2017"));
        // Old note kept, new note appended (tag as #tag), still one block.
        assert!(after.contains("2017-10-06 (IMAX)"));
        assert!(after.contains("2026-07-09 #rewatch"));
        assert!(after.contains("Sound design stands out."));
        assert!(after.contains("notes = \"\"\""));

        // And it re-parses to an Entry with both blocks in notes.
        let entry = load_one(&dir, "film/br2049").unwrap();
        let notes = entry.notes.unwrap();
        assert!(notes.contains("2017-10-06") && notes.contains("2026-07-09"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn create_then_set_status() {
        let dir = std::env::temp_dir().join(format!("manifest-create-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        let mut fields = serde_json::Map::new();
        fields.insert("director".into(), "Denis Villeneuve".into());
        let created = create_entry(
            &dir,
            NewEntry {
                medium: Medium::Film,
                title: "Dune Part Two".into(),
                year: Some(2024),
                cover: None,
                status: Some(Status::Want),
                fields,
                notes: None,
            },
        )
        .unwrap();
        assert_eq!(created.id, "film/dune-part-two");

        let updated = set_status(&dir, "film/dune-part-two", Some(Status::Done)).unwrap();
        assert_eq!(updated.status, Some(Status::Done));

        let text = std::fs::read_to_string(entry_path(&dir, Medium::Film, "dune-part-two")).unwrap();
        assert!(text.contains("director = \"Denis Villeneuve\""));
        assert!(text.contains("status = \"done\""));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn patch_adds_progress_and_keeps_notes_last() {
        let dir = std::env::temp_dir().join(format!("manifest-patch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        ensure_layout(&dir).unwrap();

        let path = entry_path(&dir, Medium::Book, "dune");
        std::fs::write(
            &path,
            "title = \"Dune\"\nstatus = \"want\"\n\nnotes = \"\"\"\n2026-07-01\nStarting.\n\"\"\"\n",
        )
        .unwrap();

        let mut patch = serde_json::Map::new();
        patch.insert("status".into(), "active".into());
        patch.insert("started".into(), "2026-07-20".into());
        patch.insert("progress".into(), 145.into());
        let entry = patch_entry(&dir, "book/dune", &patch).unwrap();

        assert_eq!(entry.progress, Some(145));
        assert_eq!(entry.started.as_deref(), Some("2026-07-20"));

        // New keys added, and the notes block is still the final key.
        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("started = \"2026-07-20\""));
        assert!(text.contains("progress = 145"));
        assert!(text.trim_end().ends_with("\"\"\""));
        assert!(text.find("progress").unwrap() < text.find("notes").unwrap());

        // Clearing with null removes the key.
        let mut clear = serde_json::Map::new();
        clear.insert("progress".into(), serde_json::Value::Null);
        let entry = patch_entry(&dir, "book/dune", &clear).unwrap();
        assert_eq!(entry.progress, None);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
