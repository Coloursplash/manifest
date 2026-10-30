import { useEffect, useState } from "react";

import { IconClose } from "./icons";

// Small commit-on-change inputs for the entry page.

/** A date + an explicit clear. The × matters: emptying a native date input isn't
 *  reliably possible in the webview, and a wrong date here is not cosmetic — it
 *  puts a row on the timeline. */
export function DateField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value?: string;
  onCommit: (v: string | null) => void;
}) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="label">{label}</span>
      <div className="row" style={{ gap: 4 }}>
        <input
          className="input"
          style={{ width: 150 }}
          type="date"
          value={value ?? ""}
          aria-label={label}
          onChange={(e) => onCommit(e.target.value || null)}
        />
        {value && (
          <button
            className="btn btn--ghost btn--icon-sm btn--dim"
            onClick={() => onCommit(null)}
            title={`Clear ${label.toLowerCase()} date`}
            aria-label={`Clear ${label}`}
          >
            <IconClose size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/** A whole number, committed on blur or ⏎ — and only when it actually changed,
 *  so tabbing through the page doesn't write anything. */
export function NumberField({
  label,
  value,
  onCommit,
  className,
}: {
  label?: string;
  value?: number;
  onCommit: (v: number | null) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  useEffect(() => setLocal(value?.toString() ?? ""), [value]);

  function commit() {
    const trimmed = local.trim();
    const next = trimmed === "" ? null : parseInt(trimmed, 10);
    if (next !== null && Number.isNaN(next)) {
      setLocal(value?.toString() ?? ""); // not a number: put the old value back
      return;
    }
    if (next === (value ?? null)) return;
    onCommit(next);
  }

  const input = (
    <input
      className={`input ${className ?? ""}`}
      style={className ? undefined : { width: 90 }}
      type="number"
      inputMode="numeric"
      value={local}
      aria-label={label}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );

  if (!label) return input;
  return (
    <label className="stack" style={{ gap: 4 }}>
      <span className="label">{label}</span>
      {input}
    </label>
  );
}
