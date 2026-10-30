import { describe, it, expect } from "vitest";

import { makeEntry } from "../test/entry";
import { filterEntries } from "./filter";

const lib = [
  makeEntry({ title: "Arrival", medium: "film", year: 2016, extra: { director: "Denis Villeneuve" } }),
  makeEntry({ title: "Dune", medium: "book", tags: ["sci-fi"] }),
  makeEntry({ title: "Dune", medium: "film", year: 2021 }),
];
const titles = (es: { title: string; medium: string }[]) => es.map((e) => `${e.medium}:${e.title}`);

describe("filterEntries", () => {
  it("keeps everything for an empty query and no medium", () => {
    expect(filterEntries(lib, null, "  ")).toHaveLength(3);
  });

  it("filters by medium", () => {
    expect(titles(filterEntries(lib, "book", ""))).toEqual(["book:Dune"]);
  });

  it("matches title, year, tags and metadata, case-insensitively", () => {
    expect(titles(filterEntries(lib, null, "DUNE"))).toEqual(["book:Dune", "film:Dune"]);
    expect(titles(filterEntries(lib, null, "2016"))).toEqual(["film:Arrival"]);
    expect(titles(filterEntries(lib, null, "sci-fi"))).toEqual(["book:Dune"]);
    expect(titles(filterEntries(lib, null, "villeneuve"))).toEqual(["film:Arrival"]);
    expect(titles(filterEntries(lib, "film", "dune"))).toEqual(["film:Dune"]);
  });
});
