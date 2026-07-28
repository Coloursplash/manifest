import { useState } from "react";

import { chooseLibraryFolder } from "../lib/api";

/** First-run: point manifest at a folder. Everything else follows from this. */
export function Onboarding({ onChosen }: { onChosen: (path: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setBusy(true);
    setError(null);
    try {
      const path = await chooseLibraryFolder();
      if (path) onChosen(path);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <div className="panel">
        <div className="brand" style={{ marginBottom: 20 }}>
          <div className="brand__name">
            MANIFEST<span className="dotmark">.</span>
          </div>
          <div className="brand__spec">マニフェスト</div>
        </div>
        <h2>Choose a library folder</h2>
        <p>
          Your films, shows, anime, books, and manga live here as plain{" "}
          <code>.toml</code> files you own and can read in any editor. manifest
          just watches this folder — pick an empty one to start, or an existing
          library to open it.
        </p>
        <button className="btn btn--accent" onClick={pick} disabled={busy}>
          {busy ? "Opening…" : "Choose folder"}
        </button>
        {error && <p className="error" style={{ marginTop: 12 }}>{error}</p>}
      </div>
    </div>
  );
}
