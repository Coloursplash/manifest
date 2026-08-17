import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

import { Cover } from "../components/Cover";
import { IconBack, IconClose, IconSearch } from "../components/icons";
import { NoteEditor, type NoteDraft } from "../components/NoteEditor";
import {
  appendNote,
  createEntry,
  fetchDetails,
  patchEntry,
  searchMetadata,
} from "../lib/api";
import { formatValue, humanizeLabel } from "../lib/fields";
import { todayISO } from "../lib/notes";
import {
  MEDIUM_LABEL,
  statusLabel,
  VERBS,
  type Candidate,
  type Entry,
  type Medium,
  type Status,
} from "../lib/types";

const quickLabel = (m: Medium, s: Status) =>
  s === "want" ? "Plan" : statusLabel(m, s);

/** A key the OmniBox pill offers us; true means "consumed". */
export type AddKeyHandler = (e: React.KeyboardEvent) => boolean;

// Which status an Enter on a hit files under. Plain ⏎ is the headline action
// (log it); the modifiers reach the other two quick statuses.
function statusForEnter(e: React.KeyboardEvent): Status {
  if (e.shiftKey) return "want";
  if (e.altKey) return "active";
  return "done";
}

/** How many cards fit on a row, read off the laid-out DOM — the grid is
 *  `auto-fill`, so the column count is whatever the width allows. Cards on the
 *  first row all share its `offsetTop`. Exported for its own test: jsdom has no
 *  layout, so the ↑/↓ arithmetic can't be exercised through the rendered app. */
export function columnsOf(cards: Pick<HTMLElement, "offsetTop">[]): number {
  if (cards.length < 2) return 1;
  const top = cards[0].offsetTop;
  let n = 1;
  while (n < cards.length && cards[n].offsetTop === top) n++;
  return n;
}

// Adding files an entry under a status and nothing else.
//
// It used to also stamp today's date — `finished` + a bare log block for
// "done", `started` for "active" — on the theory that you add things right
// after watching them. That guess was wrong often enough to be a bug: adding a
// film you saw in May logged it as seen today, and the invented `finished` date
// then showed up as a second, phantom row on the timeline (films are
// single-sitting, so `finished` has no field in the UI — you couldn't even see
// what had been written). Dates are the user's to choose: the log editor on the
// entry page is where they get picked.

export function AddEntryModal({
  hasKey,
  hasRawgKey,
  enabledMedia,
  initialMedium,
  initialQuery = "",
  variant = "modal",
  search,
  keyHandlerRef,
  onRefocusSearch,
  onClose,
  onCreated,
  onNeedKey,
}: {
  hasKey: boolean;
  hasRawgKey: boolean;
  enabledMedia: Medium[];
  /** The active header filter. When set, the modal opens locked to it and
   *  hides its own category picker; when null ("All") it shows the picker. */
  initialMedium: Medium | null;
  /** A title typed into the search bar's "Add …" action — prefilled + searched. */
  initialQuery?: string;
  /** "modal" = centred dialog with its own search field; "panel" = joined to
   *  the OmniBox pill, its search driven by the pill's single input (`search`). */
  variant?: "modal" | "panel";
  /** In panel mode, the live query from the pill. */
  search?: string;
  /** Panel mode: where to publish our handler for the keys the pill forwards
   *  while the title field still has focus (⏎ to hand over, ⇥ for category). */
  keyHandlerRef?: MutableRefObject<AddKeyHandler | null>;
  /** Put the caret back in the title field — Esc from the results, or after
   *  the log dialog took focus. */
  onRefocusSearch?: () => void;
  onClose: () => void;
  onCreated: (e: Entry) => void;
  onNeedKey: () => void;
}) {
  const panel = variant === "panel";
  const [medium, setMedium] = useState<Medium>(
    initialMedium ?? enabledMedia[0],
  );
  const [ownQuery, setQuery] = useState(initialQuery);
  // In panel mode the pill owns the query; in modal mode it's internal.
  const query = panel ? search ?? "" : ownQuery;
  const [results, setResults] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, Status>>({});
  // The result the user clicked to inspect before committing (null = grid view).
  const [preview, setPreview] = useState<{ c: Candidate; key: string; index: number } | null>(
    null,
  );
  // The hit being logged: filing something as watched/read/played opens the log
  // dialog first, so the date and your thoughts are yours to enter (Letterboxd's
  // move). null = not logging.
  const [logging, setLogging] = useState<{ c: Candidate; key: string; index: number } | null>(
    null,
  );
  const [previewExtra, setPreviewExtra] = useState<Record<string, unknown>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  // "When the next results land, put focus on them" — set by ⇥ from the grid.
  const catchFocus = useRef(false);

  const keyMissing = (m: Medium) =>
    (m === "film" || m === "tv" ? !hasKey : m === "game" ? !hasRawgKey : false);
  const needsKey = keyMissing(medium);
  // Which provider key is missing, for the prompt copy.
  const keyName = medium === "game" ? "RAWG" : "TMDB";

  // Open the info preview for a hit, pulling crew/genres for providers that
  // gate them behind a detail call (TMDB). AniList/books already carry theirs.
  async function openPreview(c: Candidate, key: string, index = -1) {
    setPreview({ c, key, index });
    setPreviewExtra({});
    if (!c.reference) return;
    setPreviewLoading(true);
    try {
      setPreviewExtra(await fetchDetails(medium, c.reference));
    } catch {
      /* preview degrades to the fields search already returned */
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runSearch(m: Medium, q: string) {
    if (!q.trim() || keyMissing(m)) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setPreview(null);
    try {
      setResults(await searchMetadata(m, q.trim()));
    } catch (e) {
      setError(String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // Modal: prefilled from the search bar's "Add …" — run it once on open.
  useEffect(() => {
    if (!panel && initialQuery.trim() && !keyMissing(medium)) runSearch(medium, initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Panel: the pill drives the query, so search as it changes (debounced), and
  // clear results when it's emptied.
  useEffect(() => {
    if (!panel) return;
    const q = query.trim();
    if (!q || keyMissing(medium)) {
      setResults([]);
      setSearched(false);
      // Nothing will be searched here (empty box, or a category whose key is
      // missing), so drop any pending "focus the results" from a ⇥.
      if (catchFocus.current) {
        catchFocus.current = false;
        backToSearch();
      }
      return;
    }
    const t = setTimeout(() => runSearch(medium, q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, query, medium]);

  function switchMedium(m: Medium) {
    setMedium(m);
    setAdded({});
    setPreview(null);
    // The hits on screen belong to the old category — drop them, or a quick ⏎
    // right after ⇥ would file a film as a TV show.
    setResults([]);
    setSearched(false);
    // Re-run the same query in the new category, faster than retyping. In panel
    // mode the debounced effect below already fires on a medium change, so
    // searching here too would double the provider call on every ⇥.
    if (!panel && query.trim() && !keyMissing(m)) runSearch(m, query);
  }

  /** File a candidate under a status. Pulls crew/genres for providers that need
   *  a follow-up (TMDB), then folds in the summary. Enrichment is best-effort —
   *  a failed detail fetch still files the entry with what search gave us. */
  async function create(c: Candidate, status: Status): Promise<Entry> {
    const details = c.reference
      ? await fetchDetails(medium, c.reference).catch(() => ({}))
      : {};
    const fields: Record<string, unknown> = { ...(c.fields ?? {}), ...details };
    if (c.summary && fields.summary === undefined) fields.summary = c.summary;

    return createEntry({
      medium,
      title: c.title,
      year: c.year,
      cover: c.cover,
      status,
      fields,
    });
  }

  // "Watched"/"Read"/"Played" means you have something to say about when and
  // how it went, so it opens the log dialog rather than filing silently. Plan
  // and In-progress are pure filing — one click, no questions.
  function add(c: Candidate, key: string, status: Status, index = -1) {
    if (status === "done") {
      setLogging({ c, key, index });
      return;
    }
    void file(c, key, status);
  }

  async function file(c: Candidate, key: string, status: Status) {
    setError(null);
    try {
      onCreated(await create(c, status));
      setAdded((a) => ({ ...a, [key]: status }));
    } catch (e) {
      setError(String(e));
    }
  }

  /** Commit the log dialog: create the entry, write the dated block, and apply
   *  a rating if one was given. The note is what makes it show on the timeline. */
  async function commitLog(c: Candidate, key: string, draft: NoteDraft) {
    const created = await create(c, "done");
    let entry = await appendNote(created.id, draft.date, draft.tags, draft.body);
    if (draft.rating != null) {
      entry = await patchEntry(created.id, { rating: draft.rating });
    }
    onCreated(entry);
    setAdded((a) => ({ ...a, [key]: "done" }));
    closeLog();
  }

  function addManual(status: Status) {
    const title = query.trim();
    if (!title) return;
    add({ title }, `manual:${title}`, status);
  }

  // --- keyboard ------------------------------------------------------------
  // Type the title, ⏎ to lock it in — that hands focus to the results, where
  // the arrows walk the grid the way it actually looks (←/→ along a row, ↑/↓
  // between rows) and ⏎ logs whatever you're on. ⇥ cycles the category from
  // anywhere. Esc walks back out one step at a time.

  const cards = () =>
    Array.from(gridRef.current?.querySelectorAll<HTMLElement>("[data-card]") ?? []);

  /** Focus the nth hit, clamped. Returns false if there's nothing to focus. */
  function focusCard(i: number): boolean {
    const list = cards();
    if (list.length === 0) return false;
    list[Math.max(0, Math.min(i, list.length - 1))].focus();
    return true;
  }

  function backToSearch() {
    onRefocusSearch?.();
  }

  /** Leave a sub-view (log dialog, preview) and land back on the card it came
   *  from — it's re-rendered by then, so the focus has to wait a frame. */
  function backToResults(index: number) {
    requestAnimationFrame(() => {
      if (index < 0 || !focusCard(index)) backToSearch();
    });
  }

  function closeLog() {
    const i = logging?.index ?? -1;
    setLogging(null);
    backToResults(i);
  }

  function closePreview() {
    const i = preview?.index ?? -1;
    setPreview(null);
    backToResults(i);
  }

  /** ⇥ / ⇧⇥ steps through the categories instead of moving focus — the add
   *  panel is small enough that tab-as-focus buys nothing, and re-running the
   *  same query in the next category is the move you actually want.
   *  `fromGrid` means you were standing on a hit; those unmount when the new
   *  results land, so say where focus should go once they do. */
  function cycleMedium(step: number, fromGrid = false) {
    const list = enabledMedia;
    const i = list.indexOf(medium);
    catchFocus.current = fromGrid;
    switchMedium(list[(i + step + list.length) % list.length]);
  }

  // Hand focus to the new category's first hit once its search settles, so ⇥
  // from the grid doesn't strand you on `document.body`. Waits for `searched`:
  // ⇥ empties the results first, and that gap isn't the answer.
  useEffect(() => {
    if (!catchFocus.current || loading || !searched) return;
    catchFocus.current = false;
    if (!focusCard(0)) backToSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, loading, searched]);

  /** Keys the pill forwards while the title field still has focus. */
  function handleFieldKey(e: React.KeyboardEvent): boolean {
    if (logging || preview) return false; // those own their own focus
    if (e.key === "Tab") {
      e.preventDefault();
      cycleMedium(e.shiftKey ? -1 : 1);
      return true;
    }
    if (e.key === "Enter" || e.key === "ArrowDown") {
      // Lock the title in and step into the grid.
      if (focusCard(0)) {
        e.preventDefault();
        return true;
      }
      // Nothing found: ⏎ files the typed title by hand rather than dead-ending.
      if (e.key === "Enter" && searched && !loading && query.trim()) {
        e.preventDefault();
        addManual(statusForEnter(e));
        return true;
      }
    }
    return false;
  }

  /** Keys on a focused hit. */
  function handleCardKey(e: React.KeyboardEvent, c: Candidate, key: string, i: number) {
    const list = cards();
    const cols = columnsOf(list);
    const go = (n: number) => {
      e.preventDefault();
      focusCard(n);
    };
    switch (e.key) {
      case "ArrowRight":
        return go(i + 1);
      case "ArrowLeft":
        return i === 0 ? (e.preventDefault(), backToSearch()) : go(i - 1);
      case "ArrowDown":
        return go(i + cols);
      case "ArrowUp":
        // Off the top row is back to the title you typed.
        return i - cols < 0 ? (e.preventDefault(), backToSearch()) : go(i - cols);
      case "Tab":
        e.preventDefault();
        return cycleMedium(e.shiftKey ? -1 : 1, true);
      case "Escape":
      case "Backspace":
        e.preventDefault();
        return backToSearch();
      case "Enter":
      case " ":
        e.preventDefault();
        if (added[key]) return;
        if (e.metaKey || e.ctrlKey) void openPreview(c, key, i);
        else add(c, key, statusForEnter(e), i);
        return;
    }
  }

  // Republished every render so it never closes over stale results.
  useEffect(() => {
    if (!keyHandlerRef) return;
    keyHandlerRef.current = handleFieldKey;
    return () => {
      keyHandlerRef.current = null;
    };
  });

  const Shell = panel ? PanelShell : ModalShell;

  return (
    <Shell
      title={initialMedium ? `Add ${MEDIUM_LABEL[medium]} to library` : "Add to library"}
      onClose={onClose}
    >
        {logging ? (
          <LogDialog
            candidate={logging.c}
            medium={medium}
            onCancel={closeLog}
            onSubmit={(draft) => commitLog(logging.c, logging.key, draft)}
          />
        ) : preview ? (
          <CandidatePreview
            candidate={preview.c}
            extra={previewExtra}
            loading={previewLoading}
            medium={medium}
            added={added[preview.key]}
            autoFocus={panel}
            onBack={closePreview}
            onAdd={(status) => add(preview.c, preview.key, status, preview.index)}
          />
        ) : (
          <>
        {/* On "All", pick the type here. In the panel the row is always shown:
            ⇥ steps through it, so it has to be visible to be usable. From a
            specific category in the modal the heading already names it. */}
        {(panel || initialMedium === null) && (
          <div className="tabs" style={{ marginBottom: 16 }}>
            {enabledMedia.map((m) => (
              <button
                key={m}
                className={`tab ${medium === m ? "tab--on" : ""}`}
                onClick={() => switchMedium(m)}
                tabIndex={-1}
              >
                {MEDIUM_LABEL[m]}
              </button>
            ))}
            {panel && (
              <kbd className="tabs__key" aria-hidden="true">
                ⇥
              </kbd>
            )}
          </div>
        )}

        {needsKey ? (
          <div className="stack">
            <div className="panel" style={{ padding: 18, maxWidth: "none" }}>
              <div className="label" style={{ marginBottom: 6 }}>
                {keyName} key required
              </div>
              <p style={{ margin: "0 0 14px" }}>
                Searching {MEDIUM_LABEL[medium].toLowerCase()} needs a free{" "}
                {keyName} API key. Anime, manga, music, and books don’t need one.
              </p>
              <button className="btn btn--accent btn--lg" onClick={onNeedKey}>
                Add {keyName} key
              </button>
            </div>
            <div className="label">Or add by hand</div>
            <ManualAdd
              medium={medium}
              query={query}
              setQuery={setQuery}
              hideInput={panel}
              added={!!added[`manual:${query.trim()}`]}
              onAdd={addManual}
            />
          </div>
        ) : (
          <>
            {/* Panel mode has no search field — the pill's input drives it. */}
            {!panel && (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch(medium, query);
                }}
              >
                <input
                  className="input"
                  style={{ fontSize: "0.95rem", padding: "0.75em 0.9em" }}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${MEDIUM_LABEL[medium].toLowerCase()}…`}
                />
                <button
                  className="btn btn--lg"
                  type="submit"
                  disabled={loading}
                  title="Search"
                >
                  {loading ? "…" : <IconSearch size={18} />}
                </button>
              </form>
            )}
            {panel && loading && (
              <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 6px" }}>
                Searching…
              </p>
            )}

            <div className="sgrid" ref={gridRef}>
              {results.map((c, i) => {
                const key = `${i}:${c.title}`;
                const done = added[key];
                return (
                  // Focusable, but out of the tab order — ⏎ from the title field
                  // steps in here and the arrows take over from there.
                  <div
                    className="scard"
                    key={key}
                    data-card=""
                    tabIndex={-1}
                    onKeyDown={(e) => handleCardKey(e, c, key, i)}
                  >
                    <div
                      className="scard__cover"
                      onClick={() => openPreview(c, key, i)}
                      title="View details"
                    >
                      <Cover url={c.cover} title={c.title}>
                        {done ? (
                          <div className="scard__added">✓ {statusLabel(medium, done)}</div>
                        ) : (
                          <div className="scard__overlay">
                            <button
                              className="btn btn--accent btn--block"
                              tabIndex={-1}
                              onClick={(e) => {
                                e.stopPropagation();
                                add(c, key, "done", i);
                              }}
                            >
                              {quickLabel(medium, "done")}
                            </button>
                            <div className="row" style={{ gap: 6 }}>
                              <button
                                className="btn btn--sm btn--block"
                                tabIndex={-1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  add(c, key, "want", i);
                                }}
                              >
                                Plan
                              </button>
                              <button
                                className="btn btn--sm btn--block"
                                tabIndex={-1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  add(c, key, "active", i);
                                }}
                              >
                                {quickLabel(medium, "active")}
                              </button>
                            </div>
                          </div>
                        )}
                      </Cover>
                    </div>
                    <div
                      className="scard__title scard__title--link"
                      onClick={() => openPreview(c, key)}
                    >
                      {c.title}
                      {c.year ? ` (${c.year})` : ""}
                    </div>
                    {c.subtitle && <div className="scard__sub">{c.subtitle}</div>}
                  </div>
                );
              })}
            </div>

            {/* The grid is driven from the title field, so say how. */}
            {panel && results.length > 0 && (
              <div className="keyhints">
                <Hint keys="⏎" what="Pick a hit, then log it" />
                <Hint keys="←→↑↓" what="Move" />
                <Hint keys="⇧⏎" what="Plan" />
                <Hint keys="⌥⏎" what={quickLabel(medium, "active")} />
                <Hint keys="⌘⏎" what="Details" />
                <Hint keys="esc" what="Back" />
              </div>
            )}

            {searched && !loading && results.length === 0 && (
              <div className="stack" style={{ marginTop: 16 }}>
                <p className="muted" style={{ fontSize: "0.82rem" }}>
                  No matches — add it by hand:
                </p>
                <ManualAdd
                  medium={medium}
                  query={query}
                  setQuery={setQuery}
                  hideInput={panel}
                  added={!!added[`manual:${query.trim()}`]}
                  onAdd={addManual}
                />
              </div>
            )}
          </>
        )}
          </>
        )}

        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
    </Shell>
  );
}

/** One "⏎ Move"-style key legend. */
function Hint({ keys, what }: { keys: string; what: string }) {
  return (
    <span className="keyhint">
      <kbd>{keys}</kbd>
      {what}
    </span>
  );
}

/** The log dialog: what you get instead of a silent "filed as watched". Pick the
 *  date, tag it a rewatch, rate it, say something — or just hit the button and
 *  take today's date. Nothing is written until you commit, so backing out here
 *  leaves no entry behind. */
function LogDialog({
  candidate,
  medium,
  onSubmit,
  onCancel,
}: {
  candidate: Candidate;
  medium: Medium;
  onSubmit: (draft: NoteDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const verbs = VERBS[medium];
  return (
    <div className="stack">
      <div className="logdialog__head">
        <button className="btn btn--ghost btn--sm" onClick={onCancel}>
          <IconBack size={15} /> Back
        </button>
      </div>

      <div className="logdialog__subject">
        <div className="logdialog__cover">
          <Cover url={candidate.cover} title={candidate.title} />
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <div className="label">Log a {verbs.log}</div>
          <div className="logdialog__title">
            {candidate.title}
            {candidate.year ? ` (${candidate.year})` : ""}
          </div>
          {candidate.subtitle && <div className="scard__sub">{candidate.subtitle}</div>}
        </div>
      </div>

      <NoteEditor
        medium={medium}
        mode="add"
        withRating
        autoFocus
        initial={{ date: todayISO(), tags: [], body: "", rating: null }}
        submitLabel="Log it"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </div>
  );
}

/** Centred dialog wrapper — the classic Add modal. */
function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{title}</h3>
          <button className="btn btn--ghost btn--icon-sm" onClick={onClose} title="Close">
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Dropdown wrapper — the Add flow joined to the OmniBox pill (no scrim; the
 *  pill's backdrop handles outside-click). */
function PanelShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="addpanel">
      <div className="addpanel__head">
        <span className="addpanel__title">{title}</span>
        <button className="btn btn--ghost btn--icon-sm" onClick={onClose} title="Close">
          <IconClose />
        </button>
      </div>
      {children}
    </div>
  );
}

/** Read-only info page for a search hit — cover, synopsis, crew, genres — so
 *  the user can confirm it's the right title before committing. Adds from here
 *  too. `extra` is the (possibly async) detail fetch merged over the hit. */
function CandidatePreview({
  candidate,
  extra,
  loading,
  medium,
  added,
  autoFocus = false,
  onBack,
  onAdd,
}: {
  candidate: Candidate;
  extra: Record<string, unknown>;
  loading: boolean;
  medium: Medium;
  added?: Status;
  /** Take focus so Esc/⏎ work here without a Tab first (panel mode). */
  autoFocus?: boolean;
  onBack: () => void;
  onAdd: (status: Status) => void;
}) {
  const c = candidate;
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) rootRef.current?.focus();
  }, [autoFocus]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" || e.key === "Backspace") {
      e.preventDefault();
      onBack();
      return;
    }
    if (e.key === "Enter" && !added) {
      e.preventDefault();
      onAdd(statusForEnter(e));
    }
  }

  const fields: Record<string, unknown> = { ...(c.fields ?? {}), ...extra };
  const summary =
    typeof fields.summary === "string" ? (fields.summary as string) : c.summary;
  const genres = Array.isArray(fields.genres)
    ? (fields.genres as unknown[]).map(String).filter(Boolean)
    : undefined;
  const rows = Object.entries(fields).filter(
    ([k, v]) => k !== "summary" && k !== "genres" && v != null && `${v}` !== "",
  );

  return (
    <div className="preview" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="preview__bar">
        <button className="btn btn--ghost" onClick={onBack}>
          <IconBack size={16} /> Results
        </button>
        <div className="preview__actions">
          {added ? (
            <span className="btn" style={{ color: "var(--st-done)" }}>
              ✓ {statusLabel(medium, added)}
            </span>
          ) : (
            <>
              <button className="btn btn--accent" onClick={() => onAdd("done")}>
                {quickLabel(medium, "done")}
              </button>
              <button className="btn" onClick={() => onAdd("want")}>
                Plan
              </button>
              <button className="btn" onClick={() => onAdd("active")}>
                {quickLabel(medium, "active")}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="preview__body">
        <div className="preview__cover">
          <Cover url={c.cover} title={c.title} />
        </div>
        <div>
          <h3 className="preview__title">
            {c.title}
            {c.year ? ` (${c.year})` : ""}
          </h3>
          {c.subtitle && <div className="detail__sub">{c.subtitle}</div>}

          {genres && genres.length > 0 && (
            <div className="tags" style={{ marginTop: 12 }}>
              {genres.map((g) => (
                <span className="tag" key={g}>
                  {g}
                </span>
              ))}
            </div>
          )}

          {summary && (
            <div className="section">
              <div className="section__label">Synopsis</div>
              <p className="synopsis__text">{summary}</p>
            </div>
          )}

          {rows.length > 0 && (
            <div className="section">
              <div className="section__label">Details</div>
              <dl className="meta-table">
                {rows.map(([k, v]) => (
                  <Fragment key={k}>
                    <dt>{humanizeLabel(k)}</dt>
                    <dd>{formatValue(k, v)}</dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          )}

          {loading && (
            <p className="muted" style={{ fontSize: "0.78rem" }}>
              Loading full details…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ManualAdd({
  medium,
  query,
  setQuery,
  added,
  onAdd,
  hideInput = false,
}: {
  medium: Medium;
  query: string;
  setQuery: (s: string) => void;
  added: boolean;
  onAdd: (status: Status) => void;
  /** Panel mode: the pill owns the title, so don't render a second input. */
  hideInput?: boolean;
}) {
  return (
    <div className="row wrap">
      {!hideInput && (
        <input
          className="input"
          style={{ flex: 1, minWidth: 160 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Title"
        />
      )}
      {added ? (
        <span className="btn" style={{ color: "var(--st-done)" }}>
          ✓ Added
        </span>
      ) : (
        (["want", "active", "done"] as Status[]).map((s) => (
          <button
            key={s}
            className={`btn ${s === "done" ? "btn--accent" : ""}`}
            onClick={() => onAdd(s)}
            disabled={!query.trim()}
          >
            {quickLabel(medium, s)}
          </button>
        ))
      )}
    </div>
  );
}
