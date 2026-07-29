import { describe, it, expect, beforeEach } from "vitest";
import {
  getMediaOrder,
  getEnabledMedia,
  saveEnabledMedia,
  saveMediaOrder,
} from "./media";
import { MEDIA } from "./types";

const KEY = "manifest-enabled-media";
beforeEach(() => localStorage.clear());

describe("defaults", () => {
  it("enables all media in canonical order when nothing is stored", () => {
    expect(getMediaOrder()).toEqual(MEDIA);
    expect(getEnabledMedia()).toEqual(MEDIA);
  });
});

describe("migration", () => {
  it("migrates a legacy bare enabled-array, auto-enabling media added since", () => {
    // Pre-games/music save: only film + tv were on.
    localStorage.setItem(KEY, JSON.stringify(["film", "tv"]));
    // film/tv keep their state; the post-legacy media (game, music) auto-enable.
    expect(getEnabledMedia()).toEqual(["film", "tv", "game", "music"]);
    // order always covers the full MEDIA set.
    expect(getMediaOrder()).toEqual(MEDIA);
  });

  it("keeps an intentionally-disabled medium disabled when `known` covers it", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ enabled: ["film"], known: MEDIA }),
    );
    expect(getEnabledMedia()).toEqual(["film"]);
  });

  it("falls back to all-on for a corrupt payload", () => {
    localStorage.setItem(KEY, "{broken");
    expect(getEnabledMedia()).toEqual(MEDIA);
  });

  it("drops unknown media strings from a saved order", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ order: ["book", "bogus", "film"], enabled: ["book"], known: MEDIA }),
    );
    const order = getMediaOrder();
    expect(order).not.toContain("bogus");
    expect(order.slice(0, 2)).toEqual(["book", "film"]);
    expect(order).toHaveLength(MEDIA.length);
  });
});

describe("saveEnabledMedia", () => {
  it("persists the enabled subset in the user's order", () => {
    const enabled = saveEnabledMedia(["book", "film"]);
    // returned/persisted in canonical order (default order)
    expect(enabled).toEqual(["film", "book"]);
    expect(getEnabledMedia()).toEqual(["film", "book"]);
  });

  it("ignores an empty enabled set (at least one medium stays on)", () => {
    expect(saveEnabledMedia([])).toEqual(MEDIA);
  });
});

describe("saveMediaOrder", () => {
  it("reorders and reorders the enabled subset to match", () => {
    saveEnabledMedia(["film", "book"]);
    const state = saveMediaOrder(["book", "film", "tv", "anime", "manga", "game", "music"]);
    expect(state.order[0]).toBe("book");
    // enabled follows the new order: book before film
    expect(state.enabled).toEqual(["book", "film"]);
    expect(getEnabledMedia()).toEqual(["book", "film"]);
  });

  it("appends any MEDIA missing from the given order", () => {
    const state = saveMediaOrder(["music"]);
    expect(state.order[0]).toBe("music");
    expect([...state.order].sort()).toEqual([...MEDIA].sort());
  });
});
