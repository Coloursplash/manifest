// Recently-used library files + user nicknames. This is app state (not
// library data), so it lives in localStorage alongside theme/accent — never in
// the user's library. Kept most-recent-first and capped.

import { readPref, writePref } from "./prefs";

export interface Library {
  path: string;
  /** Nickname; defaults to `defaultName(path)`. */
  name: string;
}

const KEY = "manifest-libraries";
const MAX = 8;

/** Last path segment, handling both POSIX and Windows separators. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

/** Everything before the last separator ("" when there is none). */
function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const i = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return i > 0 ? trimmed.slice(0, i) : "";
}

/** A library's name before the user picks one: the file name without its
 *  extension, or the folder's name for the default `library.sqlite` (which
 *  would otherwise name every library "library"). */
export function defaultName(path: string): string {
  const file = basename(path);
  const stem = file.replace(/\.sqlite$/i, "");
  return stem === "library" ? basename(dirname(path)) || stem : stem;
}

export function getLibraries(): Library[] {
  try {
    const raw = readPref(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is Library =>
        !!x &&
        typeof x === "object" &&
        typeof (x as Library).path === "string" &&
        typeof (x as Library).name === "string",
    );
  } catch {
    return [];
  }
}

function save(list: Library[]): Library[] {
  writePref(KEY, JSON.stringify(list));
  return list;
}

/** Record the library file `path` as most-recently-used, preserving any
 *  existing nickname. Lists saved before libraries were files hold the file's
 *  folder instead; that row is the same library, so it is folded into this one
 *  (nickname kept). Returns the updated list (most-recent-first, capped). */
export function recordLibrary(path: string): Library[] {
  const list = getLibraries();
  const same = (l: Library) => l.path === path || l.path === dirname(path);
  const existing = list.find((l) => l.path === path) ?? list.find(same);
  const name = existing?.name ?? defaultName(path);
  const rest = list.filter((l) => !same(l));
  return save([{ path, name }, ...rest].slice(0, MAX));
}

/** Set a nickname; an empty name falls back to the default name. */
export function renameLibrary(path: string, name: string): Library[] {
  const trimmed = name.trim();
  return save(
    getLibraries().map((l) =>
      l.path === path ? { ...l, name: trimmed || defaultName(path) } : l,
    ),
  );
}

export function removeLibrary(path: string): Library[] {
  return save(getLibraries().filter((l) => l.path !== path));
}

/** Display name for the active path, falling back to its default name. */
export function nameFor(path: string | null, list: Library[]): string {
  if (!path) return "";
  return list.find((l) => l.path === path)?.name ?? defaultName(path);
}
