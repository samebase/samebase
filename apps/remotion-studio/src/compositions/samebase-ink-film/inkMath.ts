/** Shared math for the ink film: seeded randomness, value noise, easing, and 2D points. */

export type Point = [number, number];

/** Mulberry32: a small seeded generator, so every frame is a pure function of its seeds. */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash1(value: number): number {
  const x = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 1D value noise in [-1, 1]. */
export function vnoise(x: number, seed = 0): number {
  const cell = Math.floor(x);
  const f = x - cell;
  const u = f * f * (3 - 2 * f);
  return (hash1(cell + seed * 57.31) * (1 - u) + hash1(cell + 1 + seed * 57.31) * u) * 2 - 1;
}

export function fbm1(x: number, seed = 0): number {
  return vnoise(x, seed) * 0.65 + vnoise(x * 2.13 + 5.1, seed + 1) * 0.35;
}

/** 2D value noise in [-1, 1]. */
export function vnoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number) => hash1(a * 15.71 + b * 91.37 + seed * 7.13);
  const top = h(xi, yi) * (1 - u) + h(xi + 1, yi) * u;
  const bottom = h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u;
  return (top * (1 - v) + bottom * v) * 2 - 1;
}

export function fbm2(x: number, y: number, seed = 0): number {
  return (
    vnoise2(x, y, seed) * 0.6 +
    vnoise2(x * 2.1 + 3.3, y * 2.1 - 1.7, seed + 1) * 0.28 +
    vnoise2(x * 4.3, y * 4.3, seed + 2) * 0.12
  );
}

export const clamp = (x: number, low = 0, high = 1) => Math.max(low, Math.min(high, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
/** 0 before `start`, 1 after `start + duration`, linear between. */
export const ramp = (time: number, start: number, duration: number) =>
  clamp((time - start) / duration);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeIn = (t: number) => t * t * t;
/** Ends past 1 and settles back: overshoot. */
export const easeOutBack = (t: number, overshoot = 1.7) =>
  1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
/** Pulls back below 0 first: anticipation. */
export const easeInBack = (t: number, pull = 1.7) => (pull + 1) * t * t * t - pull * t * t;

/**
A damped spring step from 0 to 1 that starts at `start`: it overshoots and rings out. The answer is 0
before `start`.
*/
export function spring(time: number, start: number, frequency = 3.2, damping = 5.5): number {
  const t = time - start;
  if (t <= 0) {
    return 0;
  }
  return 1 - Math.exp(-damping * t) * Math.cos(2 * Math.PI * frequency * t);
}

/** A kick that goes up and rings back to 0: squash on a beat. */
export function pulse(time: number, start: number, frequency = 3, damping = 6): number {
  const t = time - start;
  if (t <= 0) {
    return 0;
  }
  return Math.exp(-damping * t) * Math.sin(2 * Math.PI * frequency * t);
}

export const deg = (degrees: number) => (degrees * Math.PI) / 180;
export const add = (p: Point, q: Point): Point => [p[0] + q[0], p[1] + q[1]];
export const sub = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
export const scale = (p: Point, k: number): Point => [p[0] * k, p[1] * k];
export const length = (p: Point) => Math.hypot(p[0], p[1]);
export const mix = (p: Point, q: Point, t: number): Point => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
];
export const ray = (degrees: number): Point => [Math.cos(deg(degrees)), -Math.sin(deg(degrees))];
export const rotate = (p: Point, angle: number): Point => [
  p[0] * Math.cos(angle) - p[1] * Math.sin(angle),
  p[0] * Math.sin(angle) + p[1] * Math.cos(angle),
];

/** Points every `step` px along a polyline. */
export function densify(points: readonly Point[], closed: boolean, step = 5): Point[] {
  const out: Point[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    if (!a || !b) {
      continue;
    }
    const pieces = Math.max(1, Math.ceil(length(sub(b, a)) / step));
    for (let piece = 0; piece < pieces; piece += 1) {
      out.push(mix(a, b, piece / pieces));
    }
  }
  const last = points[points.length - 1];
  if (!closed && last) {
    out.push(last);
  }
  return out;
}

/** Hand wobble: a low-frequency displacement across the line, measured along its length. */
export function wobble(
  points: readonly Point[],
  closed: boolean,
  { amplitude = 1.6, wavelength = 110, seed = 1, step = 4, tremor = 0.35 } = {},
): Point[] {
  const dense = densify(points, closed, step);
  let distance = 0;
  return dense.map((point, index) => {
    const previous = dense[index - 1];
    if (previous) {
      distance += length(sub(point, previous));
    }
    const before =
      dense[closed ? (index - 1 + dense.length) % dense.length : Math.max(0, index - 1)];
    const after =
      dense[closed ? (index + 1) % dense.length : Math.min(dense.length - 1, index + 1)];
    const tangent = sub(after ?? point, before ?? point);
    const size = length(tangent) || 1;
    const offset =
      amplitude * fbm1(distance / wavelength, seed) + tremor * vnoise(distance / 9, seed + 7);
    return [point[0] - (tangent[1] / size) * offset, point[1] + (tangent[0] / size) * offset];
  });
}
