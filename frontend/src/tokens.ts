// OfficialIQ design tokens — dark ("sideline") primary + light alternative.
//
// Drop-in replacement for the old NBA-inspired token set. The legacy key names
// (navy, red, bg, surface, border, text, muted, faint, correct, wrong,
// streak, font) are all still exported off `T`, so every page that reads
// `T.navy` / `T.red` today keeps compiling — the values behind them change.
//
// Semantic mapping from the old set to this one:
//   T.navy  → the raised chrome/header surface (was the navy block)
//   T.red   → the primary action + active accent (now green, not red)
//   T.wrong → incorrect answers and lapsed/overdue states (stays red)
//   T.streak → deadline / attention (amber)
// New keys (panel, panelAlt, accent, attention, hairline, onAccent) are the
// ones to prefer in new code; the legacy names are aliases onto them.
//
// Fonts: Barlow + Barlow Condensed. Added to frontend/index.html.
// Use `T.fontCondensed` for numerals, stat values and screen titles.

export type Mode = "dark" | "light";

export type Tokens = {
  mode: Mode;
  // surfaces
  bg: string;        // app background
  surface: string;   // card surface
  panel: string;     // raised chrome: headers, tab bar
  panelAlt: string;  // secondary fill: chips, quiet buttons
  border: string;    // card / control border
  hairline: string;  // internal dividers, lower contrast than border
  // text
  text: string;
  muted: string;
  faint: string;
  // meaning
  accent: string;     // primary action, correct, active tab
  onAccent: string;   // text/icon on an accent fill
  attention: string;  // deadlines, borderline mastery
  wrong: string;      // incorrect answer, lapsed cert
  // legacy aliases (see header comment)
  navy: string;
  red: string;
  correct: string;
  streak: string;
  white: string;
  // type
  font: string;
  fontCondensed: string;
  fontMono: string;
};

const FONT = "'Barlow', -apple-system, BlinkMacSystemFont, sans-serif";
const FONT_CONDENSED = "'Barlow Condensed', 'Barlow', sans-serif";
const FONT_MONO = "ui-monospace, Menlo, Consolas, monospace";

// Accent fills are identical in both modes so the brand reads the same on a
// gym-dark phone and a bright office monitor; only the *text* weights of each
// hue change, because green-on-white needs more lightness contrast.
const ACCENT_FILL = "oklch(0.74 0.16 150)";
const ATTENTION_FILL = "oklch(0.79 0.14 78)";
const WRONG_FILL = "oklch(0.68 0.19 32)";

export const dark: Tokens = {
  mode: "dark",
  bg: "#0D1012",
  surface: "#16191C",
  panel: "#131719",
  panelAlt: "#1C2124",
  border: "rgba(255,255,255,0.09)",
  hairline: "rgba(255,255,255,0.07)",
  text: "#F3F4F1",
  muted: "rgba(243,244,241,0.55)",
  faint: "rgba(243,244,241,0.42)",
  accent: ACCENT_FILL,
  onAccent: "#0D1012",
  attention: ATTENTION_FILL,
  wrong: WRONG_FILL,
  navy: "#1C2124",
  red: ACCENT_FILL,
  correct: ACCENT_FILL,
  streak: ATTENTION_FILL,
  white: "#F3F4F1",
  font: FONT,
  fontCondensed: FONT_CONDENSED,
  fontMono: FONT_MONO,
};

export const light: Tokens = {
  mode: "light",
  bg: "#F2F3EF",
  surface: "#FFFFFF",
  panel: "#FFFFFF",
  panelAlt: "#E9EAE4",
  border: "rgba(18,21,23,0.12)",
  hairline: "rgba(18,21,23,0.08)",
  text: "#121517",
  muted: "rgba(18,21,23,0.58)",
  faint: "rgba(18,21,23,0.45)",
  // Darker hue variants for text and 1px rules; fills below stay bright.
  accent: "oklch(0.48 0.12 150)",
  onAccent: "#0D1012",
  attention: "oklch(0.52 0.12 70)",
  wrong: "oklch(0.50 0.19 27)",
  navy: "#FFFFFF",
  red: "oklch(0.48 0.12 150)",
  correct: "oklch(0.48 0.12 150)",
  streak: "oklch(0.52 0.12 70)",
  white: "#FFFFFF",
  font: FONT,
  fontCondensed: FONT_CONDENSED,
  fontMono: FONT_MONO,
};

// Bright fills, shared by both modes. Use these for filled buttons, progress
// bars and mastery chips; use T.accent / T.attention / T.wrong for text,
// icons and borders, which need the mode-appropriate contrast.
export const fill = {
  accent: ACCENT_FILL,
  attention: ATTENTION_FILL,
  wrong: WRONG_FILL,
  onAccent: "#0D1012",
} as const;

// Tinted backgrounds for answer reveals and the mastery grid.
export const tint = {
  dark: {
    accent: "rgba(120,200,150,0.13)",
    attention: "rgba(230,180,90,0.13)",
    wrong: "rgba(220,120,100,0.13)",
  },
  light: {
    accent: "#E4F1E9",
    attention: "#FBF1DC",
    wrong: "#F9E7E3",
  },
} as const;

const MODE_KEY = "officialiq_theme";

/** Dark is the default; a stored choice or the OS preference wins. */
export function preferredMode(): Mode {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(MODE_KEY) : null;
  if (stored === "dark" || stored === "light") return stored;
  if (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

export function setMode(mode: Mode) {
  T = mode === "light" ? light : dark;
  if (typeof localStorage !== "undefined") localStorage.setItem(MODE_KEY, mode);
}

/**
 * The live token set. Pages keep importing `{ T }` and reading `T.navy`,
 * `T.red` and friends exactly as before — no per-page changes required to
 * pick up the new palette.
 */
export let T: Tokens = dark;

export function tokensFor(mode: Mode): Tokens {
  return mode === "light" ? light : dark;
}
