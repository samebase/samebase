// Pure helpers of time. Every value on screen comes from `t`, the seconds since the first frame.

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 0 before `a`, 1 after `b`, linear between. */
export const progress = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const out = (p: number) => 1 - (1 - p) ** 3;

/** Eased in and out between `a` and `b`: camera moves and wipes. */
export const ease = (t: number, a: number, b: number) => inOut(progress(t, a, b));

/** Eased out between `a` and `b`: things that arrive. */
export const rise = (t: number, a: number, b: number) => out(progress(t, a, b));

/** In between `a` and `b`, out between `c` and `d`. */
export const window4 = (t: number, a: number, b: number, c: number, d: number) =>
  rise(t, a, b) * (1 - ease(t, c, d));

export const mix = (from: number, to: number, p: number) => from + (to - from) * p;

/** The characters of `text` typed between `a` and `b`. */
export const typedCount = (length: number, t: number, a: number, b: number) =>
  Math.round(length * progress(t, a, b));

export const typed = (text: string, t: number, a: number, b: number) =>
  text.slice(0, typedCount(text.length, t, a, b));
