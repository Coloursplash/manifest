import { useEffect, useRef, useState, type MutableRefObject } from "react";

import { IconClose } from "../../components/icons";
import type { NoteDraft } from "../../components/NoteEditor";
import { addLog, createEntry, fetchDetails, patchEntry } from "../../lib/api";
import { MEDIUM_LABEL, PROGRESS, type Candidate, type Entry, type Medium, type Status } from "../../lib/types";
import { CandidatePreview } from "./CandidatePreview";
import { columnsOf, statusForEnter, type AddKeyHandler } from "./keys";
import { LogDialog } from "./LogDialog";
import { ManualAdd } from "./ManualAdd";
import { ResultGrid } from "./ResultGrid";
import { useAddSearch } from "./useAddSearch";

/** A hit the user opened (preview) or is logging, and where it sat in the
 *  grid so focus can return there. */
interface Picked {
  c: Candidate;
  key: string;
  index: number;
}

// Adding files an entry under a status and nothing else — it never invents a
// date. Filing something as watched/read/played opens the log dialog, where
// the dates (and your thoughts) are yours to enter.
//
// The panel is joined to the OmniBox pill: the pill's input is the title
// field (`search`), and this renders into the pill's dropdown.
//
// Keyboard: type the title, ⏎ hands focus to the results, the arrows walk the
// grid as it looks (←/→ along a row, ↑/↓ between rows), ⏎ logs the hit you're
// on. ⇥ cycles the category from anywhere. Esc walks back one step at a time.

export function AddPanel({
  search,
  hasKey,
  hasRawgKey,
  enabledMedia,
  initialMedium,
  keyHandlerRef,
  onRefocusSearch,
  onClose,
  onCreated,
  onNeedKey,
}: {
  /** The live title from the pill. */
  search: string;
  hasKey: boolean;
  hasRawgKey: boolean;
  enabledMedia: Medium[];
  /** The rail's medium filter, if any — the category the panel starts on. */
  initialMedium: Medium | null;
  /** Where to publish the handler for keys the pill forwards while the title
   *  field has focus (⏎ to hand over, ⇥ for category). */
  keyHandlerRef: MutableRefObject<AddKeyHandler | null>;
  /** Put the caret back in the title field. */
  onRefocusSearch: () => void;
  onClose: () => void;
  onCreated: (e: Entry) => void;
  onNeedKey: () => void;
}) {
  const [medium, setMedium] = useState<Medium>(initialMedium ?? enabledMedia[0]);
  const [added, setAdded] = useState<Record<string, Status>>({});
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Picked | null>(null);
  const [logging, setLogging] = useState<Picked | null>(null);
  const [previewExtra, setPreviewExtra] = useState<Record<string, unknown>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  // "When the next results land, put focus on them" — set by ⇥ from the grid.
  const catchFocus = useRef(false);
  // Hits being filed right now, so a double-click can't create twice.
  const inFlight = useRef(new Set<string>());
  // Entries already created for a hit whose log step failed, so "Log it"
  // again retries the log instead of creating a duplicate.
  const createdFor = useRef(new Map<string, Entry>());
  const previewRequest = useRef(0);

  const keyMissing = (m: Medium) =>
    m === "film" || m === "tv" ? !hasKey : m === "game" ? !hasRawgKey : false;
  const needsKey = keyMissing(medium);
  const keyName = medium === "game" ? "RAWG" : "TMDB";
  const query = search.trim();

  const { results, searched, loading, error: searchError } = useAddSearch(medium, search, needsKey);

  // --- filing ------------------------------------------------------------

  /** Create the entry for a hit. Pulls crew/genres for providers that need a
   *  follow-up call (TMDB, RAWG); that enrichment is best-effort. */
  async function create(c: Candidate, status: Status): Promise<Entry> {
    const details = c.reference ? await fetchDetails(medium, c.reference).catch(() => ({})) : {};
    const fields: Record<string, unknown> = { ...(c.fields ?? {}), ...details };
    if (c.summary && fields.summary === undefined) fields.summary = c.summary;
    const entry = await createEntry({ medium, title: c.title, year: c.year, cover: c.cover, status, fields });
    onCreated(entry);
    return entry;
  }

  // "Watched"/"Read"/"Played" opens the log dialog; Plan and In-progress file
  // in one click.
  function add(c: Candidate, key: string, status: Status, index = -1) {
    if (status === "done") setLogging({ c, key, index });
    else void file(c, key, status);
  }

  async function file(c: Candidate, key: string, status: Status) {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setError(null);
    try {
      await create(c, status);
      setAdded((a) => ({ ...a, [key]: status }));
    } catch (e) {
      setError(String(e));
    } finally {
      inFlight.current.delete(key);
    }
  }

  /** Commit the log dialog: create the entry (once), add the log, apply a
   *  rating. For media you get through over time the dates you typed are also
   *  the entry's started/finished; film and music have no such fields shown,
   *  so they're left alone. A thrown error keeps the dialog open. */
  async function commitLog({ c, key }: Picked, draft: NoteDraft) {
    const created = createdFor.current.get(key) ?? (await create(c, "done"));
    createdFor.current.set(key, created);

    let entry = await addLog(created.id, draft);
    const patch: Record<string, unknown> = {};
    if (draft.rating != null) patch.rating = draft.rating;
    if (!PROGRESS[medium].single) {
      if (draft.end) patch.started = draft.date;
      patch.finished = draft.end ?? draft.date;
    }
    if (Object.keys(patch).length) entry = await patchEntry(created.id, patch);

    createdFor.current.delete(key);
    onCreated(entry);
    setAdded((a) => ({ ...a, [key]: "done" }));
    closeLog();
  }

  function addManual(status: Status) {
    if (query) add({ title: query }, `manual:${query}`, status);
  }

  // --- preview -----------------------------------------------------------

  async function openPreview(c: Candidate, key: string, index: number) {
    const request = ++previewRequest.current;
    setPreview({ c, key, index });
    setPreviewExtra({});
    if (!c.reference) return;
    setPreviewLoading(true);
    try {
      const extra = await fetchDetails(medium, c.reference);
      if (request === previewRequest.current) setPreviewExtra(extra);
    } catch {
      /* the preview falls back to what search already returned */
    } finally {
      if (request === previewRequest.current) setPreviewLoading(false);
    }
  }

  // --- focus + keyboard --------------------------------------------------

  const cards = () => Array.from(gridRef.current?.querySelectorAll<HTMLElement>("[data-card]") ?? []);

  /** Focus the nth hit, clamped. False if there's nothing to focus. */
  function focusCard(i: number): boolean {
    const list = cards();
    if (list.length === 0) return false;
    list[Math.max(0, Math.min(i, list.length - 1))].focus();
    return true;
  }

  /** Leave a sub-view and land back on the card it came from (re-rendered by
   *  then, so wait a frame). */
  function backToResults(index: number) {
    requestAnimationFrame(() => {
      if (index < 0 || !focusCard(index)) onRefocusSearch();
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

  function switchMedium(m: Medium) {
    setMedium(m);
    setAdded({});
    setPreview(null);
    setError(null);
  }

  /** ⇥ / ⇧⇥ steps through the categories. `fromGrid`: you were on a hit,
   *  which unmounts when the new results land, so focus follows them. */
  function cycleMedium(step: number, fromGrid = false) {
    const i = enabledMedia.indexOf(medium);
    catchFocus.current = fromGrid;
    switchMedium(enabledMedia[(i + step + enabledMedia.length) % enabledMedia.length]);
  }

  // After ⇥ from the grid: focus the new first hit once its search settles,
  // or go back to the title if this category won't search at all.
  useEffect(() => {
    if (!catchFocus.current) return;
    if (!query || needsKey) {
      catchFocus.current = false;
      onRefocusSearch();
      return;
    }
    if (loading || !searched) return;
    catchFocus.current = false;
    if (!focusCard(0)) onRefocusSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, loading, searched, query, needsKey]);

  /** Keys the pill forwards while the title field has focus. */
  function handleFieldKey(e: React.KeyboardEvent): boolean {
    if (logging || preview) return false; // those own their own focus
    if (e.key === "Tab") {
      e.preventDefault();
      cycleMedium(e.shiftKey ? -1 : 1);
      return true;
    }
    if (e.key === "Enter" || e.key === "ArrowDown") {
      if (focusCard(0)) {
        e.preventDefault();
        return true;
      }
      // Nothing found: ⏎ files the typed title by hand rather than dead-ending.
      if (e.key === "Enter" && searched && !loading && query) {
        e.preventDefault();
        addManual(statusForEnter(e));
        return true;
      }
    }
    return false;
  }

  /** Keys on a focused hit. */
  function handleCardKey(e: React.KeyboardEvent, c: Candidate, key: string, i: number) {
    const cols = columnsOf(cards());
    const go = (n: number) => {
      e.preventDefault();
      focusCard(n);
    };
    const back = () => {
      e.preventDefault();
      onRefocusSearch();
    };
    switch (e.key) {
      case "ArrowRight":
        return go(i + 1);
      case "ArrowLeft":
        return i === 0 ? back() : go(i - 1);
      case "ArrowDown":
        return go(i + cols);
      case "ArrowUp":
        return i - cols < 0 ? back() : go(i - cols); // off the top row = the title
      case "Tab":
        e.preventDefault();
        return cycleMedium(e.shiftKey ? -1 : 1, true);
      case "Escape":
      case "Backspace":
        return back();
      case "Enter":
      case " ":
        e.preventDefault();
        if (added[key]) return;
        if (e.metaKey || e.ctrlKey) void openPreview(c, key, i);
        else add(c, key, statusForEnter(e), i);
    }
  }

  // Republished every render so it never closes over stale results.
  useEffect(() => {
    keyHandlerRef.current = handleFieldKey;
    return () => {
      keyHandlerRef.current = null;
    };
  });

  // --- render ------------------------------------------------------------

  const manualKey = `manual:${query}`;
  let body;
  if (logging) {
    body = (
      <LogDialog
        candidate={logging.c}
        medium={medium}
        onCancel={closeLog}
        onSubmit={(draft) => commitLog(logging, draft)}
      />
    );
  } else if (preview) {
    body = (
      <CandidatePreview
        candidate={preview.c}
        extra={previewExtra}
        loading={previewLoading}
        medium={medium}
        added={added[preview.key]}
        autoFocus
        onBack={closePreview}
        onAdd={(status) => add(preview.c, preview.key, status, preview.index)}
      />
    );
  } else {
    body = (
      <>
        {/* Always shown: ⇥ steps through it, so it has to be visible. */}
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
          <kbd className="tabs__key" aria-hidden="true">
            ⇥
          </kbd>
        </div>

        {needsKey ? (
          <div className="stack">
            <div className="panel" style={{ padding: 18, maxWidth: "none" }}>
              <div className="label" style={{ marginBottom: 6 }}>
                {keyName} key required
              </div>
              <p style={{ margin: "0 0 14px" }}>
                Searching {MEDIUM_LABEL[medium].toLowerCase()} needs a free {keyName} API key.
                Anime, manga, music, and books don’t need one.
              </p>
              <button className="btn btn--accent btn--lg" onClick={onNeedKey}>
                Add {keyName} key
              </button>
            </div>
            <div className="label">Or add by hand</div>
            <ManualAdd medium={medium} title={query} added={!!added[manualKey]} onAdd={addManual} />
          </div>
        ) : (
          <>
            {loading && (
              <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 6px" }}>
                Searching…
              </p>
            )}
            <ResultGrid
              gridRef={gridRef}
              results={results}
              medium={medium}
              added={added}
              onCardKey={handleCardKey}
              onPreview={(c, key, i) => void openPreview(c, key, i)}
              onAdd={add}
            />
            {searched && !loading && results.length === 0 && (
              <div className="stack" style={{ marginTop: 16 }}>
                <p className="muted" style={{ fontSize: "0.82rem" }}>
                  No matches — add it by hand:
                </p>
                <ManualAdd medium={medium} title={query} added={!!added[manualKey]} onAdd={addManual} />
              </div>
            )}
          </>
        )}
      </>
    );
  }

  const shownError = error ?? searchError;
  return (
    <div className="addpanel">
      <div className="addpanel__head">
        <span className="addpanel__title">
          {initialMedium ? `Add ${MEDIUM_LABEL[medium]} to library` : "Add to library"}
        </span>
        <button className="btn btn--ghost btn--icon-sm" onClick={onClose} title="Close">
          <IconClose />
        </button>
      </div>
      {body}
      {shownError && (
        <p className="error" style={{ marginTop: 12 }}>
          {shownError}
        </p>
      )}
    </div>
  );
}
