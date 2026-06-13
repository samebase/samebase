import { good, sure, bad, pure } from "./core.ts";

/**
 * Defined using the `sure` function
 *
 * This adds a `{ meta: undefined }` to the passed function
 */
export const string = sure(
  (x) => {
    return typeof x === "string" //
      ? good(x)
      : bad("not string" as const);
  },
  {
    type: "string" as const,
  },
);

/**
 * Defined using the `pure` function
 *
 * The pure function returnes exactly the passed function
 */
export const number = sure(
  (x) => {
    return typeof x === "number" //
      ? good(x)
      : bad("not number" as const);
  },
  {
    type: "number" as const,
  },
);

/**
 * Wrapped in `pure` so the schema carries the Standard Schema `~standard`
 * props like every other built-in. (A raw arrow function is still a valid
 * `Sure` — it just isn't a `StandardSure`.)
 */
export const boolean = pure((x: unknown) => {
  return typeof x === "boolean" //
    ? good(x)
    : bad("not boolean" as const);
});

export const undef = pure((value: unknown) => {
  return value === undefined //
    ? good(value)
    : bad("not undefined" as const);
});

export const nil = pure((value: unknown) => {
  return value === null //
    ? good(value)
    : bad("not null" as const);
});

export const unknown = pure((x) => good(x));
