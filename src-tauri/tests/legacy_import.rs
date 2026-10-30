//! The one-time import of the old `.toml` library into `library.sqlite`.

mod common;

use common::TempLib;
use manifest_lib::library::db::Db;
use manifest_lib::library::import::UNDATED_NOTES_KEY;
use manifest_lib::library::schema::Status;
use serde_json::json;

const BR2049: &str = r#"title = "Blade Runner 2049"
director = "Denis Villeneuve" # my favourite
year = 2017
status = "done"
rating = 9
owned = "yes"
tags = ["sci-fi"]

notes = """
Saw the trailer first.

2017-10-06 (IMAX)
Deliberate pacing.

Second paragraph of the same review.

2026-07-09 #rewatch
"""
"#;

#[test]
fn imports_once_and_leaves_the_toml_files_alone() {
    let lib = TempLib::new();
    let films = lib.root.join("films");
    std::fs::create_dir_all(&films).unwrap();
    std::fs::write(films.join("br2049.toml"), BR2049).unwrap();
    std::fs::write(films.join("broken.toml"), "title = ").unwrap();
    std::fs::write(films.join("readme.txt"), "not an entry").unwrap();
    std::fs::create_dir_all(lib.root.join("books")).unwrap();
    std::fs::write(
        lib.root.join("books/piranesi.toml"),
        "title = \"Piranesi\"\nstatus = \"active\"\nnotes = \"\"\"\n2026-03-01..2026-03-19\n\"\"\"\n",
    )
    .unwrap();

    let db = Db::open(&lib.root).unwrap();
    let all = db.list().unwrap();
    assert_eq!(all.len(), 2, "the broken file is skipped, not fatal");

    let br = db.get("film/br2049").unwrap();
    assert_eq!(br.title, "Blade Runner 2049");
    assert_eq!(br.year, Some(2017));
    assert_eq!(br.status, Some(Status::Done));
    assert_eq!(br.rating, Some(9.0));
    assert_eq!(br.owned, None, "owned = \"yes\" is not a boolean");
    assert_eq!(br.tags, vec!["sci-fi"]);
    assert_eq!(br.extra.get("director"), Some(&json!("Denis Villeneuve")));
    assert_eq!(
        br.extra.get(UNDATED_NOTES_KEY),
        Some(&json!("Saw the trailer first."))
    );
    assert_eq!(br.logs.len(), 2);
    assert_eq!(
        br.logs[0].body,
        "(IMAX)\nDeliberate pacing.\n\nSecond paragraph of the same review."
    );
    assert_eq!(br.logs[1].tags, vec!["rewatch"]);

    let book = db.get("book/piranesi").unwrap();
    assert_eq!(book.logs[0].end.as_deref(), Some("2026-03-19"));

    // Originals untouched.
    assert_eq!(
        std::fs::read_to_string(films.join("br2049.toml")).unwrap(),
        BR2049
    );

    // Reopening doesn't import again, and a new .toml file is no longer read.
    drop(db);
    std::fs::write(films.join("later.toml"), "title = \"Later\"\n").unwrap();
    let db = Db::open(&lib.root).unwrap();
    assert_eq!(db.list().unwrap().len(), 2);
}
