//! An entry's whole life through the public `Db` API, the way the Tauri
//! commands drive it: create → patch → log → edit/delete a log → trash, and
//! reopening the file in between to prove it all reached disk.

mod common;

use common::TempLib;
use manifest_lib::library::db::{Db, LogDraft, NewEntry, DB_FILE};
use manifest_lib::library::schema::{Medium, Status};
use serde_json::{json, Map, Value};

fn new(medium: Medium, title: &str, year: Option<i64>) -> NewEntry {
    NewEntry {
        medium,
        title: title.into(),
        year,
        cover: None,
        status: Some(Status::Want),
        fields: Map::new(),
    }
}

fn log(date: &str, end: Option<&str>, body: &str) -> LogDraft {
    LogDraft {
        date: date.into(),
        end: end.map(Into::into),
        tags: vec![],
        body: body.into(),
    }
}

fn patch(v: Value) -> Map<String, Value> {
    v.as_object().unwrap().clone()
}

#[test]
fn full_lifecycle_survives_reopening() {
    let lib = TempLib::new();
    let mut db = Db::open(&lib.root).unwrap();
    assert!(lib.root.join(DB_FILE).exists());

    let mut fields = Map::new();
    fields.insert("episodes".into(), json!(9));
    fields.insert("year".into(), json!(1999)); // reserved: never lands in extra
    let e = db
        .create(NewEntry {
            fields,
            ..new(Medium::Tv, "Severance", Some(2022))
        })
        .unwrap();
    assert_eq!(e.id, "tv/severance");
    assert_eq!(e.extra.get("episodes"), Some(&json!(9)));
    assert!(e.extra.get("year").is_none());

    let e = db
        .patch(
            &e.id,
            &patch(
                json!({"status": "active", "rating": 9, "started": "2026-03-01", "owned": true}),
            ),
        )
        .unwrap();
    assert_eq!(e.status, Some(Status::Active));
    assert_eq!(e.rating, Some(9.0));
    assert_eq!(e.owned, Some(true));

    // A review in two paragraphs is one log, not two.
    let e = db
        .add_log(
            &e.id,
            log("2026-03-01", Some("2026-03-19"), "First.\n\nSecond."),
        )
        .unwrap();
    let e = db.add_log(&e.id, log("2026-02-01", None, "")).unwrap();
    assert_eq!(e.logs.len(), 2);
    assert_eq!(e.logs[0].date, "2026-02-01", "logs come back in date order");
    assert_eq!(e.logs[1].end.as_deref(), Some("2026-03-19"));
    assert_eq!(e.logs[1].body, "First.\n\nSecond.");

    drop(db);
    let mut db = Db::open(&lib.root).unwrap();
    let e = db.get("tv/severance").unwrap();
    assert_eq!(e.logs.len(), 2);
    assert_eq!(e.started.as_deref(), Some("2026-03-01"));

    // Edits and deletes go by id, so they can't land on a neighbour.
    let (first, second) = (e.logs[0].id, e.logs[1].id);
    let e = db
        .update_log(second, log("2026-03-02", Some("2026-03-19"), "Edited"))
        .unwrap();
    assert_eq!(e.logs[1].body, "Edited");
    assert_eq!(e.logs[0].id, first);
    let e = db.delete_log(first).unwrap();
    assert_eq!(e.logs.len(), 1);
    assert_eq!(e.logs[0].id, second);
    assert!(db.delete_log(first).is_err(), "a deleted log is gone");

    // Clearing with null.
    let e = db
        .patch(
            &e.id,
            &patch(json!({"rating": null, "owned": null, "episodes": null})),
        )
        .unwrap();
    assert_eq!(e.rating, None);
    assert_eq!(e.owned, None);
    assert!(e.extra.is_empty());

    db.trash(&e.id).unwrap();
    assert!(db.list().unwrap().is_empty());
    assert!(db.get(&e.id).is_err());
    assert!(db.update_log(second, log("2026-03-02", None, "")).is_err());
}

#[test]
fn same_title_gets_its_own_id() {
    let lib = TempLib::new();
    let mut db = Db::open(&lib.root).unwrap();
    let a = db.create(new(Medium::Film, "Dune", Some(1984))).unwrap();
    let b = db.create(new(Medium::Film, "Dune", Some(2021))).unwrap();
    let c = db.create(new(Medium::Film, "Dune", Some(2021))).unwrap();
    let book = db.create(new(Medium::Book, "Dune", None)).unwrap();
    assert_eq!(a.id, "film/dune");
    assert_eq!(b.id, "film/dune-2021");
    assert_eq!(c.id, "film/dune-2");
    assert_eq!(book.id, "book/dune");

    // Titles with no ASCII letters all slug to "untitled" — they still coexist.
    let x = db.create(new(Medium::Anime, "進撃の巨人", None)).unwrap();
    let y = db.create(new(Medium::Anime, "鬼滅の刃", None)).unwrap();
    assert_ne!(x.id, y.id);

    // A trashed entry keeps its id, so a re-add doesn't collide with it.
    db.trash(&a.id).unwrap();
    let again = db.create(new(Medium::Film, "Dune", Some(1984))).unwrap();
    assert_eq!(again.id, "film/dune-1984");
    assert_eq!(db.list().unwrap().len(), 6);
}

#[test]
fn bad_input_is_refused_and_changes_nothing() {
    let lib = TempLib::new();
    let mut db = Db::open(&lib.root).unwrap();
    let e = db.create(new(Medium::Book, "Piranesi", None)).unwrap();

    assert!(db.add_log(&e.id, log("", None, "no date")).is_err());
    assert!(db
        .add_log(&e.id, log("2026-03-10", Some("2026-03-01"), "backwards"))
        .is_err());
    assert!(db
        .add_log("book/missing", log("2026-03-10", None, ""))
        .is_err());
    assert!(db.create(new(Medium::Book, "   ", None)).is_err());

    for bad in [
        json!({"started": "last tuesday"}),
        json!({"year": "1999"}),
        json!({"rating": "great"}),
        json!({"status": "loved"}),
        json!({"owned": "yes"}),
        json!({"title": ""}),
        json!({"id": "book/other"}),
        // One bad field fails the whole patch — the good one isn't half-applied.
        json!({"progress": 40, "finished": "soon"}),
    ] {
        assert!(
            db.patch(&e.id, &patch(bad.clone())).is_err(),
            "accepted {bad}"
        );
    }
    let e = db.get(&e.id).unwrap();
    assert_eq!(e.progress, None);
    assert!(e.logs.is_empty());

    // Tags are normalised the same way everywhere.
    let e = db
        .add_log(
            &e.id,
            LogDraft {
                tags: vec!["#Reread".into(), "my tag".into(), "reread".into()],
                ..log("2026-04-01", None, "")
            },
        )
        .unwrap();
    assert_eq!(e.logs[0].tags, vec!["reread", "my-tag"]);
}
