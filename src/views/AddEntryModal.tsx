import { useState } from "react";

import { Cover } from "../components/Cover";
import { IconClose, IconSearch } from "../components/icons";
import { appendNote, createEntry, patchEntry, searchMetadata } from "../lib/api";
import { todayISO } from "../lib/notes";
import {
  MEDIA,
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
  onClose,
  onCreated,
  onNeedKey,
}: {
  hasKey: boolean;
  onClose: () => void;
  onCreated: (e: Entry) => void;
  onNeedKey: () => void;
}) {
  const [medium, setMedium] = useState<Medium>("film");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, Status>>({});

  const keyMissing = (m: Medium) => (m === "film" || m === "tv") && !hasKey;
  const needsKey = keyMissing(medium);

  async function runSearch(m: Medium, q: string) {
    if (!q.trim() || keyMissing(m)) return;
    setLoading(true);
    setError(null);
    setSearched(true);
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
      const created = await createEntry({
        medium,
        title: c.title,
        year: c.year,
        cover: c.cover,
        status,
        fields: c.fields ?? {},
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
          <h3>Add to library</h3>
          <button
            className="btn btn--ghost btn--icon-sm"
            onClick={onClose}
            title="Close"
          >
            <IconClose />
          </button>
        </div>

        <div className="tabs" style={{ marginBottom: 16 }}>
          {MEDIA.map((m) => (
            <button
              key={m}
              className={`tab ${medium === m ? "tab--on" : ""}`}
              onClick={() => switchMedium(m)}
            >
              {MEDIUM_LABEL[m]}
            </button>
          ))}
        </div>

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
                    <Cover url={c.cover} title={c.title}>
                      {done ? (
                        <div className="scard__added">✓ {statusLabel(medium, done)}</div>
                      ) : (
                        <div className="scard__overlay">
                          <button
                            className="btn btn--accent btn--block"
                            onClick={() => add(c, key, "done")}
                          >
                            {quickLabel(medium, "done")}
                          </button>
                          <div className="row" style={{ gap: 6 }}>
                            <button
                              className="btn btn--sm btn--block"
                              onClick={() => add(c, key, "want")}
                            >
                              Plan
                            </button>
                            <button
                              className="btn btn--sm btn--block"
                              onClick={() => add(c, key, "active")}
                            >
                              {quickLabel(medium, "active")}
                            </button>
                          </div>
                        </div>
                      )}
                    </Cover>
                    <div className="scard__title">
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

        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
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
