import { useCallback, useRef, useState, type CSSProperties } from "react";

import { Cover } from "../components/Cover";
import { isOwned } from "../lib/ownership";
import { readJson, writeJson } from "../lib/prefs";
import { MEDIA, MEDIUM_LABEL, type Entry, type Medium, type Status } from "../lib/types";

// Grouped by where a thing sits in your life: what you're on now, what's queued,
// what's done. Items keep the caller's sort order.
//
// Every category behaves the same way, in two states: **collapsed** is a single
// mixed shelf — one full-width row, capped for big categories — and **expanding**
// it breaks the category into a grid per medium. One rule, not a per-section
// quirk: In Progress used to be the only category split by medium, which read as
// arbitrary. Collapsed answers "what's in here?" in one row whatever the medium;
// expanded is when you're actually looking, and that's when the split earns its
// sub-headers (they hide themselves when only one medium is present anyway).
interface SectionDef {
  key: string;
  label: string;
  statuses: Status[];
  /** Extra test beyond status, used for the Backlog/Wishlist split. Sections are
   *  matched in order, so the first one that accepts an entry wins. */
  accepts?: (e: Entry, tracksOwnership: (m: Medium) => boolean) => boolean;
}

const SECTIONS: SectionDef[] = [
  { key: "progress", label: "In Progress", statuses: ["active", "paused"] },
  // "want" splits in two for media that track ownership: things you already have
  // (Backlog) vs things you'd have to buy (Wishlist). Media that don't track it
  // land wholesale in Backlog, exactly as before.
  {
    key: "watchlist",
    label: "Backlog",
    statuses: ["want"],
    accepts: (e, tracks) => !tracks(e.medium) || isOwned(e),
  },
  { key: "wishlist", label: "Wishlist", statuses: ["want"] },
  { key: "done", label: "Done", statuses: ["done"] },
  { key: "dropped", label: "Dropped", statuses: ["dropped"] },
];

const UNSORTED: SectionDef = { key: "unsorted", label: "Unsorted", statuses: [] };

const COLLAPSE_KEY = "manifest-sections";
// How many covers a collapsed shelf renders before the "+N more" tile. Keeps
// the DOM light when a category has hundreds of entries.
const PREVIEW_LIMIT = 24;

// Card metrics, mirrored from `.grid`/`.shelf` in global.css.
const CARD_MIN = 152;
const CARD_GAP = 22;

/** The width one card gets in a `repeat(auto-fill, minmax(CARD_MIN, 1fr))` grid
 *  of `total` px — i.e. fill the row with as many CARD_MIN cards as fit, then
 *  share the slack between them.
 *
 *  We resolve it ourselves and hand it to both layouts as `--card-w`, because a
 *  collapsed section is a flex shelf and an expanded one is that grid: left to
 *  themselves they disagree about how wide a cover is, so *opening a section
 *  resized every cover in it*. CSS can't derive one from the other — there's no
 *  way to ask a flex row for the grid's track width — so this is measured. */
export function cardWidth(total: number): number {
  if (total <= 0) return CARD_MIN;
  const cols = Math.max(1, Math.floor((total + CARD_GAP) / (CARD_MIN + CARD_GAP)));
  return Math.floor((total - (cols - 1) * CARD_GAP) / cols);
}

/** Which sections are expanded. Anything but a plain object of booleans
 *  (an old format, junk) reads as "all collapsed". */
function loadOpen(): Record<string, boolean> {
  const saved = readJson(COLLAPSE_KEY);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  return Object.fromEntries(
    Object.entries(saved).filter(([, v]) => typeof v === "boolean"),
  ) as Record<string, boolean>;
}

/** The library: entries grouped by status into shelves that expand to grids. */
export function LibraryGrid({
  entries,
  onOpen,
  emptyHint,
  ownedMedia = [],
}: {
  entries: Entry[];
  onOpen: (id: string) => void;
  emptyHint: string;
  /** Media that track ownership; their "want" entries split into Backlog
   *  (owned) and Wishlist (not). Empty = no split anywhere. */
  ownedMedia?: Medium[];
}) {
  // Every category defaults to the shelf (preview); expanding is opt-in.
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpen);
  const tracksOwnership = (m: Medium) => ownedMedia.includes(m);

  // One card width for every shelf and grid on the page, re-measured whenever
  // the column resizes (window, or dragging the rail). Until it lands — and
  // under jsdom, which has no layout — the CSS fallbacks apply. It's a callback
  // ref so it also attaches when the grid appears after an empty library.
  const [cardW, setCardW] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const measureWrap = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setCardW(el.clientWidth > 0 ? cardWidth(el.clientWidth) : 0);
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(el);
  }, []);
  const sizing = cardW ? ({ "--card-w": `${cardW}px` } as CSSProperties) : undefined;

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
      ? SECTIONS.find(
          (s) =>
            s.statuses.includes(e.status as Status) &&
            (!s.accepts || s.accepts(e, tracksOwnership)),
        )
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
    writeJson(COLLAPSE_KEY, next);
  }

  return (
    <div className="sections" ref={measureWrap} style={sizing}>
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
              {expanded ? (
                <ByMedium items={items} onOpen={onOpen} />
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

/** An expanded category: a grid per medium in canonical order, so a category you
 *  opened reads as Films / Games / … rather than a mixed pile. The sub-headers
 *  only appear when there's more than one medium to tell apart — a single-medium
 *  category (or any category while the rail filters to one) looks untouched. */
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
