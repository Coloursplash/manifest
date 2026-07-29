// Shared test fixture: build an Entry with sensible defaults, override any field.
import type { Entry, Medium } from "../lib/types";

let seq = 0;

export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  const medium: Medium = overrides.medium ?? "film";
  const slug = overrides.slug ?? `entry-${seq++}`;
  return {
    id: `${medium}/${slug}`,
    medium,
    slug,
    title: "Untitled",
    ...overrides,
  };
}
