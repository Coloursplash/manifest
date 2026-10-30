# AGENTS.md — manifest

Instructions for coding agents (and humans) working in this repo. `GOAL.md` is the *why*;
this is the *how* and the *map*. Keep it short and true: rules, architecture, and gotchas
that still apply. History belongs in git commits, not here. (Claude Code reads it through a
local, gitignored `CLAUDE.md` containing `@AGENTS.md`.)

## What this is

An open-source, local-first media tracker for film, TV, anime, books, manga, games and music.
A Tauri 2 desktop app: a Rust core and a React + TypeScript webview.

## Rule 1: never lose what the user wrote

- The library is **one SQLite file the user picked** (`library.sqlite` by default). Nothing
  else holds library data. App preferences (theme, sort, rail width, …) go in localStorage
  via `lib/prefs.ts`; the file pointer and API keys go in the OS app-config `config.json`.
  Older configs and recent-library lists hold the *folder*; `library_file` (db.rs) and
  `recordLibrary` (libraries.ts) resolve or fold that to the `library.sqlite` inside it.
- Every write is **one transaction** in `library/db.rs`. Validate at that boundary (dates are
  `YYYY-MM-DD`, spans don't run backwards, typed fields have the right type); refuse bad
  input rather than storing it.
- Deleting an entry is a **soft delete** (`trashed_at`), confirmed in the UI. Never hard-delete.
- Never invent data. Adding something never stamps a date: the user picks dates in the log
  editor.
- A schema change means bumping `SCHEMA_VERSION` and adding a migration step in
  `Db::migrate`. Never edit the v1 `SCHEMA` in place once a release has shipped.

## Rule 2: the seven media are not interchangeable

**Film is the exception, not the template.** Most media are consumed *over time*: a season
over weeks, a book over a month, a game over sixty hours. Only film and music are single
sittings (`PROGRESS[medium].single` in `src/lib/types.ts`).

- Never make "when?" a single date for a serial medium. A log is a day **or a span**.
- Per-medium differences belong in the tables in `types.ts`: `PROGRESS` (shape), `VERBS`
  (wording + repeat tag), `STATUS_VERB`. Don't put `if (medium === "film")` at a call site.
- **Before shipping anything user-facing**, walk it through all seven media and say in one
  line what it means for each. If an answer is "same as film", justify it. If you can't,
  stop and ask the user instead of shipping the film-shaped version.

Real bugs this rule caught: "recently finished" sorting ignored films (they only have logs,
not a `finished` field, so `lib/logs.ts` has `lastDone`), and the timeline only flagged
`#rewatch`/`#reread` as repeats (it now reads every medium's repeat tag from `VERBS`).

## Architecture map

```
library.sqlite ──► src-tauri/src/library/db.rs     Db: list/get/create/patch, add/update/delete_log, trash
                   src-tauri/src/library/import.rs one-time import of a legacy .toml library
                   src-tauri/src/library/schema.rs Entry, LogEntry, Medium, Status (serialised to JSON)
                   src-tauri/src/state.rs          AppState { db }, config.json (library file + API keys)
                   src-tauri/src/fetch/*.rs        TMDB, AniList, Open Library, RAWG, MusicBrainz
                   src-tauri/src/cover.rs          cover download → OS cache dir
                   src-tauri/src/commands.rs       thin #[tauri::command]s over the above
                               │  invoke()
src/lib/api.ts  ◄──────────────┘  the ONLY place that calls invoke; typed wrappers
src/lib/types.ts                  mirrors schema.rs by hand + the per-medium tables
src/App.tsx                       owns app state: entries, view, filter, prefs; wires views
  components/Rail.tsx             sidebar (markup only)
  components/OmniBox.tsx          the floating pill: filter / `>` commands / add mode
  views/LibraryGrid.tsx           status sections (shelf collapsed, grid-per-medium expanded)
  views/Timeline.tsx, Review.tsx  diary + year/month review, built by lib/timeline.ts
  views/EntryDetail.tsx           one entry: status, rating, progress, log (components/LogList)
  views/add/AddPanel.tsx          the add flow inside the pill (search hook, grid, log dialog)
  views/SettingsModal.tsx, Onboarding.tsx
```

Data flow: every mutation calls an `api.ts` function, which returns the **updated `Entry`**,
and `App.upsert` swaps it into `entries`. There is no file watcher and no global reload after
writes. Pure logic lives in `src/lib/` (`filter`, `sort`, `timeline`, `logs`, `fuzzy`) and is
unit-tested. Components stay dumb about storage.

### Data model (see `db.rs` for the authoritative SQL)

- **entries**: `id` (`"medium/slug"`, unique even for a second "Dune": `film/dune-2021`, then
  `-2`…), `medium`, `title`, `year`, `cover` (remote URL; the local cache path is derived),
  `status` (`want|active|done|dropped|paused`), `rating` (user's own scale), `tags` (JSON),
  `owned` (only surfaced for media you buy, games by default: it splits `want` into
  Backlog/Wishlist), `started`/`finished`, `progress` (page / episode / chapter / **hours** for
  games, which is open-ended so there's no bar), `season` (tv), `extra` (JSON per-medium
  metadata: director, author, episodes, …), `trashed_at`.
- **logs**: `id`, `entry_id`, `date`, `end` (a span; `NULL` for one day), `tags`
  (`rewatch`/`reread`/`replay`/`relisten` are tags, not prose), `body` (free text, any number
  of paragraphs). Edits and deletes address a log **by id, never by position**.
- `patch_entry` takes JSON: known keys are type-checked, `null` clears, and any other key goes
  into `extra`. Tags are normalised the same way on both sides (`clean_tag` in Rust,
  `normalizeTag` in TS). Keep them in sync.

## External APIs

TMDB (film/TV; user-supplied key), AniList (anime/manga; no key), Open Library + Google Books
(no key), RAWG (games; user-supplied key, `rawg_api_key` / `RAWG_API_KEY`), MusicBrainz +
Cover Art Archive (music; no key, descriptive User-Agent). Fetch on demand, degrade gracefully
offline, and let the user override any fetched field. Never commit API keys.

## Aesthetic: Teenage Engineering

OP-1 / OP-Z / TP-7 language. Tokens are centralised in `src/styles/global.css` (`:root`).
Restrained near-black/off-white/grey palette plus **one** accent (orange by default; user
choosable). Chunky, tactile, high-contrast controls with a visible grid. Functional microcopy,
monospace-leaning type, snappy mechanical motion. Bespoke CSS, no UI kit, no extra accents.

## Gotchas (each one bit us)

- **jsdom has no layout.** Bugs where things move or resize are invisible to the test suite.
  Check CSS geometry in headless Firefox (`firefox --headless --screenshot page.html` against a
  markup probe, then read the PNG) before claiming a layout fix.
- **`position: fixed` menus** (OmniBox panel, Dropdown) are measured off their trigger, so
  re-measure on resize. A ResizeObserver can't see a *move*, so watch the full-width row too.
  A transformed ancestor becomes the containing block and shoves them sideways: never put
  `transform` on `.omnibar`. `.rail` must not take a `z-index`, or it traps the Sort menu.
- **Drag uses pointer events, not HTML5 DnD.** Tauri's webview swallows native drag events
  (see `MediaChooser`, `RailResizer`). `src/test/setup.ts` polyfills `PointerEvent`.
- **Collapsing the rail may only remove text.** Rows and icons must not shift. The rail is
  sized in px tokens (`--rail-key-h`, `--rail-key-px`, `--rail-pad-x`), and
  `RAIL_COLLAPSED_WIDTH` (71) mirrors the CSS.
- **Cards are one width everywhere.** `LibraryGrid` measures its column and publishes
  `--card-w` so a collapsed shelf and an expanded grid agree.
- **Page actions portal into the header** (`components/HeaderSlot.tsx`). Standalone view tests
  must render the two host divs (see `EntryDetail.test.tsx`).
- **Single-key hotkeys stand down** while the pill isn't in filter mode and while typing in a
  field. Every handler calls `preventDefault()` so the key can't leak into a field that opens
  focused.
- **Tauri command args are camelCase from JS** (`log_id` in Rust ⇄ `logId` in `api.ts`).
- **`<Cover>` renders the title as fallback text** when there's no cover URL. Seed test entries
  with a `cover` so titles aren't in the DOM twice.
- **WebKit honours `user-select: none` on form controls.** `.omni__panel--add` turns selection
  back on so the log textarea works.

## Never push without asking

**Don't `git push`, open a pull request, or otherwise publish anything (releases, tags, repo
settings) without the user's explicit approval for that specific action.** Committing locally
is fine. Approval for one push doesn't cover the next. Ask each time.

## Conventions

- Rust: `rustfmt` + `clippy --all-targets` clean. Command handlers stay thin; logic lives in
  `library/`. TS: strict mode on; `types.ts` mirrors `schema.rs`.
- Small, reviewable commits. Favour deleting code over adding layers. If a component passes
  ~300 lines or grows a second mode, split it.
- Never add telemetry, analytics, accounts or a hosted backend. If a task seems to need one,
  stop and flag it.
- Update `GOAL.md` and this file when a decision changes. Docs are part of the change.

## Tests

- Frontend (Vitest + jsdom + RTL): unit tests next to the code (`src/**/*.test.ts(x)`);
  integration tests in `tests/integration/` mount the **real `<App />`** over an in-memory
  fake backend (`harness.tsx`; `failOnce` makes a command reject once).
- Backend: unit tests inline (`#[cfg(test)]`), plus integration tests in `src-tauri/tests/`
  that drive the real `Db` against a temp folder (`db_lifecycle.rs`, `legacy_import.rs`).
- Every bug fix gets a test that fails without it.

```
nix develop -c npm run tauri dev                         # run the app
nix develop -c npm test                                  # frontend tests
nix develop -c bash -c 'cd src-tauri && cargo test'      # backend tests
nix flake check                                          # both, hermetically
nix build                                                # the release app → ./result
```

The flake's `packages.default` is the installable app (built by nixpkgs' `cargo-tauri.hook`:
`cargo tauri build`, then installed as `$out/Applications/manifest.app` on macOS). Users add
it to their nix-darwin/NixOS/home-manager config as a flake input (see README). Only built
and verified on aarch64-darwin so far; Linux is wired (WebKitGTK inputs, `wrapGAppsHook3`)
but untested.

`nix flake check` only sees git-tracked files, so `git add` new tests first. Refresh the
flake's `npmDepsHash` (`nix run nixpkgs#prefetch-npm-deps -- package-lock.json`) whenever
`package-lock.json` changes.

## Next

Export to plain text/JSON (so the data is never only in a database), import from other
trackers, custom media types. Known: the user has UI bugs to report. Get the concrete list and
reproduce each one before changing CSS.
