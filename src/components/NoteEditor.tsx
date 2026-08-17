import { useEffect, useRef, useState } from "react";

import { RatingCircles } from "./Rating";
import { todayISO } from "../lib/notes";
import { PROGRESS, VERBS, type Medium } from "../lib/types";

/** What one pass of the editor produces. `rating` is only ever set when the
 *  editor was asked to show one (`withRating`); undefined means "don't touch". */
export interface NoteDraft {
  /** The day it happened, or the day a stretch *started*. */
  date: string;
  /** For media you get through over time: the day it ended. Empty = one day. */
  end?: string;
  tags: string[];
  body: string;
  rating?: number | null;
}

/** Compose or edit one log block: when, the repeat tag (#rewatch / #reread /
 *  #replay …), free tags, and an optional body.
 *
 *  "When" is not one date for most media. A film is a sitting; a season is two
 *  months of evenings and a book is three weeks of them. So single-sitting media
 *  (film, music — `PROGRESS[medium].single`) get one date, and everything else
 *  gets **From → To**, where From is optional: leave it blank and you've logged
 *  the single day you finished, exactly as before. Nothing is invented on the
 *  user's behalf either way.
 *
 *  Shared by the entry page (add + edit a block) and the add flow's log dialog,
 *  which is the Letterboxd move — clicking "Watched" asks *when* and *what you
 *  thought* instead of silently filing today's date. */
export function NoteEditor({
  medium,
  mode,
  initial,
  withRating = false,
  submitLabel,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  medium: Medium;
  mode: "add" | "edit";
  initial: NoteDraft;
  /** Show a rating control, and include it in the draft. */
  withRating?: boolean;
  /** Override the submit button's text (defaults to "Just watched it" etc.). */
  submitLabel?: string;
  /** Take focus on mount — for an editor opened by a keystroke, so the caret
   *  lands in the note rather than nowhere. */
  autoFocus?: boolean;
  onSubmit: (draft: NoteDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const repeatTag = VERBS[medium].repeat;
  const verb = VERBS[medium].past;
  // Film and music happen in one sitting; everything else can span days.
  const spans = !PROGRESS[medium].single;

  // `date` is the end (the day you finished) and `from` the optional start, so
  // the primary field stays the same one in both shapes. They're written to the
  // block the other way round — chronologically — by `submit`.
  const [date, setDate] = useState(initial.end || initial.date);
  const [from, setFrom] = useState(initial.end ? initial.date : "");
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [body, setBody] = useState(initial.body);
  const [rating, setRating] = useState<number | null>(initial.rating ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) bodyRef.current?.focus();
  }, [autoFocus]);

  function addTag(raw: string) {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }
  function toggleTag(t: string) {
    setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Write it chronologically: a start (when given) then the end.
      const end = date.trim();
      const start = spans ? from.trim() : "";
      await onSubmit({
        date: start && start <= end ? start : end,
        end: start && start <= end ? end : undefined,
        tags,
        body: body.trim(),
        ...(withRating ? { rating } : {}),
      });
      if (mode === "add") {
        setDate(todayISO());
        setFrom("");
        setTags([]);
        setTagInput("");
        setBody("");
        setRating(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const label =
    submitLabel ??
    (mode === "edit" ? "Save" : body.trim() ? "Log with note" : `Just ${verb} it`);

  // ⌘/Ctrl+⏎ commits from any field (plain ⏎ belongs to the textarea and the
  // tag box) and Esc backs out, so a log can be written without a mouse.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!busy) void submit();
      return;
    }
    if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      e.stopPropagation(); // don't let the app-wide Escape fire too
      onCancel();
    }
  }

  return (
    <div
      className={`note-editor stack ${mode === "edit" ? "note-editor--edit" : ""}`}
      onKeyDown={onKeyDown}
    >
      {mode === "edit" && <div className="note-editor__head label">Editing entry</div>}
      <div className="row wrap">
        {spans ? (
          // Two fields, because one date can't say "I read it over March".
          // "From" is optional — blank means the single day you finished. They
          // deliberately aren't called Started/Finished: those are the entry's
          // own fields, sitting a few rows up the same page. This is the stretch
          // *this block* covers, which for a reread is a different thing.
          <div className="note-editor__span">
            <label className="note-editor__date">
              <span className="label">From</span>
              <input
                className="input"
                type="date"
                value={from}
                max={date || undefined}
                aria-label="From"
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <span className="note-editor__arrow" aria-hidden="true">
              →
            </span>
            <label className="note-editor__date">
              <span className="label">To</span>
              <input
                className="input"
                type="date"
                value={date}
                min={from || undefined}
                aria-label="To"
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <input
            className="input"
            style={{ width: 160 }}
            type="date"
            value={date}
            aria-label="Date"
            onChange={(e) => setDate(e.target.value)}
          />
        )}
        <button
          type="button"
          className={`chip ${tags.includes(repeatTag) ? "chip--on" : ""}`}
          onClick={() => toggleTag(repeatTag)}
        >
          #{repeatTag}
        </button>
        {tags
          .filter((t) => t !== repeatTag)
          .map((t) => (
            <span
              className="tag tag--removable"
              key={t}
              onClick={() => toggleTag(t)}
              title="remove"
            >
              #{t} ✕
            </span>
          ))}
        <input
          className="input"
          style={{ width: 130 }}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="+ tag"
        />
      </div>

      {withRating && <RatingCircles value={rating} onSet={setRating} />}

      <textarea
        ref={bodyRef}
        className="textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Thoughts (optional)"
      />

      <div className="row">
        <button className="btn btn--accent btn--lg" onClick={submit} disabled={busy}>
          {label}
          <kbd className="btn__key" aria-hidden="true">
            ⌘⏎
          </kbd>
        </button>
        {onCancel && (
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}
