import { describe, it, expect } from "vitest";
import { buildTimeline, groupByMonth } from "./timeline";
import { makeEntry, makeLog } from "../test/entry";

describe("buildTimeline", () => {
  it("emits one event per log", () => {
    const e = makeEntry({
      title: "Blade Runner 2049",
      logs: [
        makeLog("2017-10-06", { body: "first" }),
        makeLog("2026-07-09", { tags: ["rewatch"], body: "second" }),
      ],
    });
    const events = buildTimeline([e]);
    expect(events).toHaveLength(2);
    expect(events.every((ev) => ev.kind === "log")).toBe(true);
  });

  it("flags rewatch/reread blocks as repeat (case-insensitive)", () => {
    const e = makeEntry({ logs: [makeLog("2026-07-09", { tags: ["REWATCH"], body: "x" })] });
    expect(buildTimeline([e])[0].repeat).toBe(true);
  });

  it("flags every medium's repeat tag, not just film and book", () => {
    const game = makeEntry({ medium: "game", logs: [makeLog("2026-07-09", { tags: ["replay"] })] });
    const album = makeEntry({ medium: "music", logs: [makeLog("2026-07-08", { tags: ["relisten"] })] });
    expect(buildTimeline([game, album]).map((ev) => ev.repeat)).toEqual([true, true]);
  });

  it("adds a `finished`-date fallback event when no block covers that day", () => {
    const e = makeEntry({ finished: "2026-05-01" });
    const events = buildTimeline([e]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "finished", date: "2026-05-01" });
  });

  it("does NOT duplicate when a log block already covers the finished date", () => {
    const e = makeEntry({
      finished: "2026-07-09",
      logs: [makeLog("2026-07-09", { body: "watched it" })],
    });
    const events = buildTimeline([e]);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("log");
  });

  it("ignores entries with neither a log nor a finished date", () => {
    const e = makeEntry({ status: "want" });
    expect(buildTimeline([e])).toEqual([]);
  });

  it("sorts newest-first, breaking date ties by title", () => {
    const a = makeEntry({ title: "Zed", finished: "2026-07-09" });
    const b = makeEntry({ title: "Alpha", finished: "2026-07-09" });
    const c = makeEntry({ title: "Older", finished: "2020-01-01" });
    const events = buildTimeline([a, b, c]);
    expect(events.map((e) => e.entry.title)).toEqual(["Alpha", "Zed", "Older"]);
  });
});

describe("groupByMonth", () => {
  it("buckets events into month → day groups", () => {
    const e1 = makeEntry({ finished: "2026-07-09" });
    const e2 = makeEntry({ finished: "2026-07-09" });
    const e3 = makeEntry({ finished: "2026-06-01" });
    const groups = groupByMonth(buildTimeline([e1, e2, e3]));
    expect(groups.map((g) => g.key)).toEqual(["2026-07", "2026-06"]);
    expect(groups[0].label).toBe("JUL 2026");
    // both July events land on the same day group
    expect(groups[0].days).toHaveLength(1);
    expect(groups[0].days[0].events).toHaveLength(2);
    expect(groups[0].days[0].day).toBe("09");
  });

  it("marks the first (newest) month of each year with startsYear", () => {
    const groups = groupByMonth(
      buildTimeline([
        makeEntry({ finished: "2026-07-01" }),
        makeEntry({ finished: "2026-03-01" }),
        makeEntry({ finished: "2025-12-01" }),
      ]),
    );
    expect(groups.map((g) => g.startsYear)).toEqual([true, false, true]);
  });

  it("tallies per-medium counts within a month", () => {
    const groups = groupByMonth(
      buildTimeline([
        makeEntry({ medium: "film", finished: "2026-07-01" }),
        makeEntry({ medium: "film", finished: "2026-07-02" }),
        makeEntry({ medium: "book", finished: "2026-07-03" }),
      ]),
    );
    const counts = Object.fromEntries(
      groups[0].counts.map((c) => [c.medium, c.n]),
    );
    expect(counts).toEqual({ film: 2, book: 1 });
  });

  it("computes the weekday of a day group in local time", () => {
    // 2026-07-09 is a Thursday.
    const groups = groupByMonth(buildTimeline([makeEntry({ finished: "2026-07-09" })]));
    expect(groups[0].days[0].weekday).toBe("THU");
  });

  it("returns [] for no events", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

// A block that ran over days belongs on the day it *ended* — that's the "I
// finished it" moment a diary records — while still saying where it started.
describe("spanned log blocks", () => {
  it("lands the event on the end date and carries the start", () => {
    const e = makeEntry({ logs: [makeLog("2026-03-01", { end: "2026-03-19", body: "Read it slowly." })] });
    const [ev] = buildTimeline([e]);
    expect(ev.date).toBe("2026-03-19");
    expect(ev.from).toBe("2026-03-01");
  });

  it("leaves `from` unset for a single-day block", () => {
    expect(buildTimeline([makeEntry({ logs: [makeLog("2026-03-19")] })])[0].from).toBeUndefined();
  });

  it("counts a `finished` date inside the span as already covered", () => {
    // Finished mid-stretch — one event, not a phantom second row.
    const e = makeEntry({ logs: [makeLog("2026-03-01", { end: "2026-03-19" })], finished: "2026-03-10" });
    const events = buildTimeline([e]);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("log");
  });

  it("still adds the fallback when `finished` falls outside every span", () => {
    const e = makeEntry({ logs: [makeLog("2026-03-01", { end: "2026-03-19" })], finished: "2026-05-02" });
    const events = buildTimeline([e]);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "finished", date: "2026-05-02" });
  });

  it("sorts a span by its end date, alongside single-day events", () => {
    const dates = buildTimeline([
      makeEntry({ id: "book/a", title: "A", logs: [makeLog("2026-03-01", { end: "2026-03-19" })] }),
      makeEntry({ id: "film/b", title: "B", logs: [makeLog("2026-03-05")] }),
    ]).map((ev) => ev.date);
    expect(dates).toEqual(["2026-03-19", "2026-03-05"]);
  });
});
