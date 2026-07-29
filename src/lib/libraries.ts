// Recently-used library folders + user nicknames. This is app state (not
// library data), so it lives in localStorage alongside theme/accent — never in
// the user's library folder. Kept most-recent-first and capped.

export interface Library {
  path: string;
  /** Nickname; defaults to the folder's basename. */
  name: string;
}

const KEY = "manifest-libraries";
const MAX = 8;

/** Last path segment, handling both POSIX and Windows separators. */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function getLibraries(): Library[] {
  try {
    const raw = localStorage.getItem(KEY);
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
  localStorage.setItem(KEY, JSON.stringify(list));
  return list;
}

/** Record `path` as the most-recently-used library, preserving any existing
 *  nickname. Returns the updated list (most-recent-first, capped at MAX). */
export function recordLibrary(path: string): Library[] {
  const list = getLibraries();
  const existing = list.find((l) => l.path === path);
  const name = existing?.name ?? basename(path);
  const rest = list.filter((l) => l.path !== path);
  return save([{ path, name }, ...rest].slice(0, MAX));
}

/** Set a nickname; an empty name falls back to the folder's basename. */
export function renameLibrary(path: string, name: string): Library[] {
  const trimmed = name.trim();
  return save(
    getLibraries().map((l) =>
      l.path === path ? { ...l, name: trimmed || basename(path) } : l,
    ),
  );
}

export function removeLibrary(path: string): Library[] {
  return save(getLibraries().filter((l) => l.path !== path));
}

/** Display name for the active path, falling back to its basename. */
export function nameFor(path: string | null, list: Library[]): string {
  if (!path) return "";
  return list.find((l) => l.path === path)?.name ?? basename(path);
}
