# CLAUDE.md — manifest

Guidance for Claude Code working in this repo. Read `GOAL.md` for the "why"; this file is
the "how". Keep this file current as decisions are made.

## What this is

An open-source, local-first media tracker (films, TV, anime, books, manga, videogames,
music). User data lives
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
`library/films/`, `library/tv/`, `library/anime/`, `library/books/`, `library/manga/`,
`library/games/`, `library/music/`. Filename is a slug of the title.

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
- `progress` (int) — page (books/manga), episode (tv/anime), or **hours played** (games,
  open-ended so no completion bar); film/music have none (single sitting)
- `season` (int) — tv

**Per-medium fields (layer on top, live in `extra`):**
- films: `director`, `runtime`
- tv / anime: `creator`/`studio`, `episodes`
- books / manga: `author`, `pages`/`volumes`/`chapters` (the total; `progress` is the position)
- games: `developer`, `publisher`, `platforms`, `genres`, `metacritic` (progress is hours;
  `done` = "Beaten", 100% is logged in `notes`, not a separate status)
- music: `artist`, `type` (Album/EP/Single) — albums are single-sitting like film

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
- **Videogames:** RAWG (rawg.io; needs a free API key, user-supplied like TMDB — kept out of
  the repo, stored in app config as `rawg_api_key`, or the `RAWG_API_KEY` env var).
- **Music:** MusicBrainz release-group search (no key; descriptive User-Agent required) +
  Cover Art Archive for covers (no key).

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

- **v1.2 done — timeline + views roadmap.** Phased; timeline first, docs updated per phase.
  - **Phase 1 done** — Timeline (diary) view. `lib/timeline.ts` (`buildTimeline` flattens each
    dated `notes` block into an event — `#rewatch`/`#reread` show separately — plus a
    `finished`-date fallback when no log covers that day; `groupByMonth` buckets for
    rendering). `views/Timeline.tsx` renders newest-first with year/month dividers + per-month
    medium counts. `lib/layout.ts` persists the grid⇄timeline choice; a `GRID | TIMELINE`
    toggle in the topbar (`.tabs--layout`) branches `App.tsx`'s content. Both layouts share the
    existing medium-tab + search `filtered` list. Pure client-side, read-only over `notes`.
  - **Phase 2 done** — grouped, collapsible grid. `views/LibraryGrid.tsx` now buckets the
    (already filtered) entries by status into sections: In Progress (active+paused,
    sub-grouped by medium, open by default) → Watchlist (want) → Done → Dropped, plus an
    Unsorted catch-all for statusless entries. Each section is a collapsible summary with a
    count; open/closed state persists in localStorage (`manifest-sections`). Empty sections
    are hidden.
  - **Phase 3 done** — sort controls. `lib/sort.ts` (`sortEntries` + persisted `SortKey`):
    Name / Recently finished / Recently released / My score; missing fields sort last. A
    `.select` in the topbar (grid layout only — the timeline stays date-desc) drives it;
    `App` sorts `filtered` → `sorted` and feeds it to the grid.
  - **Phase 4 done** — dedicated "In Review" page, per **year or month**. `views/Review.tsx`
    aggregates `buildTimeline(entries)` for the period: logged/titles/avg-score/busiest
    (month for a year, day for a month) stat tiles, a by-medium breakdown, an activity bar
    chart (12 months, or per-day for a month), and top-rated covers. Reached by clicking a
    year *or* month header on the timeline; `App`'s `View` gains a
    `{kind:"review"; year; month?}` case. Whole-library (ignores the medium tab), read-only.

- **v1.3 done — videogames + music.** Two new media added end-to-end. Backend: `Medium::Game`
  / `Medium::Music` (`schema.rs`), providers `fetch/rawg.rs` (games; user-supplied RAWG key,
  search list + detail call for developer/publisher/synopsis) and `fetch/musicbrainz.rs`
  (music; keyless release-group search, Cover Art Archive covers). `fetch::search`/`details`
  now thread a `rawg_key` alongside `tmdb_key`; `state.rs` stores `rawg_api_key`; new
  `has_rawg_key`/`set_rawg_key` commands. Frontend: `types.ts` gains the two mediums with
  labels, status verbs (games `done` = "Beaten"), a `VERBS` table (log/past/repeat-tag per
  medium, replacing the old book/manga literals in `EntryDetail`), and `PROGRESS` (games =
  open-ended `hour` unit with no total → no completion bar; music single-sitting). RAWG key
  gated in the Add flow + a second key field in Settings (`ApiKeyField` extracted and reused).

- **v1.4 done — first-run wizard + naming.** `views/Onboarding.tsx` is now a stepped setup
  wizard (folder → what to track → API keys → ready) with a progress stepper, replacing the
  single "choose folder" panel. It picks the library folder, lets the user choose enabled
  media (persisted via `saveEnabledMedia`, lifted to `App` through `onSetMedia`), and offers
  the TMDB/RAWG key fields inline — the keys step is skipped when nothing tracked needs a key
  (reuses `ApiKeyField`, now exported from `SettingsModal`). `App` only swaps to the home
  screen on the final `onComplete(path)`; the backend folder is activated on pick, so quitting
  mid-wizard just lands on home next launch (media/keys still settable in Settings). Wizard
  styles live under `.wizard*` in `global.css`; new `IconFolder`. Also renamed the grid's
  `want`-status section from "Watchlist" → **"Backlog"** (neutral across games/music) — the
  bucket key stays `watchlist` for the persisted collapse state.
  - **Switch library + recent libraries.** `lib/libraries.ts` keeps a localStorage list
    (`manifest-libraries`, most-recent-first, capped 8) of `{path, name}` — path + a user
    nickname (defaults to the folder basename). `App` records the active folder into it on
    every `libraryPath` change and exposes `switchToLibrary(path)` (activates by path via
    `set_library_folder`; drops the entry from the list if the folder is gone) and
    `browseForLibrary()` (native picker). `components/LibrarySwitcher.tsx` is a rail dropdown
    under the brand showing the current nickname + a menu of the others (menu is
    `position: fixed`, measured off the trigger, to escape the rail's scroll clipping).
    `SettingsModal`'s "Library" section lists all recents with an inline-editable nickname
    (`RecentLibraryRow`, committed on blur/Enter), a Switch button, and a forget (×) action;
    "Open another folder…" browses. Lets a user keep separate libraries (per person / user)
    on one machine and hop between them in a click. One folder is active at a time. Library
    switching lives **only in Settings** (not the rail) — it's not a primary action.
  - **Themed dropdown.** `components/Dropdown.tsx` is a reusable custom `<select>` (chunky
    trigger + `position: fixed` menu measured off the trigger so it escapes overflow
    clipping; `align` left/right, optional `leading` label, checkmark on the selected item).
    The topbar Sort control uses it (`align="right"`, `leading="Sort"`), replacing the native
    `<select>`/`.select` (both removed).
  - **More sort options.** `lib/sort.ts` now offers Name A–Z / Z–A, Recently finished,
    Recently started, Newest / Oldest release, Highest / Lowest rated (8 keys). Comparators
    refactored into `byTitle`/`byDateDesc`/`byNumber(dir)` helpers + a `COMPARATORS` table;
    missing fields always sort last. Old persisted keys still validate.
  - **Reorderable categories.** `lib/media.ts` now persists a user **order** alongside the
    enabled set (`{order, enabled, known}`; migrates the old `{enabled, known}` and legacy
    bare-array shapes — order defaults to canonical `MEDIA`, new media append + auto-enable).
    `getMediaOrder`/`saveMediaOrder` added; `getEnabledMedia`/`saveEnabledMedia` now return in
    user order. `components/MediaChooser.tsx` is a shared draggable list (grip + label + a
    show/hide checkbox per row, ≥1 enabled) used in **both** Settings and the onboarding
    "Track" step (which now toggles/reorders live via `App` instead of staging a local
    `selected`). Order drives the rail + Add flow; the grid's per-medium sub-grouping still
    uses canonical `MEDIA` order.
    Reorder uses **pointer events** (not HTML5 DnD — Tauri's webview swallows native drag
    events). Technique that actually feels right: grab the row anywhere but the checkbox →
    `setPointerCapture`; the held row gets a live inline `translateY(dy) scale` and pops
    (`.is-held`: accent border + offset shadow, follows the cursor 1:1), while neighbours get
    a slot-sized `translateY` shift with a transition. The array is **not** reshuffled during
    the drag (that reset the baseline and made it "break"); it's spliced once on pointer-up
    (optimistic `setItems` + `onReorder`). Stride (row height + gap) is measured on drag start.
    Travel clamps to the list bounds; text selection is killed app-wide via a `body.is-
    reordering` class during the drag. When the cursor nears the scroll container's top/bottom
    margin the container auto-scrolls (rAF loop, nearest scrollable ancestor = the `.scrim`),
    and the scroll delta since drag-start is folded into the drag math so the held row stays
    under the cursor. Row toggle reads Show/Hide (full-height, wide hit target).

Known: user has reported bugs in the new views to be triaged; project has no frontend test
suite yet (planned). Idea on the table: a "wishlist" concept distinct from backlog, gated on
adding an `owned` tag for games/books (they're not subscription media) — not built yet.

v1 core loop complete. Next: import from other trackers, custom media types, frontend tests.

Dev loop: `nix develop -c npm run tauri dev`. Tests: `nix develop -c bash -c 'cd src-tauri && cargo test'`.
