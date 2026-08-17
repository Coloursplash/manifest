//! How a whole-library scan behaves against a messy real folder: a malformed
//! file must not blank the shelf, non-`.toml` files and the `.trash` folder are
//! ignored, and tags / unknown "total" fields survive the read.

mod common;

use common::TempLib;
use manifest_lib::library::schema::{Medium, Status};
use manifest_lib::library::store::{
    create_entry, ensure_layout, entry_path, load_all, trash_entry, NewEntry,
};
use serde_json::json;

#[test]
fn one_broken_file_does_not_hide_the_good_ones() {
    let lib = TempLib::new();
    let root = &lib.root;
    ensure_layout(root).unwrap();

    // Two valid entries.
    std::fs::write(
        entry_path(root, Medium::Film, "good-one"),
        "title = \"Good One\"\nstatus = \"done\"\n",
    )
    .unwrap();
    std::fs::write(
        entry_path(root, Medium::Book, "good-two"),
        "title = \"Good Two\"\nstatus = \"want\"\n",
    )
    .unwrap();
    // One that isn't valid TOML at all.
    std::fs::write(
        entry_path(root, Medium::Film, "broken"),
        "title = \"Broken\nthis = = not toml",
    )
    .unwrap();
    // A stray non-toml file that should simply be ignored.
    std::fs::write(root.join("films").join("README.md"), "not an entry").unwrap();

    let all = load_all(root).unwrap();
    let titles: Vec<&str> = all.iter().map(|e| e.title.as_str()).collect();
    assert_eq!(titles, vec!["Good One", "Good Two"]);
}

#[test]
fn trashed_entries_are_excluded_from_the_scan() {
    let lib = TempLib::new();
    let root = &lib.root;

    create_entry(
        root,
        NewEntry {
            medium: Medium::Film,
            title: "Kept".into(),
            year: None,
            cover: None,
            status: Some(Status::Done),
            fields: serde_json::Map::new(),
            notes: None,
        },
    )
    .unwrap();
    create_entry(
        root,
        NewEntry {
            medium: Medium::Film,
            title: "Removed".into(),
            year: None,
            cover: None,
            status: Some(Status::Done),
            fields: serde_json::Map::new(),
            notes: None,
        },
    )
    .unwrap();

    trash_entry(root, "film/removed").unwrap();

    let all = load_all(root).unwrap();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].title, "Kept");
}

#[test]
fn tags_and_unknown_totals_survive_a_read() {
    let lib = TempLib::new();
    let root = &lib.root;
    ensure_layout(root).unwrap();

    // A book with tags plus author/pages — pages isn't a typed field, so it
    // lands in `extra` as a "total" the UI reads.
    std::fs::write(
        entry_path(root, Medium::Book, "dune"),
        r#"title = "Dune"
author = "Frank Herbert"
pages = 412
tags = ["sci-fi", "classic"]
status = "active"
progress = 145
"#,
    )
    .unwrap();

    let all = load_all(root).unwrap();
    assert_eq!(all.len(), 1);
    let entry = &all[0];
    assert_eq!(entry.tags, vec!["sci-fi", "classic"]);
    assert_eq!(entry.progress, Some(145));
    assert_eq!(entry.extra.get("author").unwrap(), &json!("Frank Herbert"));
    assert_eq!(entry.extra.get("pages").unwrap(), &json!(412));
}
