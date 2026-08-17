import { useState } from "react";

import { IconClose } from "../components/icons";
import { MediaChooser } from "../components/MediaChooser";
import { setRawgKey, setTmdbKey } from "../lib/api";
import { ACCENT_PRESETS } from "../lib/accent";
import { basename, type Library } from "../lib/libraries";
import { MEDIUM_LABEL, type Medium } from "../lib/types";
import type { Theme } from "../lib/theme";

export function SettingsModal({
  libraryPath,
  libraries,
  onSwitchTo,
  onBrowseLibrary,
  onRenameLibrary,
  onRemoveLibrary,
  theme,
  onTheme,
  accent,
  onAccent,
  mediaOrder,
  enabledMedia,
  onToggleMedium,
  onReorderMedia,
  ownedMedia,
  onToggleOwnedMedium,
  onRefreshAll,
  hasKey,
  onKeyChanged,
  hasRawgKey,
  onRawgKeyChanged,
  onClose,
}: {
  /** The active library folder, shown in the Library section. */
  libraryPath: string | null;
  /** Recent libraries (most-recent-first), for the switch list. */
  libraries: Library[];
  /** Activate a known recent folder by path. */
  onSwitchTo: (path: string) => void;
  /** Open the native picker to add/activate another folder. */
  onBrowseLibrary: () => void;
  /** Set a library's nickname. */
  onRenameLibrary: (path: string, name: string) => void;
  /** Forget a library (removes it from the recent list only). */
  onRemoveLibrary: (path: string) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  accent: string;
  onAccent: (hex: string) => void;
  mediaOrder: Medium[];
  enabledMedia: Medium[];
  onToggleMedium: (m: Medium) => void;
  onReorderMedia: (order: Medium[]) => void;
  /** Media that track ownership (Backlog vs Wishlist). */
  ownedMedia: Medium[];
  onToggleOwnedMedium: (m: Medium) => void;
  onRefreshAll: (
    onProgress?: (done: number, total: number) => void,
  ) => Promise<{ updated: number; failed: number; total: number }>;
  hasKey: boolean;
  onKeyChanged: () => void;
  hasRawgKey: boolean;
  onRawgKeyChanged: () => void;
  onClose: () => void;
}) {
  const [refreshing, setRefreshing] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  async function runRefreshAll() {
    if (refreshing) return;
    setRefreshNote(null);
    setRefreshing({ done: 0, total: 0 });
    const res = await onRefreshAll((done, total) => setRefreshing({ done, total }));
    setRefreshing(null);
    setRefreshNote(
      res.total === 0
        ? "Library is empty — nothing to refresh."
        : `Refreshed ${res.updated} of ${res.total}` +
            (res.failed ? ` · ${res.failed} had no confident match.` : "."),
    );
  }

  const isCustom = !ACCENT_PRESETS.includes(accent.toLowerCase());

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Settings</h3>
          <button
            className="btn btn--ghost btn--icon-sm"
            onClick={onClose}
            title="Close"
          >
            <IconClose />
          </button>
        </div>

        {/* Library */}
        <div className="section">
          <div className="section__label">Library</div>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 12px" }}>
            The folder manifest is watching. Keep separate libraries — per person,
            or one for you and one for someone else on this machine — and switch
            between them here. Nickname each so they're easy to tell apart;
            nothing on disk is moved or changed.
          </p>

          <div className="lib-recents">
            {libraries.map((l) => (
              <RecentLibraryRow
                key={l.path}
                lib={l}
                isCurrent={l.path === libraryPath}
                onSwitch={() => onSwitchTo(l.path)}
                onRename={(name) => onRenameLibrary(l.path, name)}
                onRemove={() => onRemoveLibrary(l.path)}
              />
            ))}
          </div>

          <button
            className="btn btn--accent"
            style={{ marginTop: 14 }}
            onClick={onBrowseLibrary}
          >
            Open another folder…
          </button>
        </div>

        {/* Appearance */}
        <div className="section">
          <div className="section__label">Appearance</div>

          <div className="row" style={{ marginBottom: 16 }}>
            <span className="label" style={{ width: 74 }}>
              Theme
            </span>
            <div className="tabs">
              {(["dark", "light"] as Theme[]).map((t) => (
                <button
                  key={t}
                  className={`tab ${theme === t ? "tab--on" : ""}`}
                  onClick={() => onTheme(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="row">
            <span className="label" style={{ width: 74 }}>
              Accent
            </span>
            <div className="swatches">
              {ACCENT_PRESETS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${accent.toLowerCase() === c ? "swatch--on" : ""}`}
                  style={{ background: c }}
                  onClick={() => onAccent(c)}
                  title={c}
                />
              ))}
              <label
                className={`swatch swatch--custom ${isCustom ? "swatch--on" : ""}`}
                title="Custom colour"
                style={isCustom ? { background: accent } : undefined}
              >
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => onAccent(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Media types */}
        <div className="section">
          <div className="section__label">Media types</div>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 12px" }}>
            Choose which categories show up in the rail and the Add flow, and drag
            to reorder them. Hidden types stay on disk untouched — this only tidies
            the UI.
          </p>
          <MediaChooser
            order={mediaOrder}
            enabled={enabledMedia}
            onReorder={onReorderMedia}
            onToggle={onToggleMedium}
          />
        </div>

        {/* Ownership */}
        <div className="section">
          <div className="section__label">Ownership</div>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 12px" }}>
            For media you buy a copy of, the Backlog splits in two: things you own
            but haven't started, and a <strong>Wishlist</strong> of things you'd
            have to buy first. Entries in these categories get an{" "}
            <strong>Owned</strong> toggle. Off for everything else — it makes
            little sense for anything you stream.
          </p>
          <div className="tabs">
            {enabledMedia.map((m) => (
              <button
                key={m}
                className={`chip ${ownedMedia.includes(m) ? "chip--on" : ""}`}
                onClick={() => onToggleOwnedMedium(m)}
                aria-pressed={ownedMedia.includes(m)}
              >
                {MEDIUM_LABEL[m]}
              </button>
            ))}
          </div>
        </div>

        {/* Library metadata */}
        <div className="section">
          <div className="section__label">Library metadata</div>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 12px" }}>
            Re-fetch covers, summaries, crew and genres for every entry — useful
            for items added before richer metadata existed. Your notes, ratings,
            status and progress are left untouched.
          </p>
          <div className="row" style={{ alignItems: "center", gap: 12 }}>
            <button
              className="btn btn--accent"
              onClick={runRefreshAll}
              disabled={!!refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh all metadata"}
            </button>
            {refreshing && refreshing.total > 0 && (
              <span className="muted" style={{ fontSize: "0.78rem" }}>
                {refreshing.done} / {refreshing.total}
              </span>
            )}
          </div>
          {refreshNote && (
            <p className="muted" style={{ marginTop: 10, fontSize: "0.78rem" }}>
              {refreshNote}
            </p>
          )}
        </div>

        {/* TMDB */}
        <ApiKeyField
          label="TMDB API key"
          blurb="Enables film and TV search (free from themoviedb.org). Stored locally in manifest's config, never in your library. Anime, manga, music, and books need no key."
          placeholder="Paste your TMDB API key"
          hasKey={hasKey}
          onSave={setTmdbKey}
          onChanged={onKeyChanged}
        />

        {/* RAWG */}
        <ApiKeyField
          label="RAWG API key"
          blurb="Enables videogame search (free from rawg.io/apidocs). Stored locally in manifest's config, never in your library."
          placeholder="Paste your RAWG API key"
          hasKey={hasRawgKey}
          onSave={setRawgKey}
          onChanged={onRawgKeyChanged}
        />
      </div>
    </div>
  );
}

/** One API-key row: masked when set (with a clear button), an input + Save
 *  otherwise. `onSave("")` clears; the parent re-reads `hasKey` via `onChanged`.
 *  Shared by Settings and the first-run wizard. */
export function ApiKeyField({
  label,
  blurb,
  placeholder,
  hasKey,
  onSave,
  onChanged,
}: {
  label: string;
  blurb: string;
  placeholder: string;
  hasKey: boolean;
  onSave: (key: string) => Promise<void>;
  onChanged: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function save(clear = false) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await onSave(clear ? "" : key.trim());
      setKey("");
      onChanged();
      setNote(clear ? "Key cleared." : "Key saved.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section">
      <div className="section__label">{label}</div>
      <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 12px" }}>
        {blurb}
      </p>

      {hasKey ? (
        // A key exists: show it's set (masked) and require clearing to change.
        <div className="keyfield">
          <input
            className="input"
            value="••••••••••••••••"
            disabled
            aria-label={`${label} is set`}
          />
          <button
            className="keyfield__x btn btn--ghost btn--icon-sm btn--dim"
            onClick={() => save(true)}
            disabled={busy}
            title="Remove key"
          >
            <IconClose size={16} />
          </button>
        </div>
      ) : (
        <>
          <input
            className="input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={placeholder}
            type="password"
          />
          <div className="row" style={{ marginTop: 14 }}>
            <button
              className="btn btn--accent"
              onClick={() => save(false)}
              disabled={busy || !key.trim()}
            >
              Save
            </button>
          </div>
        </>
      )}

      {(note || error) && (
        <p
          className={error ? "error" : "muted"}
          style={{ marginTop: 10, fontSize: "0.78rem" }}
        >
          {error || note}
        </p>
      )}
    </div>
  );
}

/** One row in the recent-libraries list: an editable nickname, the folder path,
 *  and switch/forget actions. The nickname is a local draft committed on blur or
 *  Enter so we don't churn storage on every keystroke. */
function RecentLibraryRow({
  lib,
  isCurrent,
  onSwitch,
  onRename,
  onRemove,
}: {
  lib: Library;
  isCurrent: boolean;
  onSwitch: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(lib.name);

  function commit() {
    const next = draft.trim() || basename(lib.path);
    setDraft(next);
    if (next !== lib.name) onRename(next);
  }

  return (
    <div className={`lib-recent ${isCurrent ? "is-current" : ""}`}>
      <input
        className="input lib-recent__name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label="Library nickname"
        placeholder={basename(lib.path)}
      />
      <code className="lib-recent__path" title={lib.path}>
        {lib.path}
      </code>
      {isCurrent ? (
        <span className="chip lib-recent__current">Current</span>
      ) : (
        <div className="lib-recent__actions">
          <button className="btn btn--sm" onClick={onSwitch}>
            Switch
          </button>
          <button
            className="btn btn--ghost btn--icon-sm btn--dim"
            onClick={onRemove}
            title="Forget this library"
          >
            <IconClose size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
