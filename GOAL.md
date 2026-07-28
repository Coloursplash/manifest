# manifest — Project Goal

## One line

A local-first, open-source media tracker — Letterboxd for films, TV, anime, books, manga,
videogames, and music — where **your data lives on your disk as plain human-readable files** and the GUI is
just a beautiful lens over them.

## The problem

Existing trackers (Letterboxd, Trakt, MyAnimeList, Goodreads, Serializd…) host your data.
You can't read it without their app, you can't grep it, you can't back it up as text, and
if they shut down or change terms, your years of notes are gone or locked behind an export
button. manifest inverts that: the files are the product, the app is optional.

## Core principles (non-negotiable)

1. **Files are the source of truth.** Every entry is a plain `.toml` file on disk. The app
   reads and writes those files; it never hides data in a private database. Delete the app
   and your library is still fully intact and readable in any text editor.
2. **Human-readable, hand-editable.** A user must be able to open an entry in `vim` or VS
   Code, edit it, and have the GUI reflect the change. Round-tripping must preserve the
   user's formatting, key order, and comments as faithfully as possible.
3. **Local-first & offline.** No account, no server, no telemetry. Covers and metadata are
   fetched once from public APIs and cached locally so the library works with no network.
4. **One format across all media.** Films, TV, anime, books, manga, videogames, and music
   share a common schema with medium-specific fields layered on top. A book and a film should feel like
   the same kind of object with different attributes.
5. **The notes are the point.** The dated free-text log (see example below) is the heart of
   the app — it's a diary, not a rating field. Everything else serves it.

## The data format

One file per entry, TOML. Example (`library/films/blade-runner-2049.toml`):

```toml
title = "Blade Runner 2049"
director = "Denis Villeneuve"
year = 2017
cover = "https://image.tmdb.org/.../br2049.jpg"

notes = """
2017-10-06 (IMAX)
The pacing is incredibly deliberate, and I love that it didn't try to just copy the
original. The brutalist architecture in the Wallace Corp scenes is amazing.

2026-07-09 (Digital)
Watching this again nearly a decade later, the sound design stands out way more than the
visuals this time. The low-end synth pulses literally shake the room.
"""
```

The exact schema (shared fields + per-medium fields + status/list fields) is defined in
`CLAUDE.md` and will evolve; the format above is the anchor.

## What the app does

- **Auto-fetch** covers and metadata by title/search (TMDB, AniList, Open Library, Google
  Books) and cache cover images locally.
- **Fast search** across the whole library.
- **Watch/read lists & status** — want-to / in-progress / finished, per entry, stored in
  the file itself.
- **Browse & visualise** the library two ways: a grid/shelf view (grouped by status —
  in-progress / watchlist / done) and a **timeline/diary** view that scrolls your dated
  watch/read events by month and year, Letterboxd-style, with per-year summaries.
- **Sort** the library by name, recently finished, recently released, or your own score.
- **View & append notes** — especially quick "log a new dated entry" for a rewatch/reread.
  These dated log blocks are exactly what the timeline is built from.
- Never require any of the above: hand-editing files always works.

## Aesthetic

Teenage Engineering (OP-1 / OP-Z / TP-7) design language: restrained palette with a single
strong accent, chunky tactile controls, functional/technical labels, monospace-leaning
type, grid layouts, a little playfulness. The UI should feel like a piece of hardware.

## Scope

**In scope (v1):** the 5 media types, TOML files, auto-fetch + cover cache, search, status/
lists, grid browse, note viewing/appending, TE-styled UI.

**Done (v1.2):** timeline/diary view + grouped, collapsible grid + sort controls + a
dedicated "Year in Review" summary page. All derived client-side from the dated `notes` log
+ `finished` dates — no new storage.

**Later:** deeper stats/insights, import from Letterboxd/MAL/Goodreads exports, custom media
types, tags/collections, multi-device sync via the user's own git repo or file-sync tool.

**Explicitly out of scope:** any hosted backend, accounts, social features, telemetry, or
storing user data anywhere but the user's chosen library folder.

## Success looks like

Someone clones the repo, points manifest at a folder, logs a few films, then opens that
folder in a text editor and finds clean TOML they'd have been happy to write by hand — and
they can back it up by committing it to their own git repo.
