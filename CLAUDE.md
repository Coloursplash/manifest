# CLAUDE.md — manifest

Guidance for Claude Code working in this repo. Read `GOAL.md` for the "why"; this file is
the "how". Keep this file current as decisions are made.

## What this is

An open-source, local-first media tracker (films, TV, anime, books, manga). User data lives
on disk as plain `.toml` files; the GUI is a lens over them. See `GOAL.md`.

## The prime directive

**The files on disk are the source of truth. The app is disposable.**

Every feature must respect this:
- Never store user library data anywhere but the user's library folder as `.toml` files.
  App state (window size, last folder, caches) may live in the OS app-data dir, but the
  *library* never does.
- When writing a file back, **preserve the user's formatting, key order, comments, and the
  exact text of `notes` byte-for-byte** wherever possible. Use a format-preserving TOML
  editor, not a naive parse→serialize round-trip that reorders keys and strips comments.
- Assume the user edits files by hand outside the app. The app must watch the library folder
  and reconcile external changes without clobbering them.
- A destructive write (delete/overwrite an entry) is a big deal — confirm in-UI and prefer
  moving to a trash folder over hard delete.

## Stack

- **Shell:** Tauri 2 (Rust core + webview frontend). Chosen for tiny bundle, strong local
  file access, and offline-first fit.
- **Backend (Rust):** file I/O, library folder watching, TOML parse/format-preserving write,
  external API fetch, cover image download + local cache. Exposed to the frontend via Tauri
  commands.
- **Frontend:** React + TypeScript + Vite. Plain CSS (or CSS modules) for the TE styling —
  avoid heavy component libraries that fight the aesthetic.
- **Rust TOML:** use `toml_edit` (format-preserving) for writing user files. `serde`/`toml`
  is fine for internal/app-state files only.

If a decision here turns out wrong, change it here and note why — don't let code and this
file drift.

## Repository layout (target)

```
manifest/
  src-tauri/          # Rust core
    src/
      commands/       # Tauri command handlers (thin — call into modules below)
      library/        # load/save entries, folder watching, schema types
      fetch/          # TMDB / AniList / OpenLibrary / GoogleBooks clients
      cover/          # download + local cache of cover images
    Cargo.toml
    tauri.conf.json
  src/                # React frontend
    components/
    views/            # grid/shelf, entry detail, search, add-entry
    styles/           # TE design tokens + component styles
    lib/              # tauri command wrappers, types (mirror Rust schema)
  GOAL.md
  CLAUDE.md
```

Create this incrementally — don't scaffold empty dirs ahead of need.

## Data schema

One `.toml` file per entry, grouped by medium under the library folder, e.g.
`library/films/`, `library/tv/`, `library/anime/`, `library/books/`, `library/manga/`.
Filename is a slug of the title.

**Shared fields (all media):**
- `title` (string, required)
- `year` (int) — release/publication year
- `cover` (string) — source URL; the local cache path is derived, not stored
- `status` (string) — one of `want`, `active`, `done`, `dropped`, `paused`
- `rating` (float, optional) — user's own scale, don't impose one
- `tags` (array of strings, optional)
- `notes` (multiline string) — the dated log; **treat as sacred, never reformat**

**Progress fields (typed, optional; interpreted per medium by the UI):**
- `started` / `finished` (date strings `YYYY-MM-DD`)
- `progress` (int) — page (books/manga) or episode (tv/anime); film has none (single sitting)
- `season` (int) — tv

**Per-medium fields (layer on top, live in `extra`):**
- films: `director`, `runtime`
- tv / anime: `creator`/`studio`, `episodes`
- books / manga: `author`, `pages`/`volumes`/`chapters` (the total; `progress` is the position)

**Notes convention:** each block's header is `YYYY-MM-DD` optionally followed by `#tag`s
(rewatch/reread are tags, not prose). The body is optional — a bare dated+tagged line is a
valid "watched it" entry. `append_note` builds the header from a date + tag list; other
fields change via `patch_entry` (which keeps `notes` last in the file).

Schema is intentionally loose and additive — unknown keys a user adds by hand must be
preserved, not dropped. When you extend the schema, update this section and `GOAL.md`'s
example if the shape of a core entry changes.

Note: `notes` convention is a series of `YYYY-MM-DD (context)` headed blocks. "Log a
rewatch" = append a new dated block; never rewrite existing blocks.

## External APIs

- **Film / TV:** TMDB (needs a free API key; keep it out of the repo — user-supplied or via
  a build-time env, never committed).
- **Anime / Manga:** AniList GraphQL (no key) — preferred; MAL as fallback.
- **Books:** Open Library (no key) first, Google Books as fallback.

Rules: fetch on demand (user searches / adds an entry), cache aggressively, degrade
gracefully offline, and always let the user override or hand-enter any fetched field.
Respect rate limits and set a descriptive User-Agent.

## Aesthetic: Teenage Engineering

Target the OP-1 / OP-Z / TP-7 language. Keep design tokens centralized in `src/styles/`.
- Restrained palette (near-black/off-white/greys) + **one** strong accent (orange).
- Chunky, tactile, high-contrast controls; visible grid; generous corner radius on "keys".
- Functional/technical microcopy and labels; monospace-leaning type.
- Prefer bespoke CSS over a UI kit. Motion is snappy and mechanical, not floaty.
Don't sprinkle extra accent colors "for variety" — restraint is the whole look.

## Conventions

- Rust: standard `rustfmt` + `clippy`; keep command handlers thin, logic in modules.
- TS: strict mode on; types in `src/lib/` mirror the Rust schema — keep them in sync.
- Keep the frontend dumb about files: all disk access goes through Tauri commands, never
  assume a path shape in the UI.
- Small, reviewable changes. This is a greenfield hobby project — favor clarity over
  cleverness.

## Working agreements for Claude

- This is not a git repo yet and has no build tooling. **Before writing code, confirm with
  the user** whether to scaffold the Tauri project (it pulls a large dependency tree) —
  don't `cargo`/`npm init` unprompted.
- When unsure about a product decision, check `GOAL.md` first; if still unclear, ask.
- Update `GOAL.md` / `CLAUDE.md` when a decision changes — treat docs as part of the change.
- Never add telemetry, analytics, accounts, or a hosted backend. If a task seems to need
  one, stop and flag it.
- Don't commit API keys or user library data.

## Status

- **M0 done** — `flake.nix` dev shell (Rust 1.97, Node 22, `cargo-tauri` 2.11), Tauri 2 +
  React/TS/Vite scaffold, builds clean.
- **M1 done** — data core: `library/{schema,store,watch}.rs`, `state.rs`, `commands.rs`.
  Format-preserving `append_note`/`set_status` verified by unit tests (the notes block
  round-trips as a `"""` multi-line string; comments/key-order/unknown keys survive).
- **M2 done** — fetch (`fetch/{tmdb,anilist,books}.rs`) + local cover cache (`cover.rs`),
  exposed via `search_metadata` / `cache_cover`. Covers shown through the asset protocol
  (`protocol-asset` feature + `$APPCACHE/covers` scope). AniList/OpenLibrary parsing verified
  against live APIs.
- **M3 + M4 done** — frontend: `lib/{types,api,notes}.ts`, `styles/global.css` (TE design
  system), `components/Cover.tsx`, `views/{Onboarding,LibraryGrid,EntryDetail,AddEntryModal,
  SettingsModal}.tsx`, `App.tsx`. Full `tsc` + `cargo build` link clean.

v1 core loop complete. Next: import from other trackers, stats, custom media types.

Dev loop: `nix develop -c npm run tauri dev`. Tests: `nix develop -c bash -c 'cd src-tauri && cargo test'`.
