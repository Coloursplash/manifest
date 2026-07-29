import { describe, it, expect, beforeEach } from "vitest";
import { sortEntries, getSort, setSort, type SortKey } from "./sort";
import { makeEntry } from "../test/entry";

const titles = (es: { title: string }[]) => es.map((e) => e.title);

describe("sortEntries", () => {
  it("does not mutate the input array", () => {
    const input = [makeEntry({ title: "B" }), makeEntry({ title: "A" })];
    const before = [...input];
    sortEntries(input, "title");
    expect(input).toEqual(before);
  });

  it("sorts by title A–Z and Z–A (case-insensitive)", () => {
    const es = [makeEntry({ title: "banana" }), makeEntry({ title: "Apple" })];
    expect(titles(sortEntries(es, "title"))).toEqual(["Apple", "banana"]);
    expect(titles(sortEntries(es, "title-desc"))).toEqual(["banana", "Apple"]);
  });

  it("sorts recently finished/started descending, missing dates last", () => {
    const es = [
      makeEntry({ title: "none" }),
      makeEntry({ title: "old", finished: "2020-01-01" }),
      makeEntry({ title: "new", finished: "2026-01-01" }),
    ];
    expect(titles(sortEntries(es, "finished"))).toEqual(["new", "old", "none"]);
  });

  it("sorts by release year both directions, missing year last in both", () => {
    const es = [
      makeEntry({ title: "no-year" }),
      makeEntry({ title: "1999", year: 1999 }),
      makeEntry({ title: "2020", year: 2020 }),
    ];
    expect(titles(sortEntries(es, "released"))).toEqual(["2020", "1999", "no-year"]);
    expect(titles(sortEntries(es, "released-asc"))).toEqual(["1999", "2020", "no-year"]);
  });

  it("sorts by rating both directions, unrated last in both", () => {
    const es = [
      makeEntry({ title: "unrated" }),
      makeEntry({ title: "low", rating: 2 }),
      makeEntry({ title: "high", rating: 9 }),
    ];
    expect(titles(sortEntries(es, "score"))).toEqual(["high", "low", "unrated"]);
    expect(titles(sortEntries(es, "score-asc"))).toEqual(["low", "high", "unrated"]);
  });

  it("breaks numeric ties by title", () => {
    const es = [
      makeEntry({ title: "Zed", year: 2000 }),
      makeEntry({ title: "Ace", year: 2000 }),
    ];
    expect(titles(sortEntries(es, "released"))).toEqual(["Ace", "Zed"]);
  });

  it("treats rating 0 as present (not missing)", () => {
    const es = [makeEntry({ title: "zero", rating: 0 }), makeEntry({ title: "none" })];
    // zero is a real score → sorts ahead of the unrated entry
    expect(titles(sortEntries(es, "score-asc"))).toEqual(["zero", "none"]);
  });
});

describe("getSort/setSort persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to 'title' when nothing stored", () => {
    expect(getSort()).toBe("title");
  });

  it("round-trips a valid key through localStorage", () => {
    setSort("score");
    expect(getSort()).toBe("score");
  });

  it("falls back to 'title' for an unknown stored value", () => {
    localStorage.setItem("manifest-sort", "bogus" as SortKey);
    expect(getSort()).toBe("title");
  });
});
