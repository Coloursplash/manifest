import { Fragment, useEffect, useRef } from "react";

import { Cover } from "../../components/Cover";
import { IconBack } from "../../components/icons";
import { formatValue, humanizeLabel } from "../../lib/fields";
import { statusLabel, type Candidate, type Medium, type Status } from "../../lib/types";
import { quickLabel, statusForEnter } from "./keys";

/** Read-only info page for a search hit — cover, synopsis, crew, genres — so
 *  the user can confirm it's the right title before committing. Adds from here
 *  too. `extra` is the (possibly async) detail fetch merged over the hit. */
export function CandidatePreview({
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
