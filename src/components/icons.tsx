// Inline stroke icons (Feather-style). Self-contained — no icon font or CDN,
// in keeping with the offline-first principle. `currentColor` makes them theme.
import type { ReactNode } from "react";
import type { Medium } from "../lib/types";

function Svg({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const IconEdit = (p: P) => (
  <Svg {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);

export const IconTrash = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

// sliders — reads as a DAW control, used for settings
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <path d="M1 14h6M9 8h6M17 16h6" />
  </Svg>
);

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Svg>
);

// Drag handle — two rows of dots, the universal "grab to reorder" affordance.
export const IconGrip = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="6" r="1" />
    <circle cx="15" cy="6" r="1" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
    <circle cx="9" cy="18" r="1" />
    <circle cx="15" cy="18" r="1" />
  </Svg>
);

export const IconFolder = (p: P) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Svg>
);

// 2×2 keys — the grid/shelf view.
export const IconGrid = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </Svg>
);

// Dated nodes down a spine — the timeline/diary view.
export const IconTimeline = (p: P) => (
  <Svg {...p}>
    <circle cx="5" cy="6" r="1.6" />
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="5" cy="18" r="1.6" />
    <path d="M10 6h10M10 12h10M10 18h7" />
  </Svg>
);

// Panel-with-a-spine — the collapse-sidebar toggle.
export const IconSidebar = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.6" />
    <path d="M9 4v16" />
  </Svg>
);

// --- per-medium glyphs -----------------------------------------------------
export const IconFilm = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </Svg>
);
export const IconTv = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="1.5" />
    <path d="M8 22h8M12 18v4" />
  </Svg>
);
export const IconAnime = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l1.9 5.4L19.5 10l-5.6 1.6L12 17l-1.9-5.4L4.5 10l5.6-1.6z" />
  </Svg>
);
export const IconBook = (p: P) => (
  <Svg {...p}>
    <path d="M5 4a1 1 0 0 1 1-1h12v15H6a1 1 0 0 0-1 1z" />
    <path d="M18 18H6a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h12z" />
  </Svg>
);
export const IconManga = (p: P) => (
  <Svg {...p}>
    <path d="M12 6C10.4 5 8 4.6 4 5v13c4-.6 6.4-.2 8 1 1.6-1.2 4-1.6 8-1V5c-4-.6-6.4-.2-8 1z" />
    <path d="M12 6v13" />
  </Svg>
);
export const IconGame = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="7" width="20" height="10" rx="5" />
    <path d="M6.5 12h3M8 10.5v3" />
    <path d="M15.5 11h.01M17.5 13h.01" />
  </Svg>
);
export const IconMusic = (p: P) => (
  <Svg {...p}>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </Svg>
);

export const MEDIUM_ICON: Record<Medium, (p: P) => ReactNode> = {
  film: IconFilm,
  tv: IconTv,
  anime: IconAnime,
  book: IconBook,
  manga: IconManga,
  game: IconGame,
  music: IconMusic,
};
