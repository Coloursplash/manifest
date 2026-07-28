import { useState } from "react";

import { IconClose } from "../components/icons";
import { setTmdbKey } from "../lib/api";
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
  hasKey,
  onKeyChanged,
  onClose,
}: {
  theme: Theme;
  onTheme: (t: Theme) => void;
  accent: string;
  onAccent: (hex: string) => void;
  enabledMedia: Medium[];
  onToggleMedium: (m: Medium) => void;
  hasKey: boolean;
  onKeyChanged: () => void;
  onClose: () => void;
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
      await setTmdbKey(clear ? "" : key.trim());
      setKey("");
      onKeyChanged();
      setNote(clear ? "Key cleared." : "Key saved.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
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

        {/* TMDB */}
        <div className="section">
          <div className="section__label">TMDB API key</div>
          <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 12px" }}>
            Enables film and TV search (free from themoviedb.org). Stored locally
            in manifest's config, never in your library. Anime, manga, and books
            need no key.
          </p>

          {hasKey ? (
            // A key exists: show it's set (masked) and require clearing to change.
            <div className="keyfield">
              <input
                className="input"
                value="••••••••••••••••"
                disabled
                aria-label="TMDB key is set"
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
                placeholder="Paste your TMDB API key"
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
      </div>
    </div>
  );
}
