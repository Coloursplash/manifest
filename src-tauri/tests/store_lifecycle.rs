//! End-to-end lifecycle of an entry through the public `store` API, driven the
//! way the Tauri commands drive it: create → load → patch → log → trash.
//!
//! These are *integration* tests (a separate crate linking `manifest_lib`), so
//! they only touch the public surface the frontend ultimately depends on.

mod common;

use common::TempLib;
use manifest_lib::library::schema::{Medium, Status};
use manifest_lib::library::store::{
    self, append_note, create_entry, delete_note, edit_note, entry_path, load_all, load_one,
    patch_entry, set_status, trash_entry, NewEntry,
};
use serde_json::json;

fn film(title: &str) -> NewEntry {
    NewEntry {
        medium: Medium::Film,
        title: title.into(),
        year: None,
        cover: None,
        status: Some(Status::Want),
        fields: serde_json::Map::new(),
        notes: None,
    }
}

#[test]
fn full_entry_lifecycle_round_trips_through_disk() {
    let lib = TempLib::new();
    let root = &lib.root;

    // Create an entry with a per-medium field and a starting note.
    let mut fields = serde_json::Map::new();
    fields.insert("director".into(), json!("Denis Villeneuve"));
    let created = create_entry(
        root,
        NewEntry {
            medium: Medium::Film,
            title: "Blade Runner 2049".into(),
            year: Some(2017),
            cover: Some("https://img/br2049.jpg".into()),
            status: Some(Status::Want),
            fields,
            notes: Some("Been meaning to watch this.".into()),
        },
    )
    .unwrap();
    assert_eq!(created.id, "film/blade-runner-2049");
    assert_eq!(created.status, Some(Status::Want));
    assert_eq!(
        created.extra.get("director").unwrap(),
        &json!("Denis Villeneuve")
    );

    // It shows up in a fresh scan of the library.
    let all = load_all(root).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].id, "film/blade-runner-2049");

    // Move it along: start it, then finish + rate it.
    let mut patch = serde_json::Map::new();
    patch.insert("status".into(), json!("active"));
    patch.insert("started".into(), json!("2026-07-01"));
    patch_entry(root, "film/blade-runner-2049", &patch).unwrap();

    let mut done = serde_json::Map::new();
    done.insert("status".into(), json!("done"));
    done.insert("finished".into(), json!("2026-07-02"));
    done.insert("rating".into(), json!(4.5));
    let entry = patch_entry(root, "film/blade-runner-2049", &done).unwrap();
    assert_eq!(entry.status, Some(Status::Done));
    assert_eq!(entry.started.as_deref(), Some("2026-07-01"));
    assert_eq!(entry.finished.as_deref(), Some("2026-07-02"));
    assert_eq!(entry.rating, Some(4.5));

    // Log a watch, then a rewatch.
    append_note(
        root,
        "film/blade-runner-2049",
        "2026-07-02",
        None,
        &[],
        "Gorgeous.",
    )
    .unwrap();
    let entry = append_note(
        root,
        "film/blade-runner-2049",
        "2026-08-01",
        None,
        &["rewatch".into()],
        "Even better.",
    )
    .unwrap();
    let notes = entry.notes.unwrap();
    assert!(notes.contains("2026-07-02"));
    assert!(notes.contains("2026-08-01 #rewatch"));

    // Reload from disk and confirm everything persisted together.
    let reloaded = load_one(root, "film/blade-runner-2049").unwrap();
    assert_eq!(reloaded.status, Some(Status::Done));
    assert_eq!(reloaded.rating, Some(4.5));
    assert_eq!(reloaded.year, Some(2017));
    assert_eq!(reloaded.cover.as_deref(), Some("https://img/br2049.jpg"));
    assert!(reloaded.notes.unwrap().contains("#rewatch"));

    // Trash it: gone from the shelf, moved (not deleted) into .trash.
    trash_entry(root, "film/blade-runner-2049").unwrap();
    assert!(load_all(root).unwrap().is_empty());
    assert!(!entry_path(root, Medium::Film, "blade-runner-2049").exists());
    let trashed = root.join(".trash/films/blade-runner-2049.toml");
    assert!(
        trashed.exists(),
        "entry should be moved into .trash, not hard-deleted"
    );
}

#[test]
fn load_all_spans_media_and_sorts_by_title() {
    let lib = TempLib::new();
    let root = &lib.root;

    create_entry(root, film("Zodiac")).unwrap();
    create_entry(
        root,
        NewEntry {
            medium: Medium::Book,
            title: "Dune".into(),
            ..film("Dune")
        },
    )
    .unwrap();
    create_entry(
        root,
        NewEntry {
            medium: Medium::Game,
            title: "amid the Ashes".into(), // lowercase → tests case-insensitive sort
            ..film("amid")
        },
    )
    .unwrap();

    let all = load_all(root).unwrap();
    let titles: Vec<&str> = all.iter().map(|e| e.title.as_str()).collect();
    assert_eq!(titles, vec!["amid the Ashes", "Dune", "Zodiac"]);
    // Each landed under the right medium folder.
    assert!(entry_path(root, Medium::Book, "dune").exists());
    assert!(entry_path(root, Medium::Game, "amid-the-ashes").exists());
}

#[test]
fn create_refuses_to_clobber_an_existing_entry() {
    let lib = TempLib::new();
    let root = &lib.root;

    create_entry(root, film("Heat")).unwrap();
    let err = create_entry(root, film("Heat")).unwrap_err();
    assert!(err.to_string().contains("already exists"), "got: {err}");
    // The original is untouched — still exactly one entry.
    assert_eq!(load_all(root).unwrap().len(), 1);
}

#[test]
fn note_edit_and_delete_address_blocks_by_index() {
    let lib = TempLib::new();
    let root = &lib.root;

    create_entry(root, film("Sicario")).unwrap();
    append_note(root, "film/sicario", "2026-01-01", None, &[], "First.").unwrap();
    append_note(root, "film/sicario", "2026-02-01", None, &[], "Second.").unwrap();
    append_note(root, "film/sicario", "2026-03-01", None, &[], "Third.").unwrap();

    // Edit the middle block.
    let entry = edit_note(
        root,
        "film/sicario",
        1,
        "2026-02-02",
        None,
        &["rewatch".into()],
        "Second, fixed.",
    )
    .unwrap();
    let notes = entry.notes.unwrap();
    assert!(notes.contains("2026-02-02 #rewatch"));
    assert!(notes.contains("Second, fixed."));
    assert!(!notes.contains("2026-02-01"));

    // Delete the first block; the other two remain, in order.
    let entry = delete_note(root, "film/sicario", 0).unwrap();
    let notes = entry.notes.unwrap();
    assert!(!notes.contains("First."));
    assert!(notes.contains("Second, fixed."));
    assert!(notes.contains("Third."));

    // Out-of-range index is an error, not a panic.
    assert!(edit_note(root, "film/sicario", 9, "2026-04-01", None, &[], "x").is_err());
    assert!(delete_note(root, "film/sicario", 9).is_err());
}

#[test]
fn set_status_clears_when_none() {
    let lib = TempLib::new();
    let root = &lib.root;

    create_entry(root, film("Prisoners")).unwrap();
    let entry = set_status(root, "film/prisoners", Some(Status::Paused)).unwrap();
    assert_eq!(entry.status, Some(Status::Paused));

    let entry = set_status(root, "film/prisoners", None).unwrap();
    assert_eq!(entry.status, None);
    let text = std::fs::read_to_string(entry_path(root, Medium::Film, "prisoners")).unwrap();
    assert!(
        !text.contains("status ="),
        "status key should be removed entirely"
    );
}

#[test]
fn bad_ids_and_missing_entries_error_cleanly() {
    let lib = TempLib::new();
    let root = &lib.root;

    assert!(load_one(root, "not-an-id").is_err());
    assert!(load_one(root, "bogus/slug").is_err());
    assert!(load_one(root, "film/does-not-exist").is_err());
    assert!(store::parse_id("film/").is_err());
}

#[test]
fn owned_round_trips_as_a_typed_bool_and_clears_to_absent() {
    let lib = TempLib::new();
    let root = &lib.root;

    create_entry(
        root,
        NewEntry {
            medium: Medium::Game,
            title: "Outer Wilds".into(),
            year: Some(2019),
            cover: None,
            status: Some(Status::Want),
            fields: serde_json::Map::new(),
            notes: None,
        },
    )
    .unwrap();
    let path = entry_path(root, Medium::Game, "outer-wilds");

    // Absent by default — an entry you never marked isn't owned.
    assert_eq!(load_one(root, "game/outer-wilds").unwrap().owned, None);

    // Marking it writes a real TOML boolean, not a string.
    let mut patch = serde_json::Map::new();
    patch.insert("owned".into(), json!(true));
    let entry = patch_entry(root, "game/outer-wilds", &patch).unwrap();
    assert_eq!(entry.owned, Some(true));
    let text = std::fs::read_to_string(&path).unwrap();
    assert!(text.contains("owned = true"), "got: {text}");
    // It's a typed field, so it must not also leak into the `extra` bag.
    assert!(!entry.extra.contains_key("owned"));

    // Unmarking removes the key rather than leaving `owned = false` behind.
    let mut patch = serde_json::Map::new();
    patch.insert("owned".into(), serde_json::Value::Null);
    let entry = patch_entry(root, "game/outer-wilds", &patch).unwrap();
    assert_eq!(entry.owned, None);
    let text = std::fs::read_to_string(&path).unwrap();
    assert!(!text.contains("owned"), "got: {text}");
}

#[test]
fn a_hand_written_non_boolean_owned_reads_as_not_owned() {
    let lib = TempLib::new();
    let root = &lib.root;

    create_entry(
        root,
        NewEntry {
            medium: Medium::Book,
            title: "Piranesi".into(),
            year: None,
            cover: None,
            status: Some(Status::Want),
            fields: serde_json::Map::new(),
            notes: None,
        },
    )
    .unwrap();

    // Someone edits the file by hand and writes a string. We refuse to coerce
    // it, but we also must not drop it — the key is theirs.
    let path = entry_path(root, Medium::Book, "piranesi");
    let text = std::fs::read_to_string(&path).unwrap();
    std::fs::write(&path, format!("{text}owned = \"yes\"\n")).unwrap();

    let entry = load_one(root, "book/piranesi").unwrap();
    assert_eq!(entry.owned, None, "a string is not a boolean");
    assert!(std::fs::read_to_string(&path)
        .unwrap()
        .contains("owned = \"yes\""));
}

/// You don't read a book on a date — you read it over three weeks. A log block
/// can carry a span, written `START..END` on the header line so it stays
/// hand-editable, and a single date is still just a single date.
#[test]
fn a_log_block_can_span_a_range_of_dates() {
    let lib = TempLib::new();
    let root = &lib.root;
    create_entry(
        root,
        NewEntry {
            medium: Medium::Book,
            title: "Piranesi".into(),
            year: None,
            cover: None,
            status: Some(Status::Active),
            fields: serde_json::Map::new(),
            notes: None,
        },
    )
    .unwrap();

    let entry = append_note(
        root,
        "book/piranesi",
        "2026-03-01",
        Some("2026-03-19"),
        &["reread".into()],
        "Read it slowly.",
    )
    .unwrap();
    let notes = entry.notes.unwrap();
    assert!(
        notes.contains("2026-03-01..2026-03-19 #reread"),
        "got: {notes}"
    );

    // A single-sitting log keeps the bare date — no empty range suffix.
    append_note(root, "book/piranesi", "2026-04-02", None, &[], "").unwrap();
    // Nor when the two ends are the same day.
    let entry = append_note(
        root,
        "book/piranesi",
        "2026-05-05",
        Some("2026-05-05"),
        &[],
        "",
    )
    .unwrap();
    let notes = entry.notes.unwrap();
    assert!(notes.contains("\n2026-04-02\n"), "got: {notes}");
    assert!(notes.trim_end().ends_with("2026-05-05"), "got: {notes}");
    // Only the first block spans; the bare dates gained no empty ".." suffix.
    assert_eq!(notes.matches("..").count(), 1, "got: {notes}");

    // Editing a block can add or drop the span.
    let entry = edit_note(
        root,
        "book/piranesi",
        1,
        "2026-04-02",
        Some("2026-04-06"),
        &[],
        "Took a few evenings.",
    )
    .unwrap();
    assert!(entry.notes.unwrap().contains("2026-04-02..2026-04-06"));
}
