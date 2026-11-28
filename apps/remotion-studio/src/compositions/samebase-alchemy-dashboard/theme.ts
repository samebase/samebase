import { loadFont as loadArimo } from "@remotion/google-fonts/Arimo";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

// The app's --font-sans is Liberation Sans (apps/samebase/src/index.css). Arimo has the same
// design and metrics and loads from Google Fonts in a headless render.
export const sans = loadArimo("normal", {
  subsets: ["latin"],
  weights: ["400", "600", "700"],
}).fontFamily;

export const mono = loadJetBrainsMono("normal", {
  subsets: ["latin"],
  weights: ["400", "500"],
}).fontFamily;

/** The dark half: the editor, the run and the store. */
export const dark = {
  bg: "#0b0e0f",
  panel: "#111618",
  panelHi: "#161d1f",
  border: "#243034",
  borderHi: "#34444a",
  text: "#e7ecec",
  muted: "#83918f",
  faint: "#56625f",
  thread: "#4c5c60",
  threadHi: "#b9c8c9",
  green: "#3fb950",
  amber: "#e3b341",
  keyword: "#9fb4ff",
  string: "#a5d6a7",
  type: "#f0c674",
  comment: "#5f6d6b",
} as const;

/** The light half: the Samebase app, from apps/samebase/src/index.css. */
export const light = {
  bg: "#ffffff",
  text: "#0c0a09",
  muted: "#78716c",
  border: "#e7e5e4",
  mutedBg: "#f5f5f4",
  primary: "#394447",
  green: "#059669",
  greenSquare: "#10b981",
} as const;

/** The mono advance of JetBrains Mono, in em. */
export const MONO_ADVANCE = 0.6;
