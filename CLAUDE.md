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

- **Frontend test suite added.** Vitest + jsdom + React Testing Library (`vitest.config.ts`;
  `npm test` / `npm run test:watch`). 92 tests, two layers:
  - **Pure `lib/` logic** — `notes` (block parsing/tags), `timeline` (`buildTimeline` de-dupe +
    `groupByMonth` bucketing/counts/weekday), `sort` (all 8 comparators + missing-field ordering
    + persistence), `media` (enabled/order load + legacy migrations), `libraries` (recents
    cap/rename/basename), `accent` (WCAG ink pick + lighten), `layout`.
  - **Component/interaction** (`*.test.tsx`) — `Dropdown` (open/select/close/backdrop),
    `MediaChooser` (Show/Hide toggle + last-enabled guard; the pointer-drag reorder physics
    aren't exercised — jsdom has no layout), `LibraryGrid` (status bucketing, collapse persist,
    card→`onOpen`), and `EntryDetail` (status chips, rating, the full log-compose flow, Started
    date, Trash confirm) with `../lib/api` mocked to assert the exact command each interaction
    fires. `src/test/setup.ts` stubs the Tauri `invoke`/`convertFileSrc` bridge + jest-dom
    matchers; `src/test/entry.ts` (`makeEntry`) builds fixtures.
  - **Caught a real bug:** `EntryDetail`'s Trash gated `onDeleted()` on the return of
    `deleteEntry` (a `void` command → always `undefined`), so trashing never navigated away.
    Rewrote `remove()` to treat "didn't throw" as success. Test files are type-checked by the
    prod `tsc` but tree-shaken out of the app bundle.
  - **Test layout (mirrors Rust):** *unit* tests are co-located next to the code
    (`src/**/*.test.{ts,tsx}`) — the Vitest/Jest idiom, and it matches the Rust side where unit
    tests live inline under `#[cfg(test)] mod tests` (currently just `library/store.rs`).
    *Integration* suites that drive several modules together live in **`tests/integration/`**
    (import back into `../../src/...`). `vitest.config.ts` `include`s both globs; `tsconfig.json`
    `include`s `["src", "tests"]` so both are type-checked by the build's `tsc`. Scripts:
    `npm test` (all), `npm run test:unit` (`vitest run src`), `npm run test:integration`.
  - **Integration suite** (`tests/integration/`, 9 tests) mounts the **real `<App />`** — real
    views + real `lib/` + real `src/lib/api` routing — over a stateful in-memory fake of the
    Tauri backend (`harness.tsx`: `installFakeBackend` implements the command surface over a
    `Map<id, Entry>`; `renderApp(seed)` installs it + renders). Only the `invoke` disk/network
    boundary is faked, so flows exercise everything above it. Covers: `library-flow` (boot,
    pill filter, digit-hotkey medium filter, `t`/`g` layout switch, open entry → status change
    round-tripped to the store via `patch_entry`), `add-entry` (＋ → add-mode pill → debounced
    provider search → commit a hit → `create_entry`+`finalize` land it in grid+store; TMDB-key
    gating), `command-bar` (`>` command mode → run `Timeline view`; fuzzy-jump to an entry via
    Enter). Note `<Cover>` renders the title as fallback text when a cover URL is missing —
    seed entries with a `cover` so titles aren't in the DOM twice. Now 133 frontend tests.

- **Command palette (⌘K) added.** A reusable, domain-agnostic system in three layers:
  - `lib/fuzzy.ts` — pure, dependency-free fuzzy matcher (`fuzzyMatch` → score + matched
    indices, with prefix/word-start/camelHump/consecutive bonuses; `fuzzyRank` filters + ranks,
    stable for ties). No DOM — reusable for any "type to filter" list.
  - `components/CommandPalette.tsx` — the generic overlay + `Command` type. Feed it a flat
    `Command[]`; it handles search, fuzzy ranking, first-seen-order **grouping**, keyboard nav
    (↑/↓ wrap, Enter, Esc), and **drill-in submenus** via `Command.children()` (a stack with a
    breadcrumb; Esc/Backspace pop). Commands are either terminal (`perform`, closes unless
    `keepOpen`) or drill-in (`children`). Knows nothing about manifest.
  - `lib/useHotkey.ts` — reusable global shortcut hook. Combo strings like `"mod+k"` (mod = ⌘
    on mac / Ctrl elsewhere); ignores keystrokes while typing in inputs *unless* the combo has
    a modifier (so ⌘K still fires from the filter box).
  - App wiring: `lib/paletteCommands.ts` (`buildCommands(ctx)`) is the only app-aware piece —
    turns app state + handlers into the command list (Actions: add / settings / year-in-review /
    Switch library… drill-in; View: grid / timeline / Sort by… drill-in / theme toggle; Filter:
    All + each enabled medium; Entries: jump to any entry). `App` binds `"mod+k"` to toggle
    `showPalette`, memoizes `commands` (handlers close over stable setters only, so state values
    are the real deps), renders `<CommandPalette>`, and adds a `.cmdk-trigger` (⌘K) button in the
    topbar. Styles under `.cmdk*` in `global.css` (scrim `z-index:60`, above modals/dropdowns;
    active row = full accent fill). Tests: `lib/fuzzy.test.ts` + `components/CommandPalette.test.tsx`
    (open/group/filter/perform/Enter/drill-in+pop/Esc-closes/empty). Now 109 frontend tests.
  - **Global hotkeys (no palette needed) + header polish.** `lib/useHotkey.ts` gains
    `useHotkeys(specs[], handler)` — binds a family of combos in one listener (used for the
    digit keys, where a per-key hook loop would break rules-of-hooks). Bindings in `App`:
    `⌘K` command mode, `g`/`t` layout, `n` new entry, `⌘,` settings, `/` focus search, `Esc`
    back-out-of-page / clear filter, `0` = All + `1`–`9` = nth enabled medium. Single-key combos
    self-disable while typing (the hook ignores non-modifier keys in inputs); **every handler
    `preventDefault()`s** so the key can't leak into a field that opens autofocused (the `n`→Add
    bug). Rail + Add carry `title` tooltips showing their key. All header controls share
    `--control-h` (40px) so the row lines up; `.topbar__actions` wraps as a unit on narrow widths.
  - **Search box IS the command bar (VSCode-style `>`), centred.** Replaced the separate `⌘K`
    button + modal palette with `components/OmniBox.tsx` (`forwardRef`, `OmniBoxHandle` =
    `focus()` / `commandMode()`): one **centred** header field where plain text drives the
    library `filter`, and a leading `>` flips it into command mode — fuzzy-searching
    `buildCommands` in a `position:fixed` dropdown (measured off the field to escape clipping;
    reuses the `.cmdk__*` row styles, shows each command's hotkey via `.cmdk__hint`). Command
    mode is **explicit state** (`mode`/`cmd`), and the `>` is represented by the ›-icon on the
    left — the character is *not* kept in the text, so it never doubles up; Backspace on an empty
    query drops back to filter. `⌘K`/`commandMode()` enters it; Enter/↑/↓ drive the list; Esc
    exits and restores the live filter. Topbar is a 3-part flex (`topbar__gutter` |
    OmniBox | `topbar__actions`) with equal side weights so the box stays dead-centre; width
    `min(640px, 58vw)`. `lib/paletteCommands.ts` is **flat** (no `children` drill-in — Sort and
    Switch-library expanded to one command each, each with a `hint`), the right shape for inline
    fuzzy jump. The modal `CommandPalette.tsx` stays in the tree (still reusable + tested) but
    `App` no longer renders it. Sort dropdown is now **always** rendered (was gated on grid
    layout, which shifted the row on every view switch) — timeline ignores it. Tests:
    `OmniBox.test.tsx` (filter vs `>` command mode, un-doubled `>`, fuzzy, click/Enter run, Esc
    restore, ref `commandMode`). 117 frontend tests.
  - **Floating pill + unified search/add + collapsible rail.** Removed the header bar entirely;
    `OmniBox` now floats as a centred pill over the content (`.omnibar`, `position:absolute`
    top-centre in the now-`relative` `.main`; `.content` gains top padding so nothing hides
    under it; pill `z-index:15`/panel `16`, below the modal scrim). A `+` (`.omnibar__add`)
    button sits beside it. **Search unifies browse + add**: in plain-text mode OmniBox shows a
    dropdown of matching entries to jump to **plus** an `Add "<query>"…` row (`App.filterResults`
    fuzzy-ranks `filtered`, caps 6, appends the add action); picking Add opens the flow prefilled
    via the new `AddEntryModal` `initialQuery` prop (seeds its search + auto-runs it). Dropdown
    is focus-gated (`focused` state; blur exits command mode). The `'on'` marker is gone —
    `Command.active` renders a leading `✓` (`.cmdk__check`) and an accent title (`.is-current`);
    `paletteCommands` sets `active` for the current layout/sort/medium (needs `currentMedium` in
    ctx) and keeps hotkey hints (now higher-contrast `.cmdk__hint`). **Rail collapses to icons**:
    `lib/rail.ts` persists the flag, a toggle (`IconSidebar`) flips `rail--collapsed` (62px,
    labels/legends/spec/Sort hidden, brand → `M.`); every rail item now has an icon
    (`MEDIUM_ICON` map: `IconFilm/Tv/Anime/Book/Manga/Game/Music`), and Sort moved from the
    header into the rail's View group (expanded only). Tests: OmniBox filter-results + `✓`,
    `lib/rail`. 121 frontend tests; `npm run build` clean.
  - **Add flow joined to the pill (one input, one menu).** The centred Add modal is gone from
    the main flow: `OmniBox` gains an **add mode** (third mode alongside filter/command) — the
    pill's single input becomes the add search, and `renderAdd(query, close)` fills the dropdown
    with the Add UI. `AddEntryModal` gained `variant="panel"` + a controlled `search` prop:
    `PanelShell`/`ModalShell` wrappers, its own search field hidden (the pill drives it via a
    300ms-debounced effect), `ManualAdd` `hideInput`. All add entry points route through
    `omniRef.addMode(query)` (＋ button, `n`, ⌘K ▸ Add entry, and the search dropdown's "Add …"
    row, which OmniBox appends itself and intercepts). Entering add mode **clears the library
    filter** (so the bar is empty on exit — fixes the stuck-query bug); a `mousedown` click-away
    (not a backdrop element, which would cover the input) + Esc close it. **Dropdown centring
    bug fixed**: `.omnibar` centred via flex + `pointer-events` instead of `translateX(-50%)` —
    a transformed ancestor was becoming the containing block for the `position:fixed` dropdown
    and shoving it to the right. Add panel is wider (clamped to viewport) + accent-topped
    (`.omni__panel--add`, `.addpanel*`). Tests: OmniBox add-mode entry (appended row + clears
    filter) + `addMode()` ref. 123 frontend tests; build clean.

Known: user has reported bugs in the new views to be triaged. Idea on the table: a "wishlist"
concept distinct from backlog, gated on adding an `owned` tag for games/books (they're not
subscription media) — not built yet.

v1 core loop complete. Next: import from other trackers, custom media types, more frontend
tests (component/view level).

- **Backend integration suite added.** `src-tauri/tests/` (Cargo's convention — each file is a
  separate crate linking `manifest_lib`, so it exercises only the public surface). `lib.rs`'s
  `mod library` is now `pub mod library` so the test crate can reach `library::{store,schema}`.
  `tests/common/mod.rs` = a `TempLib` RAII temp-dir (no `tempfile` dep, to keep the offline nix
  build lean). Three suites (12 tests): `store_lifecycle` (create→load→patch→note edit/delete→
  set_status→trash lifecycle, cross-medium `load_all` sort, clobber refusal, error paths),
  `format_preservation` (the prime directive: comments/key-order/unknown-key survival through
  `patch_entry`, notes never rewritten by `append_note`, external hand-edits picked up on read),
  and `library_scan` (a broken file doesn't blank the shelf, `.trash`/non-toml ignored, tags +
  unknown "totals" survive). The watcher (`watch.rs`) isn't integration-tested — it needs a live
  Tauri `AppHandle`.

- **`nix flake check` wired up.** `flake.nix` gains a `checks` output running both suites in the
  sandbox: `backend` (a test-only `buildRustPackage` — crates vendored from `Cargo.lock`, a stub
  `../dist/index.html` to satisfy `generate_context!`, `cargo test` offline, never links the app
  binary) and `frontend` (`buildNpmPackage` + `npm test`). Note flake eval only sees git-tracked
  files, so newly added tests must be `git add`ed before `nix flake check` picks them up; the
  frontend `npmDepsHash` in the flake must be refreshed (`nix run nixpkgs#prefetch-npm-deps --
  package-lock.json`) whenever `package-lock.json` changes.

Dev loop: `nix develop -c npm run tauri dev`. Tests: `nix develop -c bash -c 'cd src-tauri &&
cargo test'` (Rust) and `nix develop -c npm test` (frontend); or `nix flake check` to run both
suites hermetically.
