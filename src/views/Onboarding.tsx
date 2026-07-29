import { useEffect, useState } from "react";

import { IconBack, IconCheck, IconFolder } from "../components/icons";
import { MediaChooser } from "../components/MediaChooser";
import {
  chooseLibraryFolder,
  hasRawgKey,
  hasTmdbKey,
  setRawgKey,
  setTmdbKey,
} from "../lib/api";
import { MEDIUM_LABEL, type Medium } from "../lib/types";
import { ApiKeyField } from "./SettingsModal";

type StepKey = "folder" | "media" | "keys" | "ready";

const STEP_LABEL: Record<StepKey, string> = {
  folder: "Folder",
  media: "Track",
  keys: "Keys",
  ready: "Ready",
};

/** First-run setup: pick a library folder, choose what to track, drop in the
 *  optional API keys, then land on the home screen. Everything here also lives
 *  in Settings, so this is a convenience path, not the only way to configure. */
export function Onboarding({
  onComplete,
  mediaOrder,
  enabledMedia,
  onToggleMedium,
  onReorderMedia,
}: {
  /** Called once, at the end — App swaps in the home screen with this path. */
  onComplete: (path: string) => void;
  /** Every medium, in the user's order (for the draggable chooser). */
  mediaOrder: Medium[];
  enabledMedia: Medium[];
  /** Toggle a category on/off (persists live, like Settings). */
  onToggleMedium: (m: Medium) => void;
  /** Reorder the categories (persists live). */
  onReorderMedia: (order: Medium[]) => void;
}) {
  const [path, setPath] = useState<string | null>(null);
  const [step, setStep] = useState<StepKey>("folder");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTmdb, setHasTmdb] = useState(false);
  const [hasRawg, setHasRawg] = useState(false);

  // Which providers are worth asking about depends on what they chose to track.
  const needsTmdb = enabledMedia.includes("film") || enabledMedia.includes("tv");
  const needsRawg = enabledMedia.includes("game");
  const showKeys = needsTmdb || needsRawg;

  // The keys step is skipped entirely when nothing they track needs a key.
  const steps: StepKey[] = [
    "folder",
    "media",
    ...(showKeys ? (["keys"] as StepKey[]) : []),
    "ready",
  ];
  const idx = Math.max(0, steps.indexOf(step));

  // Refresh key presence whenever we land on the keys step (they may have been
  // set on a previous run, or just saved via the field below).
  useEffect(() => {
    if (step !== "keys") return;
    hasTmdbKey().then(setHasTmdb).catch(() => {});
    hasRawgKey().then(setHasRawg).catch(() => {});
  }, [step]);

  async function pickFolder() {
    setBusy(true);
    setError(null);
    try {
      const chosen = await chooseLibraryFolder();
      if (chosen) setPath(chosen);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (step === "folder") {
      if (path) setStep("media");
    } else if (step === "media") {
      setStep(showKeys ? "keys" : "ready");
    } else if (step === "keys") {
      setStep("ready");
    } else if (step === "ready" && path) {
      onComplete(path);
    }
  }

  function back() {
    if (step === "media") setStep("folder");
    else if (step === "keys") setStep("media");
    else if (step === "ready") setStep(showKeys ? "keys" : "media");
  }

  const canAdvance = step !== "folder" || path !== null;

  return (
    <div className="center">
      <div className="panel wizard">
        <div className="brand" style={{ marginBottom: 18 }}>
          <div className="brand__name">
            MANIFEST<span className="dotmark">.</span>
          </div>
          <div className="brand__spec">マニフェスト</div>
        </div>

        <ol className="wizard__steps">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`wizard__step ${i === idx ? "is-current" : ""} ${
                i < idx ? "is-done" : ""
              }`}
            >
              <span className="wizard__dot">
                {i < idx ? <IconCheck size={12} /> : i + 1}
              </span>
              <span className="wizard__step-label">{STEP_LABEL[s]}</span>
            </li>
          ))}
        </ol>

        {step === "folder" && (
          <div className="wizard__pane">
            <h2>Choose a library folder</h2>
            <p>
              Your films, TV, anime, books, manga, games, and music live here as
              plain <code>.toml</code> files you own and can read in any editor.
              manifest just watches this folder — pick an empty one to start, or
              an existing library to open it.
            </p>
            {path ? (
              <div className="wizard__chosen">
                <IconFolder size={16} />
                <code className="wizard__path" title={path}>
                  {path}
                </code>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={pickFolder}
                  disabled={busy}
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                className="btn btn--accent"
                onClick={pickFolder}
                disabled={busy}
              >
                {busy ? "Opening…" : "Choose folder"}
              </button>
            )}
          </div>
        )}

        {step === "media" && (
          <div className="wizard__pane">
            <h2>What do you want to track?</h2>
            <p>
              Pick the categories you care about and drag to order them — they set
              the rail and the Add flow. You can change this any time in Settings,
              and hidden types are never touched on disk.
            </p>
            <MediaChooser
              order={mediaOrder}
              enabled={enabledMedia}
              onReorder={onReorderMedia}
              onToggle={onToggleMedium}
            />
          </div>
        )}

        {step === "keys" && (
          <div className="wizard__pane">
            <h2>API keys</h2>
            <p>
              Optional — these unlock search for some categories. You can skip
              now and add them later in Settings; anime, manga, books, and music
              never need a key.
            </p>
            {needsTmdb && (
              <ApiKeyField
                label="TMDB API key"
                blurb="Enables film and TV search (free from themoviedb.org). Stored locally in manifest's config, never in your library."
                placeholder="Paste your TMDB API key"
                hasKey={hasTmdb}
                onSave={setTmdbKey}
                onChanged={() => hasTmdbKey().then(setHasTmdb)}
              />
            )}
            {needsRawg && (
              <ApiKeyField
                label="RAWG API key"
                blurb="Enables videogame search (free from rawg.io/apidocs). Stored locally in manifest's config, never in your library."
                placeholder="Paste your RAWG API key"
                hasKey={hasRawg}
                onSave={setRawgKey}
                onChanged={() => hasRawgKey().then(setHasRawg)}
              />
            )}
          </div>
        )}

        {step === "ready" && (
          <div className="wizard__pane">
            <h2>You're all set</h2>
            <p>
              manifest is watching your folder. Hit <strong>+ Add</strong> to log
              your first title, or edit the <code>.toml</code> files by hand —
              either way the app keeps up.
            </p>
            <dl className="wizard__summary">
              <dt>Folder</dt>
              <dd>
                <code title={path ?? ""}>{path}</code>
              </dd>
              <dt>Tracking</dt>
              <dd>{enabledMedia.map((m) => MEDIUM_LABEL[m]).join(" · ")}</dd>
              {showKeys && (
                <>
                  <dt>Keys</dt>
                  <dd>
                    {[
                      needsTmdb && `TMDB ${hasTmdb ? "✓" : "—"}`,
                      needsRawg && `RAWG ${hasRawg ? "✓" : "—"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}

        {error && (
          <p className="error" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <div className="wizard__nav">
          {idx > 0 ? (
            <button className="btn btn--ghost" onClick={back}>
              <IconBack size={16} /> Back
            </button>
          ) : (
            <span />
          )}
          <button
            className="btn btn--accent btn--lg"
            onClick={next}
            disabled={!canAdvance}
          >
            {step === "ready"
              ? "Enter manifest"
              : step === "keys"
                ? hasTmdb || hasRawg
                  ? "Continue"
                  : "Skip for now"
                : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
