import { useState } from "react";

import { RatingCircles } from "./Rating";
import { todayISO } from "../lib/notes";
import { VERBS, type Medium } from "../lib/types";

/** What one pass of the editor produces. `rating` is only ever set when the
 *  editor was asked to show one (`withRating`); undefined means "don't touch". */
export interface NoteDraft {
  date: string;
  tags: string[];
  body: string;
  rating?: number | null;
}

/** Compose or edit one dated log block: a date, the repeat tag (#rewatch /
 *  #reread / #replay …), free tags, and an optional body.
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
  onSubmit: (draft: NoteDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const repeatTag = VERBS[medium].repeat;
  const verb = VERBS[medium].past;

  const [date, setDate] = useState(initial.date);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = useState("");
  const [body, setBody] = useState(initial.body);
  const [rating, setRating] = useState<number | null>(initial.rating ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onSubmit({
        date: date.trim(),
        tags,
        body: body.trim(),
        ...(withRating ? { rating } : {}),
      });
      if (mode === "add") {
        setDate(todayISO());
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

  return (
    <div className={`note-editor stack ${mode === "edit" ? "note-editor--edit" : ""}`}>
      {mode === "edit" && <div className="note-editor__head label">Editing entry</div>}
      <div className="row wrap">
        <input
          className="input"
          style={{ width: 160 }}
          type="date"
          value={date}
          aria-label="Date"
          onChange={(e) => setDate(e.target.value)}
        />
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
        className="textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Thoughts (optional)"
      />

      <div className="row">
        <button className="btn btn--accent btn--lg" onClick={submit} disabled={busy}>
          {label}
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
