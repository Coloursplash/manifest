// Typed wrappers around the Tauri command layer. The UI talks to the backend
// only through here — no raw `invoke` in components.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { Candidate, CreatePayload, Entry, Medium, Status } from "./types";

// --- library folder ---

export const getLibraryPath = () => invoke<string | null>("get_library_path");

export const chooseLibraryFolder = () =>
  invoke<string | null>("choose_library_folder");

export const setLibraryFolder = (path: string) =>
  invoke<Entry[]>("set_library_folder", { path });

// --- entries ---

export const listEntries = () => invoke<Entry[]>("list_entries");

export const getEntry = (id: string) => invoke<Entry>("get_entry", { id });

/** `end` makes the block a span (`START..END`) — for the media you get through
 *  over days or weeks rather than in one sitting. Omit it for a single day. */
export const appendNote = (
  id: string,
  date: string,
  tags: string[],
  body: string,
  end?: string,
) => invoke<Entry>("append_note", { id, date, end: end ?? null, tags, body });

export const updateNote = (
  id: string,
  index: number,
  date: string,
  tags: string[],
  body: string,
  end?: string,
) => invoke<Entry>("update_note", { id, index, date, end: end ?? null, tags, body });

export const deleteNote = (id: string, index: number) =>
  invoke<Entry>("delete_note", { id, index });

export const setStatus = (id: string, status: Status | null) =>
  invoke<Entry>("set_status", { id, status });

/** Set/clear arbitrary top-level fields (progress, dates, tags). null clears. */
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

// --- events: the library changed on disk (external edit or our own write) ---

export const onLibraryChanged = (cb: () => void): Promise<UnlistenFn> =>
  listen("library:changed", cb);
