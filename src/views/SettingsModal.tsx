import { useState } from "react";

import { setTmdbKey } from "../lib/api";

/** Minimal settings: just the TMDB key for now (books/anime need no key). */
export function SettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await setTmdbKey(key.trim());
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal modal--narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Settings</h3>
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="label" style={{ marginBottom: 8 }}>
          TMDB API key
        </div>
        <p className="muted" style={{ fontSize: "0.78rem", marginBottom: 12 }}>
          Free from themoviedb.org — enables film and TV search. Stored locally
          in manifest's config, never in your library. Anime, manga, and books
          need no key.
        </p>
        <input
          className="input"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Paste your TMDB API key"
          type="password"
        />
        {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn--accent" onClick={save} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
