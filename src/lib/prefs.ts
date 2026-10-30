// The one door to localStorage, for per-device UI preferences (theme, sort,
// rail width, …) — never library data, which lives in library.sqlite.
//
// Storage can be unavailable (private mode, blocked site data) or hold junk
// from an older version, so every read degrades to "not set" and every write
// to "didn't persist" instead of throwing at startup.

/** The stored string, or null if it's unset or storage is unavailable. */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota or blocked storage: the preference just won't stick */
  }
}

/** The stored JSON value, or undefined if it's unset or not valid JSON.
 *  Callers still check its shape. */
export function readJson(key: string): unknown {
  const raw = readPref(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function writeJson(key: string, value: unknown): void {
  writePref(key, JSON.stringify(value));
}
