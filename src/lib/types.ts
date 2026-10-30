// Mirrors the Rust schema (src-tauri/src/library/schema.rs and fetch/mod.rs).
// Keep these in sync with the backend by hand — they're the contract.

export type Medium = "film" | "tv" | "anime" | "book" | "manga" | "game" | "music";
export type Status = "want" | "active" | "done" | "dropped" | "paused";

export const MEDIA: Medium[] = ["film", "tv", "anime", "book", "manga", "game", "music"];
export const STATUSES: Status[] = ["want", "active", "done", "dropped", "paused"];

export const MEDIUM_LABEL: Record<Medium, string> = {
  film: "Films",
  tv: "TV",
  anime: "Anime",
  book: "Books",
  manga: "Manga",
  game: "Games",
  music: "Music",
};

// Status names read differently per medium ("Reading" vs "Watching"). For games
// "done" is "Beaten" (100% completion is just a log entry, not a status).
const STATUS_VERB: Record<Medium, Record<Status, string>> = {
  film: { want: "Plan to watch", active: "Watching", done: "Watched", dropped: "Abandoned", paused: "On hold" },
  tv: { want: "Plan to watch", active: "Watching", done: "Watched", dropped: "Dropped", paused: "On hold" },
  anime: { want: "Plan to watch", active: "Watching", done: "Watched", dropped: "Dropped", paused: "On hold" },
  book: { want: "Plan to read", active: "Reading", done: "Read", dropped: "Dropped", paused: "On hold" },
  manga: { want: "Plan to read", active: "Reading", done: "Read", dropped: "Dropped", paused: "On hold" },
  // "Want to play" rather than "Backlog": Backlog is now a *section* (want +
  // owned) that Wishlist (want, unowned) splits off from — see lib/ownership.
  game: { want: "Want to play", active: "Playing", done: "Beaten", dropped: "Dropped", paused: "On hold" },
  music: { want: "Want to hear", active: "Listening", done: "Listened", dropped: "Dropped", paused: "On hold" },
};

export const statusLabel = (medium: Medium, status: Status): string =>
  STATUS_VERB[medium][status];

// Verbs for the notes log ("Log a watch/read/play/listen") and the repeat tag
// (#rewatch / #reread / #replay / #relisten).
export interface MediumVerbs {
  /** The whole imperative label for adding a log block — a phrase, not a noun
   *  slotted into "Log a ___". English articles don't template, and the noun
   *  that fits a medium isn't always a single sitting: a game is logged as a
   *  stretch of playtime (see PROGRESS.single), so calling it "a session" said
   *  the opposite of what the editor actually asks for. */
  log: string;
  /** Past tense, for "Just ___ it". */
  past: string;
  /** The repeat tag (without the #). */
  repeat: string;
}

export const VERBS: Record<Medium, MediumVerbs> = {
  film: { log: "Log a watch", past: "watched", repeat: "rewatch" },
  tv: { log: "Log a watch", past: "watched", repeat: "rewatch" },
  anime: { log: "Log a watch", past: "watched", repeat: "rewatch" },
  book: { log: "Log a read", past: "read", repeat: "reread" },
  manga: { log: "Log a read", past: "read", repeat: "reread" },
  game: { log: "Log playtime", past: "played", repeat: "replay" },
  music: { log: "Log a listen", past: "listened", repeat: "relisten" },
};

// Which statuses to surface as one-click "add" actions from search.
export const QUICK_STATUSES: Status[] = ["want", "active", "done"];

// How progress is shaped per medium.
export interface ProgressShape {
  /** Single-sitting media (film): just a watched date, no progress counter. */
  single: boolean;
  /** Unit of progress, e.g. "page", "episode". */
  unit?: string;
  /** `extra` key holding the total (from metadata), e.g. "pages", "episodes". */
  totalKey?: string;
  /** Show a season field (tv). */
  hasSeason: boolean;
}

export const PROGRESS: Record<Medium, ProgressShape> = {
  film: { single: true, hasSeason: false },
  tv: { single: false, unit: "episode", totalKey: "episodes", hasSeason: true },
  anime: { single: false, unit: "episode", totalKey: "episodes", hasSeason: false },
  book: { single: false, unit: "page", totalKey: "pages", hasSeason: false },
  manga: { single: false, unit: "chapter", totalKey: "chapters", hasSeason: false },
  // Games track open-ended hours played — no total, so no completion bar; % goes
  // in the log. Music is single-sitting like film (an album you queue up).
  game: { single: false, unit: "hour", hasSeason: false },
  music: { single: true, hasSeason: false },
};

export interface Entry {
  id: string; // "film/blade-runner-2049"
  medium: Medium;
  slug: string;
  title: string;
  year?: number;
  cover?: string; // remote source URL
  status?: Status;
  rating?: number;
  tags?: string[];
  /** Own a copy? Absent = not owned. Splits Backlog from Wishlist for the media
   *  you buy — see lib/ownership.ts for which media surface it. */
  owned?: boolean;
  started?: string; // YYYY-MM-DD
  finished?: string; // YYYY-MM-DD
  progress?: number; // page / episode / chapter
  season?: number;
  /** The dated log, oldest first. Each has a stable `id` the edit/delete
   *  commands address it by. */
  logs: LogEntry[];
  extra?: Record<string, unknown>; // per-medium metadata (incl. totals)
}

/** One dated block of an entry's log: a single day, or a span (`end`) for the
 *  media you get through over days or weeks. Mirrors `LogEntry` in schema.rs. */
export interface LogEntry {
  id: number;
  date: string; // YYYY-MM-DD
  end?: string; // last day of a span; never equal to `date`
  tags: string[];
  body: string;
}

export interface Candidate {
  title: string;
  year?: number;
  cover?: string;
  subtitle?: string;
  summary?: string;
  fields?: Record<string, unknown>;
  /** Provider handle for a follow-up detail fetch (crew/genres). TMDB only. */
  reference?: string;
}

export interface CreatePayload {
  medium: Medium;
  title: string;
  year?: number;
  cover?: string;
  status?: Status;
  fields?: Record<string, unknown>;
}
