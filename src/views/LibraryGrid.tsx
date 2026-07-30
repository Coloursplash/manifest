import { useState } from "react";

import { Cover } from "../components/Cover";
import { MEDIA, MEDIUM_LABEL, type Entry, type Status } from "../lib/types";

// Grouped by where a thing sits in your life: what you're on now, what's queued,
// what's done. Each category shows a single full-width row (a horizontal shelf)
// by default — a preview capped for big categories — and expands inline into a
// full wrapping grid when you click it. Items keep the caller's sort order.
interface SectionDef {
  key: string;
  label: string;
  statuses: Status[];
  byMedium?: boolean;
}

const SECTIONS: SectionDef[] = [
  { key: "progress", label: "In Progress", statuses: ["active", "paused"], byMedium: true },
  { key: "watchlist", label: "Backlog", statuses: ["want"] },
  { key: "done", label: "Done", statuses: ["done"] },
  { key: "dropped", label: "Dropped", statuses: ["dropped"] },
];

const UNSORTED: SectionDef = { key: "unsorted", label: "Unsorted", statuses: [] };

const COLLAPSE_KEY = "manifest-sections";
// How many covers a collapsed shelf renders before the "+N more" tile. Keeps
// the DOM light when a category has hundreds of entries.
const PREVIEW_LIMIT = 24;

function loadOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** The library: entries grouped by status into shelves that expand to grids. */
export function LibraryGrid({
  entries,
  onOpen,
  emptyHint,
}: {
  entries: Entry[];
  onOpen: (id: string) => void;
  emptyHint: string;
}) {
  // Every category defaults to the shelf (preview); expanding is opt-in.
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);

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

  const isOpen = (def: SectionDef) => open[def.key] ?? false;
  function expand(def: SectionDef, value: boolean) {
    const next = { ...open, [def.key]: value };
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
              onClick={() => expand(def, !expanded)}
              aria-expanded={expanded}
            >
              <span className={`lib-section__chevron ${expanded ? "is-open" : ""}`}>▸</span>
              <span className="lib-section__label">{def.label}</span>
              <span className="lib-section__count">{items.length}</span>
              <span className="lib-section__hint">{expanded ? "Show less" : "Show all"}</span>
            </button>
            <div className="lib-section__body">
              {def.byMedium ? (
                <ByMedium items={items} expanded={expanded} onOpen={onOpen} onExpand={() => expand(def, true)} />
              ) : expanded ? (
                <Grid items={items} onOpen={onOpen} />
              ) : (
                <Shelf items={items} onOpen={onOpen} onExpand={() => expand(def, true)} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** In Progress: one shelf/grid per medium (canonical order), so a busy "now"
 *  reads as Films / Games / … rows rather than a mixed pile. */
function ByMedium({
  items,
  expanded,
  onOpen,
  onExpand,
}: {
  items: Entry[];
  expanded: boolean;
  onOpen: (id: string) => void;
  onExpand: () => void;
}) {
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
          {expanded ? (
            <Grid items={g.list} onOpen={onOpen} />
          ) : (
            <Shelf items={g.list} onOpen={onOpen} onExpand={onExpand} />
          )}
        </div>
      ))}
    </>
  );
}

/** Single full-width row: scrolls sideways through a capped preview, with a
 *  trailing "+N more" tile that expands the whole category. */
function Shelf({
  items,
  onOpen,
  onExpand,
}: {
  items: Entry[];
  onOpen: (id: string) => void;
  onExpand: () => void;
}) {
  const shown = items.slice(0, PREVIEW_LIMIT);
  const more = items.length - shown.length;
  return (
    <div className="shelf">
      {shown.map((e) => (
        <Card key={e.id} e={e} onOpen={onOpen} />
      ))}
      {more > 0 && (
        <button className="shelf__more" onClick={onExpand} title={`Show all ${items.length}`}>
          <span className="shelf__more-n">+{more}</span>
          <span className="shelf__more-label">more</span>
        </button>
      )}
    </div>
  );
}

function Grid({ items, onOpen }: { items: Entry[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid">
      {items.map((e) => (
        <Card key={e.id} e={e} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Card({ e, onOpen }: { e: Entry; onOpen: (id: string) => void }) {
  return (
    <div className="card" onClick={() => onOpen(e.id)}>
      <Cover url={e.cover} title={e.title}>
        {e.status && <span className={`cover__status dot--${e.status}`} title={e.status} />}
      </Cover>
      <div className="card__title">{e.title}</div>
      <div className="card__meta">
        {MEDIUM_LABEL[e.medium]}
        {e.year ? ` · ${e.year}` : ""}
      </div>
    </div>
  );
}
