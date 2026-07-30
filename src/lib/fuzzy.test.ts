import { describe, it, expect } from "vitest";

import { fuzzyMatch, fuzzyRank } from "./fuzzy";

describe("fuzzyMatch", () => {
  it("matches a subsequence and reports the matched indices", () => {
    const m = fuzzyMatch("br", "Blade Runner");
    expect(m).not.toBeNull();
    expect(m!.indices).toEqual([0, 6]); // 'B' then the 'R' of Runner
  });

  it("returns null when the query is not a subsequence", () => {
    expect(fuzzyMatch("xyz", "Blade Runner")).toBeNull();
    expect(fuzzyMatch("brr", "Blade Runner")).not.toBeNull();
    expect(fuzzyMatch("brrr", "Blade Runner")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(fuzzyMatch("BLADE", "blade runner")).not.toBeNull();
  });

  it("treats an empty query as a match of everything, score 0", () => {
    expect(fuzzyMatch("", "anything")).toEqual({ score: 0, indices: [] });
    expect(fuzzyMatch("   ", "anything")?.score).toBe(0);
  });

  it("scores a prefix higher than a mid-word match", () => {
    const prefix = fuzzyMatch("set", "Settings")!;
    const mid = fuzzyMatch("set", "Reset something")!;
    expect(prefix.score).toBeGreaterThan(mid.score);
  });

  it("scores word-start hits above scattered ones", () => {
    const wordStart = fuzzyMatch("tv", "Timeline View")!; // T…V, both word starts
    const scattered = fuzzyMatch("tv", "attentive")!;
    expect(wordStart.score).toBeGreaterThan(scattered.score);
  });
});

describe("fuzzyRank", () => {
  const items = ["Add entry", "Open settings", "Timeline view", "Grid view"];

  it("returns items unchanged for an empty query", () => {
    expect(fuzzyRank(items, "", (s) => s)).toEqual(items);
  });

  it("filters out non-matches and ranks best first", () => {
    const out = fuzzyRank(items, "view", (s) => s);
    // both end in "view" (word-start match); the shorter title ranks higher.
    expect(out).toEqual(["Grid view", "Timeline view"]);
  });

  it("is stable for equal scores (input order preserved)", () => {
    // 'a' sits mid-word in both, same length → identical score; keep input order.
    const out = fuzzyRank(["cat", "bat"], "a", (s) => s);
    expect(out).toEqual(["cat", "bat"]);
  });
});
