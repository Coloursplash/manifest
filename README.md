# manifest

A local-first media tracker — like Letterboxd, but for **films, TV, anime, books, and
manga**, and your data never leaves your disk. Every entry is a plain, human-readable
`.toml` file you own. manifest is a [Teenage Engineering](https://teenage.engineering/)-styled
GUI that reads those files, fetches covers, and gets out of the way.

The app is disposable. The files are the point. Delete manifest tomorrow and your library
is still there — greppable, diff-able, and yours.

## Why

Every other tracker hosts your data. You can't read it without their app, back it up as
text, or trust it'll exist next year. manifest inverts that: a folder of `.toml` files is
the source of truth, and the app is just a nice lens over it.

## The format

One file per entry (`library/films/blade-runner-2049.toml`):

```toml
title = "Blade Runner 2049"
director = "Denis Villeneuve"
year = 2017
cover = "https://image.tmdb.org/.../br2049.jpg"
status = "done"

notes = """
2017-10-06 (IMAX)
Deliberate pacing, and it didn't just copy the original. The brutalist Wallace Corp
architecture is amazing.

2026-07-09 (Digital)
The sound design stands out way more this time — the low-end synth pulses shake the room.
"""
```

The dated `notes` log is the heart of it — a diary, not a star rating. Edit files by hand
in any editor and the app reflects your changes; the app edits files back without touching
your formatting, comments, or key order.

## Features

- **Own your data** — plain `.toml`, one file per entry, grouped by medium.
- **Auto-fetch** covers + metadata: TMDB (film/TV), AniList (anime/manga), Open Library /
  Google Books (books). Covers are cached locally, so the library works offline.
- **Watch/read lists & status** — want / active / done / dropped / paused, stored in the file.
- **Fast search & browse** across the whole library.
- **Log a rewatch/reread** — append a dated note in a click.
- **Hand-edit friendly** — the folder is watched; external edits show up live.

## Tech

Tauri 2 (Rust core) + React/TypeScript. The Rust side owns file I/O, format-preserving TOML
writes (`toml_edit`), folder watching, metadata fetch, and the cover cache; the frontend is
a thin, bespoke-styled view.

## Develop

Dev tooling is pinned with a Nix flake (Rust, Node, the Tauri CLI, macOS deps):

```sh
nix develop            # enter the dev shell (or `direnv allow` with your own .envrc)
npm install            # first time only
npm run tauri dev      # run the app
```

Run the Rust tests (includes the format-preservation round-trip test):

```sh
cd src-tauri && cargo test
```

Film/TV search needs a free [TMDB](https://www.themoviedb.org/settings/api) API key — add it
in Settings, or set `TMDB_API_KEY` in the environment. Anime, manga, and books need no key.

## Layout

```
src-tauri/src/
  library/   schema, format-preserving store, folder watching
  fetch/     TMDB / AniList / Open Library / Google Books clients
  cover.rs   local cover-image cache
  commands.rs  Tauri command layer
  state.rs   app state + config (kept out of your library)
src/
  views/     grid, entry detail, add-entry, settings
  components/ cover
  lib/       typed API wrappers + shared types
  styles/    the TE design system
```

See `GOAL.md` for the vision and `CLAUDE.md` for engineering conventions.

## Status

Early but working: v1 core loop is complete (choose a library, add/search entries, fetch
covers, browse, log dated notes, set status). Import from other trackers, stats, and custom
media types are on the roadmap.

## License

MIT
