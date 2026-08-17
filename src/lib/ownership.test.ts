import { describe, it, expect, beforeEach } from "vitest";

import {
  DEFAULT_OWNED_MEDIA,
  getOwnedMedia,
  isOwned,
  saveOwnedMedia,
  toggleOwnedMedium,
} from "./ownership";

const KEY = "manifest-owned-media";

beforeEach(() => localStorage.clear());

describe("getOwnedMedia", () => {
  it("defaults to games only when nothing is saved", () => {
    expect(getOwnedMedia()).toEqual(["game"]);
    expect(DEFAULT_OWNED_MEDIA).toEqual(["game"]);
  });

  it("reads a saved set back in canonical media order", () => {
    localStorage.setItem(KEY, JSON.stringify(["book", "game"]));
    // MEDIA order is film, tv, anime, book, manga, game, music
    expect(getOwnedMedia()).toEqual(["book", "game"]);
  });

  it("treats an empty saved array as 'off everywhere', not as missing", () => {
    localStorage.setItem(KEY, JSON.stringify([]));
    expect(getOwnedMedia()).toEqual([]);
  });

  it("drops unknown media from a saved set", () => {
    localStorage.setItem(KEY, JSON.stringify(["game", "vhs"]));
    expect(getOwnedMedia()).toEqual(["game"]);
  });

  it("falls back to the default on malformed json or a non-array", () => {
    localStorage.setItem(KEY, "not json");
    expect(getOwnedMedia()).toEqual(["game"]);
    localStorage.setItem(KEY, JSON.stringify({ game: true }));
    expect(getOwnedMedia()).toEqual(["game"]);
  });
});

describe("saveOwnedMedia", () => {
  it("normalises to canonical order and persists", () => {
    expect(saveOwnedMedia(["music", "book", "film"])).toEqual(["film", "book", "music"]);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(["film", "book", "music"]);
  });
});

describe("toggleOwnedMedium", () => {
  it("turns a medium on and back off, persisting each time", () => {
    expect(toggleOwnedMedium("book")).toEqual(["book", "game"]);
    expect(getOwnedMedia()).toEqual(["book", "game"]);

    expect(toggleOwnedMedium("game")).toEqual(["book"]);
    expect(getOwnedMedia()).toEqual(["book"]);
  });

  it("can empty the set entirely", () => {
    expect(toggleOwnedMedium("game")).toEqual([]);
    expect(getOwnedMedia()).toEqual([]);
  });
});

describe("isOwned", () => {
  it("only counts an explicit true", () => {
    expect(isOwned({ owned: true })).toBe(true);
    expect(isOwned({ owned: false })).toBe(false);
    expect(isOwned({})).toBe(false);
  });
});
