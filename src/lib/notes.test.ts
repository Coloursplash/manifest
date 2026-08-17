import { describe, it, expect, vi, afterEach } from "vitest";
import { formatSpan, parseNotes, spanCovers, todayISO } from "./notes";

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

// Only film and music happen in one sitting. A block can therefore carry a
// span, written `START..END`, so "I read it over March" is expressible without
// picking one day and inventing the rest.
describe("spanned blocks", () => {
  it("parses a START..END header", () => {
    const [b] = parseNotes("2026-03-01..2026-03-19 #reread\nSlowly.");
    expect(b).toEqual({
      date: "2026-03-01",
      end: "2026-03-19",
      tags: ["reread"],
      rest: "",
      body: "Slowly.",
    });
  });

  it("accepts the separators someone might hand-type instead", () => {
    for (const sep of ["..", " → ", " – ", " — ", " - ", " to "]) {
      const [b] = parseNotes(`2026-03-01${sep}2026-03-19`);
      expect(b.date, sep).toBe("2026-03-01");
      expect(b.end, sep).toBe("2026-03-19");
    }
  });

  it("treats a span that ends where it starts as a single day", () => {
    const [b] = parseNotes("2026-03-01..2026-03-01");
    expect(b.date).toBe("2026-03-01");
    expect(b.end).toBeUndefined();
  });

  it("leaves a plain dated block without an end", () => {
    expect(parseNotes("2026-03-01 #rewatch")[0].end).toBeUndefined();
  });

  it("doesn't mistake trailing prose for a range", () => {
    const [b] = parseNotes("2026-03-01 took a while");
    expect(b.end).toBeUndefined();
    expect(b.rest).toBe("took a while");
  });
});

describe("formatSpan / spanCovers", () => {
  it("shows one date, or an arrowed range", () => {
    expect(formatSpan("2026-03-01")).toBe("2026-03-01");
    expect(formatSpan("2026-03-01", "2026-03-01")).toBe("2026-03-01");
    expect(formatSpan("2026-03-01", "2026-03-19")).toBe("2026-03-01 → 2026-03-19");
  });

  it("covers every day of a span, inclusive", () => {
    const span = { date: "2026-03-01", end: "2026-03-19" };
    expect(spanCovers(span, "2026-03-01")).toBe(true);
    expect(spanCovers(span, "2026-03-10")).toBe(true);
    expect(spanCovers(span, "2026-03-19")).toBe(true);
    expect(spanCovers(span, "2026-02-28")).toBe(false);
    expect(spanCovers(span, "2026-03-20")).toBe(false);
  });

  it("covers only the day itself without an end, and nothing when undated", () => {
    expect(spanCovers({ date: "2026-03-01" }, "2026-03-01")).toBe(true);
    expect(spanCovers({ date: "2026-03-01" }, "2026-03-02")).toBe(false);
    expect(spanCovers({ date: "" }, "2026-03-01")).toBe(false);
  });
});
