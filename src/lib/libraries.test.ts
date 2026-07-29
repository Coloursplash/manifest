import { describe, it, expect, beforeEach } from "vitest";
import {
  basename,
  getLibraries,
  recordLibrary,
  renameLibrary,
  removeLibrary,
  nameFor,
} from "./libraries";

beforeEach(() => localStorage.clear());

describe("basename", () => {
  it("returns the last segment for POSIX and Windows paths", () => {
    expect(basename("/home/chris/media")).toBe("media");
    expect(basename("C:\\Users\\chris\\media")).toBe("media");
  });
  it("ignores trailing separators", () => {
    expect(basename("/home/chris/media/")).toBe("media");
  });
  it("returns the input when there is no separator", () => {
    expect(basename("media")).toBe("media");
  });
});

describe("getLibraries", () => {
  it("returns [] when nothing is stored", () => {
    expect(getLibraries()).toEqual([]);
  });
  it("returns [] on malformed JSON", () => {
    localStorage.setItem("manifest-libraries", "{not json");
    expect(getLibraries()).toEqual([]);
  });
  it("filters out entries missing path/name", () => {
    localStorage.setItem(
      "manifest-libraries",
      JSON.stringify([{ path: "/a", name: "A" }, { path: "/b" }, null, "x"]),
    );
    expect(getLibraries()).toEqual([{ path: "/a", name: "A" }]);
  });
});

describe("recordLibrary", () => {
  it("adds a new library most-recent-first, defaulting the name to basename", () => {
    recordLibrary("/home/chris/films");
    expect(getLibraries()).toEqual([{ path: "/home/chris/films", name: "films" }]);
  });

  it("moves an existing path to the front and preserves its nickname", () => {
    recordLibrary("/a");
    recordLibrary("/b");
    renameLibrary("/a", "Alpha");
    recordLibrary("/a");
    const libs = getLibraries();
    expect(libs.map((l) => l.path)).toEqual(["/a", "/b"]);
    expect(libs[0].name).toBe("Alpha");
  });

  it("caps the list at 8, dropping the oldest", () => {
    for (let i = 0; i < 10; i++) recordLibrary(`/lib-${i}`);
    const libs = getLibraries();
    expect(libs).toHaveLength(8);
    expect(libs[0].path).toBe("/lib-9"); // newest first
    expect(libs.some((l) => l.path === "/lib-0")).toBe(false); // oldest dropped
  });
});

describe("renameLibrary", () => {
  it("sets a nickname", () => {
    recordLibrary("/a");
    renameLibrary("/a", "  My Films  ");
    expect(getLibraries()[0].name).toBe("My Films");
  });
  it("empty/whitespace name falls back to basename", () => {
    recordLibrary("/home/chris/tv");
    renameLibrary("/home/chris/tv", "   ");
    expect(getLibraries()[0].name).toBe("tv");
  });
});

describe("removeLibrary", () => {
  it("drops the matching path only", () => {
    recordLibrary("/a");
    recordLibrary("/b");
    removeLibrary("/a");
    expect(getLibraries().map((l) => l.path)).toEqual(["/b"]);
  });
});

describe("nameFor", () => {
  it("returns '' for a null path", () => {
    expect(nameFor(null, [])).toBe("");
  });
  it("returns the stored nickname when present", () => {
    const list = [{ path: "/a", name: "Alpha" }];
    expect(nameFor("/a", list)).toBe("Alpha");
  });
  it("falls back to basename when the path is not in the list", () => {
    expect(nameFor("/home/chris/games", [])).toBe("games");
  });
});
