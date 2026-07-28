import { useState } from "react";

import { Cover } from "../components/Cover";
import { MEDIA, MEDIUM_LABEL, type Entry, type Status } from "../lib/types";

// The shelf is grouped by where a thing sits in your life: what you're on now,
// what's queued, what's done. Each group is a collapsible summary; In Progress
// is open by default and sub-grouped by medium, the rest start folded.
interface SectionDef {
  key: string;
  label: string;
  statuses: Status[];
  defaultOpen: boolean;
  byMedium?: boolean;
}

const SECTIONS: SectionDef[] = [
  { key: "progress", label: "In Progress", statuses: ["active", "paused"], defaultOpen: true, byMedium: true },
  { key: "watchlist", label: "Watchlist", statuses: ["want"], defaultOpen: false },
  { key: "done", label: "Done", statuses: ["done"], defaultOpen: false },
  { key: "dropped", label: "Dropped", statuses: ["dropped"], defaultOpen: false },
];

const UNSORTED: SectionDef = {
  key: "unsorted",
  label: "Unsorted",
  statuses: [],
  defaultOpen: false,
};

const COLLAPSE_KEY = "manifest-sections";

function loadCollapse(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** The shelf: entries grouped by status into collapsible sections. */
export function LibraryGrid({
  entries,
  onOpen,
  emptyHint,
}: {
  entries: Entry[];
  onOpen: (id: string) => void;
  emptyHint: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(loadCollapse);

  if (entries.length === 0) {
    return (
      <div className="center">
        <p className="muted">{emptyHint}</p>
      </div>
    );
  }

  // Bucket entries into sections by status; anything unrecognised → Unsorted.
  const buckets = new Map<string, Entry[]>();
  for (const e of entries) {
    const def = e.status
      ? SECTIONS.find((s) => s.statuses.includes(e.status as Status))
      : undefined;
    const key = def ? def.key : UNSORTED.key;
    const list = buckets.get(key);
    if (list) list.push(e);
    else buckets.set(key, [e]);
  }

  const defs = [...SECTIONS, UNSORTED];

  function isOpen(def: SectionDef): boolean {
    return open[def.key] ?? def.defaultOpen;
  }
  function toggle(def: SectionDef) {
    const next = { ...open, [def.key]: !isOpen(def) };
    setOpen(next);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
  }

  return (
    <div className="sections">
      {defs.map((def) => {
        const items = buckets.get(def.key) ?? [];
        if (items.length === 0) return null;
        const expanded = isOpen(def);
        return (
          <section className="lib-section" key={def.key}>
            <button
              className="lib-section__head"
              onClick={() => toggle(def)}
              aria-expanded={expanded}
            >
              <span className={`lib-section__chevron ${expanded ? "is-open" : ""}`}>▸</span>
              <span className="lib-section__label">{def.label}</span>
              <span className="lib-section__count">{items.length}</span>
            </button>
            {expanded && (
              <div className="lib-section__body">
                {def.byMedium ? (
                  <ByMedium items={items} onOpen={onOpen} />
                ) : (
                  <Grid items={items} onOpen={onOpen} />
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Split a section's items into per-medium sub-grids (in canonical order). */
function ByMedium({ items, onOpen }: { items: Entry[]; onOpen: (id: string) => void }) {
  const groups = MEDIA.map((m) => ({
    medium: m,
    list: items.filter((e) => e.medium === m),
  })).filter((g) => g.list.length > 0);

  const showHeads = groups.length > 1;

  return (
    <>
      {groups.map((g) => (
        <div className="lib-mediagroup" key={g.medium}>
          {showHeads && <div className="lib-subhead">{MEDIUM_LABEL[g.medium]}</div>}
          <Grid items={g.list} onOpen={onOpen} />
        </div>
      ))}
    </>
  );
}

function Grid({ items, onOpen }: { items: Entry[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid">
      {items.map((e) => (
        <div className="card" key={e.id} onClick={() => onOpen(e.id)}>
          <Cover url={e.cover} title={e.title}>
            {e.status && (
              <span className={`cover__status dot--${e.status}`} title={e.status} />
            )}
          </Cover>
          <div className="card__title">{e.title}</div>
          <div className="card__meta">
            {MEDIUM_LABEL[e.medium]}
            {e.year ? ` · ${e.year}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
