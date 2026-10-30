// Shared test fixture: build an Entry with sensible defaults, override any field.
import type { Entry, LogEntry, Medium } from "../lib/types";

let seq = 0;

/** A log row for fixtures. Ids are unique within a run. */
export function makeLog(date: string, rest: Partial<Omit<LogEntry, "date">> = {}): LogEntry {
  return { id: ++logSeq, date, tags: [], body: "", ...rest };
}
let logSeq = 0;

export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  const medium: Medium = overrides.medium ?? "film";
  const slug = overrides.slug ?? `entry-${seq++}`;
  return {
    id: `${medium}/${slug}`,
    medium,
    slug,
    title: "Untitled",
    logs: [],
    ...overrides,
  };
}
