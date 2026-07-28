// Mirrors the Rust schema (src-tauri/src/library/schema.rs and fetch/mod.rs).
// Keep these in sync with the backend by hand — they're the contract.

export type Medium = "film" | "tv" | "anime" | "book" | "manga";
export type Status = "want" | "active" | "done" | "dropped" | "paused";

export const MEDIA: Medium[] = ["film", "tv", "anime", "book", "manga"];
export const STATUSES: Status[] = ["want", "active", "done", "dropped", "paused"];

export const MEDIUM_LABEL: Record<Medium, string> = {
  film: "Films",
  tv: "TV",
  anime: "Anime",
  book: "Books",
  manga: "Manga",
};

// Status names read differently per medium ("Reading" vs "Watching").
const STATUS_VERB: Record<Medium, Record<Status, string>> = {
  film: { want: "Plan to watch", active: "Watching", done: "Watched", dropped: "Abandoned", paused: "On hold" },
  tv: { want: "Plan to watch", active: "Watching", done: "Watched", dropped: "Dropped", paused: "On hold" },
  anime: { want: "Plan to watch", active: "Watching", done: "Watched", dropped: "Dropped", paused: "On hold" },
  book: { want: "Plan to read", active: "Reading", done: "Read", dropped: "Dropped", paused: "On hold" },
  manga: { want: "Plan to read", active: "Reading", done: "Read", dropped: "Dropped", paused: "On hold" },
};

export const statusLabel = (medium: Medium, status: Status): string =>
  STATUS_VERB[medium][status];

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
  started?: string; // YYYY-MM-DD
  finished?: string; // YYYY-MM-DD
  progress?: number; // page / episode / chapter
  season?: number;
  notes?: string;
  extra?: Record<string, unknown>; // per-medium + hand-added keys (incl. totals)
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
  notes?: string;
}
