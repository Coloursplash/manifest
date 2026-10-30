// Typed wrappers around the Tauri command layer. The UI talks to the backend
// only through here — no raw `invoke` in components.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";

import type { Candidate, CreatePayload, Entry, Medium } from "./types";

// --- library file ---

export const getLibraryPath = () => invoke<string | null>("get_library_path");

/** Pick an existing library file; resolves to its path, or null if cancelled. */
export const openLibrary = () => invoke<string | null>("open_library");

/** Save dialog for a new library file; resolves to its path, or null. */
export const newLibrary = () => invoke<string | null>("new_library");

/** Activate a library by path; resolves to the file it names (an old folder
 *  path resolves to the `library.sqlite` inside it). */
export const setLibrary = (path: string) => invoke<string>("set_library", { path });

// --- entries ---

export const listEntries = () => invoke<Entry[]>("list_entries");

/** What the log editor submits. `end` makes the block a span — for the media
 *  you get through over days or weeks. Omit it for a single day. */
export interface LogDraft {
  date: string;
  end?: string;
  tags: string[];
  body: string;
}

const logArgs = (d: LogDraft) => ({ date: d.date, end: d.end ?? null, tags: d.tags, body: d.body });

export const addLog = (id: string, d: LogDraft) => invoke<Entry>("add_log", { id, ...logArgs(d) });

export const updateLog = (logId: number, d: LogDraft) =>
  invoke<Entry>("update_log", { logId, ...logArgs(d) });

export const deleteLog = (logId: number) => invoke<Entry>("delete_log", { logId });

/** Set/clear fields (status, rating, dates, progress, metadata). null clears. */
export const patchEntry = (id: string, patch: Record<string, unknown>) =>
  invoke<Entry>("patch_entry", { id, patch });

export const createEntry = (payload: CreatePayload) =>
  invoke<Entry>("create_entry", { payload });

export const deleteEntry = (id: string) =>
  invoke<void>("delete_entry", { id });

// --- fetch + covers ---

export const searchMetadata = (medium: Medium, query: string) =>
  invoke<Candidate[]>("search_metadata", { medium, query });

/** Extra metadata (crew, cast, genres, runtime) for a chosen hit, fetched once
 *  on commit via its provider `reference`. Empty when no follow-up is needed. */
export const fetchDetails = (medium: Medium, reference: string) =>
  invoke<Record<string, unknown>>("fetch_details", { medium, reference });

/** Cache a remote cover locally and return the on-disk path. */
export const cacheCover = (url: string) =>
  invoke<string>("cache_cover", { url });

export const hasTmdbKey = () => invoke<boolean>("has_tmdb_key");

export const setTmdbKey = (key: string) =>
  invoke<void>("set_tmdb_key", { key });

export const hasRawgKey = () => invoke<boolean>("has_rawg_key");

export const setRawgKey = (key: string) =>
  invoke<void>("set_rawg_key", { key });

// --- covers: turn a cached path into a webview-loadable src ---

export const coverSrc = (path: string) => convertFileSrc(path);
