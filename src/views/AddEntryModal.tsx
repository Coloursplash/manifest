import { Fragment, useState } from "react";

import { Cover } from "../components/Cover";
import { IconBack, IconClose, IconSearch } from "../components/icons";
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
  type Candidate,
  type Entry,
  type Medium,
  type Status,
} from "../lib/types";

const quickLabel = (m: Medium, s: Status) =>
  s === "want" ? "Plan" : statusLabel(m, s);

/** Adding as "done" logs today's date and sets a finish date; "active" sets a
 *  start date. So clicking "Read" both files it and logs it in one go. */
async function finalize(entry: Entry, status: Status): Promise<Entry> {
  const today = todayISO();
  if (status === "done") {
    await patchEntry(entry.id, { finished: today });
    return appendNote(entry.id, today, [], "");
  }
  if (status === "active") {
    return patchEntry(entry.id, { started: today });
  }
  return entry;
}

export function AddEntryModal({
  hasKey,
  enabledMedia,
  initialMedium,
  onClose,
  onCreated,
  onNeedKey,
}: {
  hasKey: boolean;
  enabledMedia: Medium[];
  /** The active header filter. When set, the modal opens locked to it and
   *  hides its own category picker; when null ("All") it shows the picker. */
  initialMedium: Medium | null;
  onClose: () => void;
  onCreated: (e: Entry) => void;
  onNeedKey: () => void;
}) {
  const [medium, setMedium] = useState<Medium>(
    initialMedium ?? enabledMedia[0],
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, Status>>({});
  // The result the user clicked to inspect before committing (null = grid view).
  const [preview, setPreview] = useState<{ c: Candidate; key: string } | null>(null);
  const [previewExtra, setPreviewExtra] = useState<Record<string, unknown>>({});
  const [previewLoading, setPreviewLoading] = useState(false);

  const keyMissing = (m: Medium) => (m === "film" || m === "tv") && !hasKey;
  const needsKey = keyMissing(medium);

  // Open the info preview for a hit, pulling crew/genres for providers that
  // gate them behind a detail call (TMDB). AniList/books already carry theirs.
  async function openPreview(c: Candidate, key: string) {
    setPreview({ c, key });
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

  function switchMedium(m: Medium) {
    setMedium(m);
    setAdded({});
    setPreview(null);
    // Re-run the same query in the new category — faster than retyping.
    if (query.trim() && !keyMissing(m)) {
      runSearch(m, query);
    } else {
      setResults([]);
      setSearched(false);
    }
  }

  async function add(c: Candidate, key: string, status: Status) {
    setError(null);
    try {
      // Pull crew/genres for providers that need a follow-up (TMDB), then fold
      // in the summary. Enrichment is best-effort — a failed detail fetch still
      // files the entry with what search already gave us.
      const details = c.reference
        ? await fetchDetails(medium, c.reference).catch(() => ({}))
        : {};
      const fields: Record<string, unknown> = { ...(c.fields ?? {}), ...details };
      if (c.summary && fields.summary === undefined) fields.summary = c.summary;

      const created = await createEntry({
        medium,
        title: c.title,
        year: c.year,
        cover: c.cover,
        status,
        fields,
      });
      onCreated(await finalize(created, status));
      setAdded((a) => ({ ...a, [key]: status }));
    } catch (e) {
      setError(String(e));
    }
  }

  async function addManual(status: Status) {
    if (!query.trim()) return;
    setError(null);
    try {
      const created = await createEntry({ medium, title: query.trim(), status });
      onCreated(await finalize(created, status));
      setAdded((a) => ({ ...a, [`manual:${query.trim()}`]: status }));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>
            {initialMedium
              ? `Add ${MEDIUM_LABEL[medium]} to library`
              : "Add to library"}
          </h3>
          <button
            className="btn btn--ghost btn--icon-sm"
            onClick={onClose}
            title="Close"
          >
            <IconClose />
          </button>
        </div>

        {preview ? (
          <CandidatePreview
            candidate={preview.c}
            extra={previewExtra}
            loading={previewLoading}
            medium={medium}
            added={added[preview.key]}
            onBack={() => setPreview(null)}
            onAdd={(status) => add(preview.c, preview.key, status)}
          />
        ) : (
          <>
        {/* On "All", pick the type here; from a specific category the heading
            already names it, so no picker is shown. */}
        {initialMedium === null && (
          <div className="tabs" style={{ marginBottom: 16 }}>
            {enabledMedia.map((m) => (
              <button
                key={m}
                className={`tab ${medium === m ? "tab--on" : ""}`}
                onClick={() => switchMedium(m)}
              >
                {MEDIUM_LABEL[m]}
              </button>
            ))}
          </div>
        )}

        {needsKey ? (
          <div className="stack">
            <div className="panel" style={{ padding: 18, maxWidth: "none" }}>
              <div className="label" style={{ marginBottom: 6 }}>
                TMDB key required
              </div>
              <p style={{ margin: "0 0 14px" }}>
                Searching {MEDIUM_LABEL[medium].toLowerCase()} needs a free TMDB
                API key. Anime, manga, and books don’t need one.
              </p>
              <button className="btn btn--accent btn--lg" onClick={onNeedKey}>
                Add TMDB key
              </button>
            </div>
            <div className="label">Or add by hand</div>
            <ManualAdd
              medium={medium}
              query={query}
              setQuery={setQuery}
              added={!!added[`manual:${query.trim()}`]}
              onAdd={addManual}
            />
          </div>
        ) : (
          <>
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

            <div className="sgrid">
              {results.map((c, i) => {
                const key = `${i}:${c.title}`;
                const done = added[key];
                return (
                  <div className="scard" key={key}>
                    <div
                      className="scard__cover"
                      onClick={() => openPreview(c, key)}
                      title="View details"
                    >
                      <Cover url={c.cover} title={c.title}>
                        {done ? (
                          <div className="scard__added">✓ {statusLabel(medium, done)}</div>
                        ) : (
                          <div className="scard__overlay">
                            <button
                              className="btn btn--accent btn--block"
                              onClick={(e) => {
                                e.stopPropagation();
                                add(c, key, "done");
                              }}
                            >
                              {quickLabel(medium, "done")}
                            </button>
                            <div className="row" style={{ gap: 6 }}>
                              <button
                                className="btn btn--sm btn--block"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  add(c, key, "want");
                                }}
                              >
                                Plan
                              </button>
                              <button
                                className="btn btn--sm btn--block"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  add(c, key, "active");
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

            {searched && !loading && results.length === 0 && (
              <div className="stack" style={{ marginTop: 16 }}>
                <p className="muted" style={{ fontSize: "0.82rem" }}>
                  No matches — add it by hand:
                </p>
                <ManualAdd
                  medium={medium}
                  query={query}
                  setQuery={setQuery}
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
      </div>
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
  onBack,
  onAdd,
}: {
  candidate: Candidate;
  extra: Record<string, unknown>;
  loading: boolean;
  medium: Medium;
  added?: Status;
  onBack: () => void;
  onAdd: (status: Status) => void;
}) {
  const c = candidate;
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
    <div className="preview">
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
}: {
  medium: Medium;
  query: string;
  setQuery: (s: string) => void;
  added: boolean;
  onAdd: (status: Status) => void;
}) {
  return (
    <div className="row wrap">
      <input
        className="input"
        style={{ flex: 1, minWidth: 160 }}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Title"
      />
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
