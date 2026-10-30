// Flatten the library into a dated diary — a Letterboxd-style timeline built
// purely on the client from data already loaded. Two event sources:
//   1. every log on an entry (so a #rewatch / #reread is its own event), and
//   2. an entry's `finished` date, as a fallback — but only when no log block
//      already covers that day (avoids a duplicate row for the same sitting).
// A block that spans days (a book read over three weeks) lands on the day it
// *ended* — that's the "I finished it" moment a diary records — and carries its
// range along for the card to show.
// Entries with neither a dated log nor a `finished` date don't appear.

import { spanCovers } from "./logs";
import { VERBS, type Entry, type Medium } from "./types";

/** Tags that mark a repeat (#rewatch, #reread, #replay, #relisten), surfaced
 *  with a ↻ marker. Taken from VERBS so every medium's repeat tag counts. */
const REPEAT_TAGS = new Set(Object.values(VERBS).map((v) => v.repeat));

export interface TimelineEvent {
  date: string; // YYYY-MM-DD, always present — the day it ended
  /** Set when the block spanned more than a day: where it started. */
  from?: string;
  entry: Entry;
  kind: "log" | "finished";
  tags: string[]; // from the log block ("rewatch", …)
  body: string; // the log note body (may be empty)
  repeat: boolean; // tagged rewatch/reread
}

/** All dated events across the given entries, newest first. */
export function buildTimeline(entries: Entry[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const entry of entries) {
    const blocks = entry.logs ?? [];

    for (const block of blocks) {
      events.push({
        date: block.end ?? block.date,
        from: block.end ? block.date : undefined,
        entry,
        kind: "log",
        tags: block.tags,
        body: block.body,
        repeat: block.tags.some((t) => REPEAT_TAGS.has(t.toLowerCase())),
      });
    }

    // Anywhere inside a span counts as covered — a `finished` date that falls
    // in the middle of the stretch you logged isn't a second event.
    if (entry.finished && !blocks.some((b) => spanCovers(b, entry.finished!))) {
      events.push({
        date: entry.finished,
        entry,
        kind: "finished",
        tags: [],
        body: "",
        repeat: false,
      });
    }
  }

  events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1; // date desc
    return a.entry.title
      .toLowerCase()
      .localeCompare(b.entry.title.toLowerCase());
  });

  return events;
}

/** One day's worth of events — rendered as a row of cards on the timeline. */
export interface DayGroup {
  date: string; // YYYY-MM-DD
  day: string; // "27"
  weekday: string; // "MON"
  events: TimelineEvent[];
}

export interface MonthGroup {
  key: string; // "2026-07"
  year: number;
  month: number; // 0-11
  label: string; // "JUL 2026"
  days: DayGroup[];
  counts: { medium: Medium; n: number }[];
  startsYear: boolean; // first (newest) month of a year — render a year divider
}

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** Weekday label from a YYYY-MM-DD string, computed in local time. */
function weekdayOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? "";
}

/** Bucket already-sorted (date-desc) events into month → day groups. */
export function groupByMonth(events: TimelineEvent[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  let curMonth: MonthGroup | null = null;
  let curDay: DayGroup | null = null;
  let lastYear: number | null = null;

  for (const ev of events) {
    const year = Number(ev.date.slice(0, 4));
    const month = Number(ev.date.slice(5, 7)) - 1;
    const key = ev.date.slice(0, 7);

    if (!curMonth || curMonth.key !== key) {
      curMonth = {
        key,
        year,
        month,
        label: `${MONTHS[month] ?? "?"} ${year}`,
        days: [],
        counts: [],
        startsYear: year !== lastYear,
      };
      groups.push(curMonth);
      lastYear = year;
      curDay = null;
    }

    if (!curDay || curDay.date !== ev.date) {
      curDay = {
        date: ev.date,
        day: ev.date.slice(8, 10),
        weekday: weekdayOf(ev.date),
        events: [],
      };
      curMonth.days.push(curDay);
    }
    curDay.events.push(ev);
  }

  for (const g of groups) {
    const tally = new Map<Medium, number>();
    for (const d of g.days) {
      for (const ev of d.events) {
        tally.set(ev.entry.medium, (tally.get(ev.entry.medium) ?? 0) + 1);
      }
    }
    g.counts = [...tally.entries()].map(([medium, n]) => ({ medium, n }));
  }

  return groups;
}
