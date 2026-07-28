// Parse the dated-log `notes` string into blocks for display. A header line is
// `YYYY-MM-DD` optionally followed by `#tags` and/or free text; the body is
// everything after it (and may be empty — a bare dated line is a valid "I
// watched it" entry).

export interface NoteBlock {
  date: string;
  tags: string[];
  /** Any non-tag remainder of the header line (e.g. legacy "(IMAX)"). */
  rest: string;
  body: string;
}

export function parseNotes(notes: string | undefined): NoteBlock[] {
  if (!notes || !notes.trim()) return [];
  return notes
    .trim()
    .split(/\n\s*\n/)
    .map((chunk) => {
      const lines = chunk.split("\n");
      const header = (lines[0] ?? "").trim();
      const body = lines.slice(1).join("\n").trim();

      const dateMatch = header.match(/^(\d{4}-\d{2}-\d{2})/);
      const date = dateMatch ? dateMatch[1] : "";
      const afterDate = dateMatch ? header.slice(dateMatch[1].length) : header;

      const tags = Array.from(afterDate.matchAll(/#([\w-]+)/g)).map((m) => m[1]);
      const rest = afterDate.replace(/#[\w-]+/g, "").trim();

      return { date, tags, rest, body };
    })
    .filter((b) => b.date || b.rest || b.body || b.tags.length);
}

/** Today as `YYYY-MM-DD` in local time, for prefilling the log form. */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
