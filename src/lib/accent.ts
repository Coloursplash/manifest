// User-customizable accent colour. We override the `--accent` CSS var (plus a
// lighter hover shade and an auto-contrasting "ink" for text on the accent) on
// the root element, so it wins over the stylesheet in both themes. Persisted.

const KEY = "manifest-accent";
export const DEFAULT_ACCENT = "#ff5300";

// A curated, punchy palette (TE / Ableton-clip flavoured).
export const ACCENT_PRESETS = [
  "#ff5300", // orange (default)
  "#ff3b30", // red
  "#ffb400", // amber
  "#8ce04b", // lime
  "#31c48d", // green
  "#3b9dff", // blue
  "#a970ff", // violet
  "#ff4fa3", // magenta
];

export function getAccent(): string {
  return localStorage.getItem(KEY) || DEFAULT_ACCENT;
}

export function applyAccent(hex: string): void {
  const root = document.documentElement;
  root.style.setProperty("--accent", hex);
  root.style.setProperty("--accent-hi", lighten(hex, 0.16));
  root.style.setProperty("--accent-ink", pickInk(hex));
  localStorage.setItem(KEY, hex);
}

export function initAccent(): string {
  const a = getAccent();
  applyAccent(a);
  return a;
}

// --- colour helpers ---

function toRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.round(x).toString(16).padStart(2, "0"))
      .join("")
  );
}

function lighten(hex: string, amt: number): string {
  const [r, g, b] = toRgb(hex);
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

function chanLum(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relLum(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * chanLum(r) + 0.7152 * chanLum(g) + 0.0722 * chanLum(b);
}

/** Pick near-black or near-white for text on the accent, by WCAG contrast. */
function pickInk(hex: string): string {
  const L = relLum(hex);
  const contrastBlack = (L + 0.05) / 0.05;
  const contrastWhite = 1.05 / (L + 0.05);
  return contrastBlack >= contrastWhite ? "#141414" : "#f3f3f0";
}
