import { describe, it, expect, vi, afterEach } from "vitest";

import { makeEntry } from "../test/entry";
import {
  firstStarted,
  formatSpan,
  isDate,
  lastDone,
  normalizeTag,
  spanCovers,
  todayISO,
} from "./logs";

const log = (date: string, end?: string) => ({ id: 0, date, end, tags: [], body: "" });

describe("isDate", () => {
  it("matches the backend's rule", () => {
    expect(isDate("2026-03-01")).toBe(true);
    expect(isDate("")).toBe(false);
    expect(isDate("2026-3-01")).toBe(false);
    expect(isDate("2026-13-01")).toBe(false);
    expect(isDate("2026-03-00")).toBe(false);
  });
});

describe("normalizeTag (mirrors clean_tag in db.rs)", () => {
  it("strips #, joins words, keeps Unicode letters, lowercases", () => {
    expect(normalizeTag("#Rewatch")).toBe("rewatch");
    expect(normalizeTag("  my   tag ")).toBe("my-tag");
    expect(normalizeTag("ネタバレ")).toBe("ネタバレ");
    expect(normalizeTag("a,b!")).toBe("ab");
    expect(normalizeTag("#  ")).toBe("");
  });
});

describe("spans", () => {
  it("formatSpan shows one date or a range", () => {
    expect(formatSpan("2026-03-01")).toBe("2026-03-01");
    expect(formatSpan("2026-03-01", "2026-03-01")).toBe("2026-03-01");
    expect(formatSpan("2026-03-01", "2026-03-19")).toBe("2026-03-01 → 2026-03-19");
  });

  it("spanCovers is inclusive", () => {
    expect(spanCovers(log("2026-03-01"), "2026-03-01")).toBe(true);
    expect(spanCovers(log("2026-03-01"), "2026-03-02")).toBe(false);
    expect(spanCovers(log("2026-03-01", "2026-03-19"), "2026-03-19")).toBe(true);
    expect(spanCovers(log("2026-03-01", "2026-03-19"), "2026-03-20")).toBe(false);
  });
});

describe("lastDone / firstStarted", () => {
  it("read a film's log, which is its only record", () => {
    const film = makeEntry({ medium: "film", logs: [log("2025-01-02"), log("2026-07-09")] });
    expect(lastDone(film)).toBe("2026-07-09");
    expect(firstStarted(film)).toBe("2025-01-02");
  });

  it("take the later/earlier of the fields and the log spans", () => {
    const book = makeEntry({
      medium: "book",
      started: "2026-02-20",
      finished: "2026-02-28",
      logs: [log("2026-03-01", "2026-03-19")],
    });
    expect(lastDone(book)).toBe("2026-03-19");
    expect(firstStarted(book)).toBe("2026-02-20");
    expect(lastDone(makeEntry({}))).toBeUndefined();
  });
});

describe("todayISO", () => {
  afterEach(() => vi.useRealTimers());

  it("formats local time as YYYY-MM-DD", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 30));
    expect(todayISO()).toBe("2026-01-05");
  });
});
