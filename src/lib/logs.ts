// Helpers for an entry's dated log (`entry.logs`). Each log is one day, or a
// span (`end`) for the media you get through over time — only film and music
// are single sittings. The backend validates and stores them; these are for
// display, sorting and the editor.

import type { Entry, LogEntry } from "./types";

/** Today as `YYYY-MM-DD` in local time, for prefilling the log form. */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DD` with a plausible month and day — the same check as `is_date`
 *  in db.rs, so the editor refuses what the backend would. */
export function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/** How a log's dates read in the UI: one date, or "start → end". */
export function formatSpan(date: string, end?: string): string {
  return end && end !== date ? `${date} → ${end}` : date;
}

/** Whether `day` falls inside a log's span (inclusive). ISO dates compare
 *  correctly as strings, which is the whole reason for the format. */
export function spanCovers(log: Pick<LogEntry, "date" | "end">, day: string): boolean {
  if (!log.end) return log.date === day;
  return day >= log.date && day <= log.end;
}

/** One tag, normalised: no leading `#`, whitespace runs become `-`, only
 *  letters, digits, `_` and `-` survive, lowercased. Mirrors `clean_tag` in
 *  db.rs, so what the editor shows is what gets stored. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .trim()
    .split(/\s+/)
    .join("-")
    .replace(/[^\p{Alphabetic}\p{N}_-]/gu, "")
    .toLowerCase();
}

/** The latest day this entry was finished or logged — what "recently
 *  finished" means for every medium. A film's only record is its log (it has
 *  no `finished` field to fill), so reading `finished` alone sorts every film
 *  and album last. */
export function lastDone(e: Entry): string | undefined {
  let best = e.finished;
  for (const log of e.logs ?? []) {
    const day = log.end ?? log.date;
    if (!best || day > best) best = day;
  }
  return best;
}

/** The earliest day this entry was started or logged. */
export function firstStarted(e: Entry): string | undefined {
  let best = e.started;
  for (const log of e.logs ?? []) {
    if (!best || log.date < best) best = log.date;
  }
  return best;
}
