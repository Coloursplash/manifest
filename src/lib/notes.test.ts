import { describe, it, expect, vi, afterEach } from "vitest";
import { parseNotes, todayISO } from "./notes";

describe("parseNotes", () => {
  it("returns [] for empty/whitespace/undefined", () => {
    expect(parseNotes(undefined)).toEqual([]);
    expect(parseNotes("")).toEqual([]);
    expect(parseNotes("   \n  \n")).toEqual([]);
  });

  it("parses a single dated block with a body", () => {
    const blocks = parseNotes("2026-07-09\nGreat sound design.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      date: "2026-07-09",
      tags: [],
      rest: "",
      body: "Great sound design.",
    });
  });

  it("treats a bare dated line (no body) as a valid entry", () => {
    const blocks = parseNotes("2026-07-09");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].date).toBe("2026-07-09");
    expect(blocks[0].body).toBe("");
  });

  it("extracts #tags from the header and strips them out of `rest`", () => {
    const blocks = parseNotes("2026-07-09 #rewatch #imax\nbody");
    expect(blocks[0].tags).toEqual(["rewatch", "imax"]);
    expect(blocks[0].rest).toBe("");
    expect(blocks[0].body).toBe("body");
  });

  it("keeps non-tag header remainder in `rest` (legacy parenthetical context)", () => {
    const blocks = parseNotes("2026-07-09 (IMAX)\nbody");
    expect(blocks[0].rest).toBe("(IMAX)");
    expect(blocks[0].tags).toEqual([]);
  });

  it("splits multiple blocks on blank lines, newest-declared order preserved", () => {
    const notes = "2017-10-06\nfirst watch\n\n2026-07-09 #rewatch\nsecond watch";
    const blocks = parseNotes(notes);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].date).toBe("2017-10-06");
    expect(blocks[1].date).toBe("2026-07-09");
    expect(blocks[1].tags).toEqual(["rewatch"]);
  });

  it("tolerates extra whitespace between blocks", () => {
    const blocks = parseNotes("2026-01-01\na\n \n2026-02-02\nb");
    expect(blocks.map((b) => b.date)).toEqual(["2026-01-01", "2026-02-02"]);
  });

  it("preserves multi-line bodies verbatim", () => {
    const blocks = parseNotes("2026-07-09\nline one\nline two");
    expect(blocks[0].body).toBe("line one\nline two");
  });

  it("keeps a headerless free-text block (no date) as `rest`", () => {
    const blocks = parseNotes("just some loose text");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].date).toBe("");
    expect(blocks[0].rest).toBe("just some loose text");
  });
});

describe("todayISO", () => {
  afterEach(() => vi.useRealTimers());

  it("formats local date as YYYY-MM-DD with zero-padding", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0)); // Jan 5 2026, local
    expect(todayISO()).toBe("2026-01-05");
  });
});
