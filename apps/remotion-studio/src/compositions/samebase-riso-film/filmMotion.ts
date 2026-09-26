export const filmFps = 30;
export const filmDurationInSeconds = 42;
export const filmDurationInFrames = filmFps * filmDurationInSeconds;
/** The measured music grid: 120 BPM, beats on multiples of 0.5 s. */
export const beat = 0.5;
/** The riso "boil": every print holds for 1/12 s, so misregistration and grain change 12 times per second. */
export const printsPerSecond = 12;

export function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function progress(time: number, start: number, end: number): number {
  return clamp01((time - start) / (end - start));
}

export function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

export function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

export function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

export function easeInCubic(value: number): number {
  return value ** 3;
}

export function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

/** Ends at 1 after an overshoot. `overshoot` 1.7 overshoots by about 10 percent. */
export function easeOutBack(value: number, overshoot = 1.7): number {
  return 1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

/** A damped oscillation that starts at 0 on the hit, for kicks and squash. */
export function ring(time: number, hitTime: number, frequency = 3, decay = 7): number {
  const elapsed = time - hitTime;
  if (elapsed < 0) {
    return 0;
  }
  return Math.sin(2 * Math.PI * frequency * elapsed) * Math.exp(-decay * elapsed);
}

/** 1 on the hit, then an exponential decay. */
export function pulse(time: number, hitTime: number, decay = 8): number {
  const elapsed = time - hitTime;
  return elapsed < 0 ? 0 : Math.exp(-decay * elapsed);
}

/**
Moves through keyframes. Each keyframe starts its move at `time` and reaches its value after
`duration` with the given easing. Before the first keyframe the value is the first value.
*/
export function keyed<Value>(
  time: number,
  keys: readonly {
    duration: number;
    ease: (value: number) => number;
    time: number;
    value: Value;
  }[],
  blend: (from: Value, to: Value, amount: number) => Value,
): Value {
  const [first, ...rest] = keys;
  if (!first) {
    throw new Error("keyed() needs at least one keyframe");
  }
  let value = first.value;
  for (const key of rest) {
    if (time < key.time) {
      break;
    }
    value = blend(value, key.value, key.ease(progress(time, key.time, key.time + key.duration)));
  }
  return value;
}

/** A stable pseudo-random value in [0, 1) for integer inputs. */
export function hash(...values: readonly number[]): number {
  let state = 0x9e3779b9;
  for (const value of values) {
    state = Math.imul(state ^ Math.floor(value), 0x85ebca6b);
    state ^= state >>> 13;
    state = Math.imul(state, 0xc2b2ae35);
    state ^= state >>> 16;
  }
  return (state >>> 0) / 4_294_967_296;
}

/** Smooth hand-held drift: a sum of slow sines with fixed phases. */
export function drift(time: number, seed: number): number {
  return (
    0.55 * Math.sin(time * 0.61 + seed * 1.7) +
    0.3 * Math.sin(time * 1.37 + seed * 4.1) +
    0.15 * Math.sin(time * 2.93 + seed * 2.3)
  );
}
