import { useState } from "react";

import { IconClose } from "../components/icons";
import { setRawgKey, setTmdbKey } from "../lib/api";
import { ACCENT_PRESETS } from "../lib/accent";
import { MEDIA, MEDIUM_LABEL, type Medium } from "../lib/types";
import type { Theme } from "../lib/theme";

export function SettingsModal({
  theme,
  onTheme,
  accent,
  onAccent,
  enabledMedia,
  onToggleMedium,
  onRefreshAll,
  hasKey,
  onKeyChanged,
  hasRawgKey,
  onRawgKeyChanged,
  onClose,
}: {
  theme: Theme;
  onTheme: (t: Theme) => void;
  accent: string;
  onAccent: (hex: string) => void;
  enabledMedia: Medium[];
  onToggleMedium: (m: Medium) => void;
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
            Choose which categories show up in the header and the Add flow. Hidden
            types stay on disk untouched — this only tidies the UI.
          </p>
          <div className="tabs">
            {MEDIA.map((m) => {
              const on = enabledMedia.includes(m);
              const last = on && enabledMedia.length === 1;
              return (
                <button
                  key={m}
                  className={`tab ${on ? "tab--on" : ""}`}
                  onClick={() => onToggleMedium(m)}
                  disabled={last}
                  title={last ? "Keep at least one type enabled" : undefined}
                >
                  {MEDIUM_LABEL[m]}
                </button>
              );
            })}
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
 *  otherwise. `onSave("")` clears; the parent re-reads `hasKey` via `onChanged`. */
function ApiKeyField({
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
