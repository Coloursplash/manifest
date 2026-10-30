# manifest

A local-first media tracker — like Letterboxd, but for **films, TV, anime, books, manga,
videogames and music** — and your data never leaves your disk. Your whole library is one
`library.sqlite` file in a folder you choose. manifest is a
[Teenage Engineering](https://teenage.engineering/)-styled app over it that fetches
covers and metadata and otherwise stays out of the way.

## Why

Every other tracker hosts your data. You can't read it without their app or back it up
yourself, and you can't trust it'll exist next year. manifest inverts that: the library is
a file you own, in an open format any SQLite tool can read. Copy the folder and you've
backed up everything.

## The log

The heart of it is a dated diary, not a star rating. Each entry keeps a log of when you
watched, read, played or listened — a single day for a film or an album, or a **span of
days** for things you get through over time (a season, a book, a sixty-hour game). Logs
carry tags like `#rewatch` and a free-text note of any length. The timeline and the
year-in-review pages are built from them.

## Features

- **Seven media**, each shaped the way it's actually consumed — episodes, pages, chapters,
  hours played.
- **Auto-fetch** covers and metadata: TMDB (film/TV), AniList (anime/manga), Open Library /
  Google Books (books), RAWG (games), MusicBrainz + Cover Art Archive (music). Covers are
  cached locally, so the library works offline.
- **Status & lists**: want / in progress / done / dropped / paused, with Backlog vs Wishlist
  for the media you buy.
- **Grid, timeline and year-in-review** views; sort, search, and a `>` command bar.
- **Keyboard-first adding**: `n`, type a title, ⏎, arrows, ⏎ to log.
- **Safe by design**: every write is all-or-nothing, input is validated, and trashing an
  entry hides it instead of erasing it.

Upgrading from an older version that stored one `.toml` file per entry? Point manifest at
that folder and it imports them once, leaving the files untouched.

## Install with Nix

The flake builds the app (a `manifest.app` on macOS). Add it to your system config.

**nix-darwin** (`flake.nix` of your config):

```nix
{
  inputs.manifest.url = "github:Coloursplash/manifest";
  inputs.manifest.inputs.nixpkgs.follows = "nixpkgs";

  outputs = { nix-darwin, manifest, ... }: {
    darwinConfigurations.my-mac = nix-darwin.lib.darwinSystem {
      modules = [
        ({ pkgs, ... }: {
          environment.systemPackages = [ manifest.packages.${pkgs.system}.default ];
        })
      ];
    };
  };
}
```

`darwin-rebuild switch` and manifest appears in `/Applications/Nix Apps`. The same works
with home-manager (`home.packages`) or NixOS (`environment.systemPackages`), or use the
overlay: `nixpkgs.overlays = [ manifest.overlays.default ]` gives you `pkgs.manifest`.

To try it without installing: `nix run github:Coloursplash/manifest`.

Film/TV search needs a free [TMDB](https://www.themoviedb.org/settings/api) key and game
search a free [RAWG](https://rawg.io/apidocs) key — add them in Settings, or set
`TMDB_API_KEY` / `RAWG_API_KEY`. Anime, manga, books and music need no key.

## Develop

```sh
nix develop            # dev shell: Rust, Node, the Tauri CLI
npm install            # first time only
npm run tauri dev      # run the app
npm test               # frontend tests
(cd src-tauri && cargo test)   # backend tests
nix flake check        # both suites, hermetically
nix build              # the release app → ./result
```

## Layout

```
src-tauri/src/
  library/     db.rs (the SQLite library), import.rs (legacy .toml), schema.rs
  fetch/       metadata providers
  cover.rs     local cover cache
  commands.rs  Tauri command layer
  state.rs     app state + config (folder pointer, API keys)
src/
  App.tsx      app state + wiring
  views/       library grid, timeline, review, entry page, add flow (views/add), settings
  components/  pill (OmniBox), rail, log list + editor, rating, cover, …
  lib/         typed API wrappers, types, and pure logic (sort, filter, timeline, logs)
  styles/      the TE design system
```

See `GOAL.md` for the vision and `AGENTS.md` for engineering conventions and an
architecture map.

## License

MIT
