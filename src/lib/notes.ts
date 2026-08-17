// Parse the dated-log `notes` string into blocks for display. A header line is
// a date — or a *span* of dates — optionally followed by `#tags` and/or free
// text; the body is everything after it (and may be empty — a bare dated line
// is a valid "I watched it" entry).
//
// Spans exist because only film and music are single-sitting. You read a book
// over three weeks and watch a season over two months, so a block records
// `2026-03-01..2026-03-19` rather than forcing you to pick one day and invent
// the rest. We *write* `..` (trivial to hand-type in a .toml file) but accept
// the separators someone might reasonably type by hand instead.

export interface NoteBlock {
  /** First (or only) date of the block, `YYYY-MM-DD`. */
  date: string;
  /** Last date, when the block spans a range. Absent for a single day. */
  end?: string;
  tags: string[];
  /** Any non-tag remainder of the header line (e.g. legacy "(IMAX)"). */
  rest: string;
  body: string;
}

const DATE = String.raw`\d{4}-\d{2}-\d{2}`;
/** `..`, an arrow/dash, or the word "to" — written as `..`, read liberally. */
const SEP = String.raw`\s*(?:\.\.|→|–|—|-|to)\s*`;
const HEADER = new RegExp(`^(${DATE})(?:${SEP}(${DATE}))?`);

export function parseNotes(notes: string | undefined): NoteBlock[] {
  if (!notes || !notes.trim()) return [];
  return notes
    .trim()
    .split(/\n\s*\n/)
    .map((chunk) => {
      const lines = chunk.split("\n");
      const header = (lines[0] ?? "").trim();
      const body = lines.slice(1).join("\n").trim();

      const dateMatch = header.match(HEADER);
      const date = dateMatch ? dateMatch[1] : "";
      // A span that ends where it starts is just a day.
      const end = dateMatch && dateMatch[2] && dateMatch[2] !== date ? dateMatch[2] : undefined;
      const afterDate = dateMatch ? header.slice(dateMatch[0].length) : header;

      const tags = Array.from(afterDate.matchAll(/#([\w-]+)/g)).map((m) => m[1]);
      const rest = afterDate.replace(/#[\w-]+/g, "").trim();

      return { date, end, tags, rest, body };
    })
    .filter((b) => b.date || b.rest || b.body || b.tags.length);
}

/** Today as `YYYY-MM-DD` in local time, for prefilling the log form. */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** How a block's dates read in the UI: one date, or "start → end". */
export function formatSpan(date: string, end?: string): string {
  return end && end !== date ? `${date} → ${end}` : date;
}

/** Whether `day` falls inside a block's span (inclusive). ISO dates compare
 *  correctly as strings, which is the whole reason for the format. */
export function spanCovers(block: Pick<NoteBlock, "date" | "end">, day: string): boolean {
  if (!block.date) return false;
  if (!block.end) return block.date === day;
  return day >= block.date && day <= block.end;
}
