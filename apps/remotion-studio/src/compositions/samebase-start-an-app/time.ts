/*
The clock helpers of the html-demo method, in TypeScript. Every frame is a pure function of `t`,
seconds into a step: the same t gives the same picture, so a still of any frame matches the render.
*/

/** The app is drawn at this fixed design size and scaled into the window as a whole. */
export const W = 1200;
export const H = 750;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** How far `t` is through the stretch from `a` to `b`, eased in and out (0 before a, 1 after b). */
export function ease(t: number, a: number, b: number): number {
  const x = clamp01((t - a) / (b - a));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** A gentler ease for the camera: sine in and out. */
export function easeSine(t: number, a: number, b: number): number {
  const x = clamp01((t - a) / (b - a));
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

/** `text` as typed by `t`: nothing before `a`, all of it by `b`. */
export function typed(text: string, t: number, a: number, b: number): string {
  return text.slice(0, Math.round(text.length * clamp01((t - a) / (b - a))));
}

/** The value of the last cue whose time has come; `before` until the first. */
export function cue<T>(t: number, cues: readonly (readonly [number, T])[], before: T): T {
  let v = before;
  for (const [at, value] of cues) {
    if (t < at) break;
    v = value;
  }
  return v;
}

/** Whether a click that lands at `at` is still pressed (about 0.16 s, a person's click). */
export const held = (t: number, at: number, len = 0.16) => t >= at && t < at + len;

/** One move: travel to (x, y), eased, between `from` and `to` seconds. */
export type Move = readonly [from: number, to: number, x: number, y: number];

/** Where the pointer is at `t`, from `t` alone. The first move, [0, 0, x, y], is where it starts. */
export function glide(
  t: number,
  path: readonly [Move, ...Move[]],
  clicks: readonly number[] = [],
): { x: number; y: number; press: boolean } {
  let [, , x, y] = path[0];
  for (const [a, b, nx, ny] of path.slice(1)) {
    if (t <= a) break;
    const k = ease(t, a, b);
    x += (nx - x) * k;
    y += (ny - y) * k;
  }
  return { x, y, press: clicks.some((at) => held(t, at)) };
}

/** What the camera frames: the stage point at the view's centre, and the zoom. */
export type Camera = { cx: number; cy: number; z: number };

/** One camera move: to `cam` between `from` and `to` seconds. The first is where it starts. */
export type Shot = readonly [from: number, to: number, cam: Camera];

/** The camera at `t`. It eases with a sine, slow out and slow in, never chasing the pointer. */
export function shoot(t: number, shots: readonly [Shot, ...Shot[]]): Camera {
  let { cx, cy, z } = shots[0][2];
  for (const [a, b, next] of shots.slice(1)) {
    if (t <= a) break;
    const k = easeSine(t, a, b);
    // Zoom moves in log space so a push in and a pull out feel the same.
    const lz = Math.log(z) + (Math.log(next.z) - Math.log(z)) * k;
    cx += (next.cx - cx) * k;
    cy += (next.cy - cy) * k;
    z = Math.exp(lz);
  }
  return { cx, cy, z };
}

/** The camera kept inside the stage: the view never shows past the app's edges. */
export function framed({ cx, cy, z }: Camera): Camera {
  const hw = W / (2 * z);
  const hh = H / (2 * z);
  return {
    cx: Math.min(W - hw, Math.max(hw, cx)),
    cy: Math.min(H - hh, Math.max(hh, cy)),
    z,
  };
}

/** The spinner's angle at `t`: one turn a second, as Tailwind's animate-spin. */
export const spin = (t: number) => t * 360;
