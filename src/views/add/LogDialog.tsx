import { Cover } from "../../components/Cover";
import { IconBack } from "../../components/icons";
import { NoteEditor, type NoteDraft } from "../../components/NoteEditor";
import { todayISO } from "../../lib/logs";
import { VERBS, type Candidate, type Medium } from "../../lib/types";

/** The log dialog: what you get instead of a silent "filed as watched". Pick the
 *  date, tag it a rewatch, rate it, say something — or just hit the button and
 *  take today's date. Nothing is written until you commit, so backing out here
 *  leaves no entry behind. */
export function LogDialog({
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
          <div className="label">{verbs.log}</div>
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
