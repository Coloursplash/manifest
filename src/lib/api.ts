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

export const appendNote = (
  id: string,
  date: string,
  tags: string[],
  body: string,
) => invoke<Entry>("append_note", { id, date, tags, body });

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

/** Cache a remote cover locally and return the on-disk path. */
export const cacheCover = (url: string) =>
  invoke<string>("cache_cover", { url });

export const hasTmdbKey = () => invoke<boolean>("has_tmdb_key");

export const setTmdbKey = (key: string) =>
  invoke<void>("set_tmdb_key", { key });

// --- covers: turn a cached path into a webview-loadable src ---

export const coverSrc = (path: string) => convertFileSrc(path);

// --- events: the library changed on disk (external edit or our own write) ---

export const onLibraryChanged = (cb: () => void): Promise<UnlistenFn> =>
  listen("library:changed", cb);
