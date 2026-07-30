//! The prime directive under integration: the files on disk are the source of
//! truth, so app writes must preserve a hand-authored file's comments, key
//! order, unknown keys, and the exact text of `notes`. These drive a realistic
//! file the user might have typed by hand, then assert the bytes after each
//! app-side mutation.

mod common;

use common::TempLib;
use manifest_lib::library::schema::Medium;
use manifest_lib::library::store::{append_note, ensure_layout, entry_path, load_one, patch_entry};
use serde_json::json;

/// A file a user hand-wrote: custom key order, inline + standalone comments, an
/// unknown key the app doesn't model, and a multi-line notes log.
const HAND_WRITTEN: &str = r#"# my favourite sci-fi
title = "Blade Runner 2049"
director = "Denis Villeneuve" # the GOAT
mood = "rainy"                # <- key manifest doesn't model
year = 2017
status = "want"

notes = """
2017-10-06 (IMAX)
Deliberate pacing, worth it.
"""
"#;

fn seed(root: &std::path::Path) {
    ensure_layout(root).unwrap();
    std::fs::write(entry_path(root, Medium::Film, "br2049"), HAND_WRITTEN).unwrap();
}

#[test]
fn patching_preserves_comments_key_order_and_unknown_keys() {
    let lib = TempLib::new();
    let root = &lib.root;
    seed(root);

    // The app changes status and adds progress fields.
    let mut patch = serde_json::Map::new();
    patch.insert("status".into(), json!("done"));
    patch.insert("finished".into(), json!("2026-07-09"));
    let entry = patch_entry(root, "film/br2049", &patch).unwrap();

    // The unknown key survives round-tripping into `extra` and back.
    assert_eq!(entry.extra.get("mood").unwrap(), &json!("rainy"));

    let after = std::fs::read_to_string(entry_path(root, Medium::Film, "br2049")).unwrap();
    // Comments — standalone and inline — are intact.
    assert!(after.contains("# my favourite sci-fi"));
    assert!(after.contains(r#"director = "Denis Villeneuve" # the GOAT"#));
    assert!(after.contains(r#"mood = "rainy"                # <- key manifest doesn't model"#));
    // Existing key order (director before year) is untouched.
    assert!(after.find("director").unwrap() < after.find("year").unwrap());
    // The edit landed.
    assert!(after.contains(r#"status = "done""#));
    assert!(after.contains(r#"finished = "2026-07-09""#));
    // A newly-added key is inserted before notes, keeping the log last.
    assert!(after.find("finished").unwrap() < after.find("notes").unwrap());
    assert!(after.trim_end().ends_with("\"\"\""));
}

#[test]
fn appending_a_note_never_rewrites_existing_blocks() {
    let lib = TempLib::new();
    let root = &lib.root;
    seed(root);

    append_note(root, "film/br2049", "2026-08-01", &["rewatch".into()], "Sound design.").unwrap();

    let after = std::fs::read_to_string(entry_path(root, Medium::Film, "br2049")).unwrap();
    // The original block is byte-for-byte present, and it comes before the new one.
    let original_block = "2017-10-06 (IMAX)\nDeliberate pacing, worth it.";
    assert!(after.contains(original_block), "original note block must be preserved verbatim");
    let new_block = "2026-08-01 #rewatch\nSound design.";
    assert!(after.contains(new_block));
    assert!(after.find(original_block).unwrap() < after.find(new_block).unwrap());
    // Still a triple-quoted block, and the rest of the file is intact.
    assert!(after.contains("notes = \"\"\""));
    assert!(after.contains("# my favourite sci-fi"));
    assert!(after.contains(r#"mood = "rainy""#));
}

#[test]
fn a_hand_edit_outside_the_app_is_picked_up_by_the_next_read() {
    let lib = TempLib::new();
    let root = &lib.root;
    seed(root);

    // Simulate the user editing the file in their editor while the app is idle.
    let edited = HAND_WRITTEN
        .replace(r#"status = "want""#, r#"status = "active""#)
        .replace("year = 2017", "year = 2019");
    std::fs::write(entry_path(root, Medium::Film, "br2049"), &edited).unwrap();

    // The app's next load reflects the external change without any reconcile step.
    let entry = load_one(root, "film/br2049").unwrap();
    assert_eq!(entry.status.map(|s| s.as_str()), Some("active"));
    assert_eq!(entry.year, Some(2019));
}
