# manifest — Project Goal

## One line

A local-first, open-source media tracker — Letterboxd for films, TV, anime, books, manga,
videogames, and music — where **your data lives on your disk, in one open-format file you
own**, and the GUI is just a beautiful lens over it.

## The problem

Existing trackers (Letterboxd, Trakt, MyAnimeList, Goodreads, Serializd…) host your data.
You can't read it without their app, you can't back it up yourself, and if they shut down
or change terms, your years of notes are gone or locked behind an export button. manifest
inverts that: the library file is the product, the app is optional.

## Core principles (non-negotiable)

1. **Your library is one file you own.** Everything lives in `library.sqlite` inside the
   folder you choose — SQLite, the most widely readable database format there is. Copy
   the folder and you've backed up everything; delete the app and the library is intact,
   readable by any SQLite tool (`sqlite3`, DB Browser, Datasette, Python…).
2. **Never lose what the user wrote.** Every write is a transaction (all or nothing).
   Deleting an entry moves it to the trash rather than erasing it. Input is validated
   before it's stored, so bad data can't get in.

   *(Until v1.5 the library was one hand-editable `.toml` file per entry. It moved to
   SQLite because the hand-rolled text format for the log was the source of most data
   bugs. Hand-editing in a text editor is the trade-off. An old `.toml` library is
   imported automatically, once, and its files are left untouched.)*
3. **Local-first & offline.** No account, no server, no telemetry. Covers and metadata are
   fetched once from public APIs and cached locally so the library works with no network.
4. **One format across all media.** Films, TV, anime, books, manga, videogames, and music
   share a common schema with medium-specific fields layered on top. A book and a film should feel like
   the same kind of object with different attributes.
5. **The notes are the point.** The dated free-text log (see example below) is the heart of
   the app — it's a diary, not a rating field. Everything else serves it.

## The data format

Two tables in `library.sqlite`:

- **entries** — one row per title: `title`, `year`, `cover`, `status`, `rating`, `tags`,
  `owned`, `started`/`finished`, `progress`, `season`, and an `extra` JSON object for the
  per-medium metadata (director, author, episodes, …).
- **logs** — the dated diary: one row per log, each a day or a span of days, with tags
  (`rewatch`, `reread`, …) and a free-text body that can run to as many paragraphs as you
  like.

```
entries:  film/blade-runner-2049 | Blade Runner 2049 | 2017 | done | 9 | {"director": "Denis Villeneuve"}
logs:     2017-10-06             |            |         | (IMAX) The pacing is incredibly deliberate…
          2026-07-09             |            | rewatch | The sound design stands out way more…
          2026-03-01 → 2026-03-19 (a book read over three weeks)
```

The exact schema lives in `src-tauri/src/library/db.rs` and is summarised in `CLAUDE.md`.

## What the app does

- **Auto-fetch** covers and metadata by title/search (TMDB, AniList, Open Library, Google
  Books) and cache cover images locally.
- **Fast search** across the whole library.
- **Watch/read lists & status** — want-to / in-progress / finished, per entry.
- **Browse & visualise** the library two ways: a grid/shelf view (grouped by status —
  in-progress / backlog / wishlist / done, where backlog vs wishlist is "own it" vs "would
  have to buy it", for the media you buy) and a **timeline/diary** view that scrolls your dated
  watch/read events by month and year, Letterboxd-style, with per-year summaries.
- **Sort** the library by name, recently finished, recently released, or your own score.
- **View & add to the log** — especially quick "log a new dated entry" for a rewatch/reread.
  These dated logs are exactly what the timeline is built from.

## Aesthetic

Teenage Engineering (OP-1 / OP-Z / TP-7) design language: restrained palette with a single
strong accent, chunky tactile controls, functional/technical labels, monospace-leaning
type, grid layouts, a little playfulness. The UI should feel like a piece of hardware.

## Scope

**In scope (v1):** the media types, a local library, auto-fetch + cover cache, search,
status/lists, grid browse, the dated log, TE-styled UI.

**Done (v1.2):** timeline/diary view + grouped, collapsible grid + sort controls + a
dedicated "Year in Review" summary page. All derived client-side from the dated log +
`finished` dates — no new storage.

**Done (v1.5):** the library moved from per-entry `.toml` files to one `library.sqlite`.

**Later:** export to plain text/JSON/CSV (so the data is never only in a database), deeper
stats/insights, import from Letterboxd/MAL/Goodreads exports, custom media types,
tags/collections, multi-device sync via the user's own file-sync tool.

**Explicitly out of scope:** any hosted backend, accounts, social features, telemetry, or
storing user data anywhere but the user's chosen library folder.

## Success looks like

Someone clones the repo, points manifest at a folder, logs a few films, and their whole
library is one file in that folder — easy to back up, readable by any SQLite tool, and
never at the mercy of a service shutting down.
