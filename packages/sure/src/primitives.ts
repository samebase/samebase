import { good, sure, bad } from "./core.ts";
import type { Issues, MetaNever, Sure } from "./core.ts";

/**
 * Defined using the `sure` function
 *
 * This adds a `{ meta: undefined }` to the passed function
 */
export const string = sure(
  (x) => {
    return typeof x === "string" //
      ? good(x)
      : bad([{ message: "not string" }]);
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
      : bad([{ message: "not number" }]);
  },
  {
    type: "number" as const,
  },
);

/**
 * Defined without using the `sure` or `pure` functions
 *
 * This is the same as the `pure` function
 */
export const boolean = (x: unknown) => {
  return typeof x === "boolean" //
    ? good(x)
    : bad([{ message: "not boolean" }]);
};

export const undef = (value: unknown) => {
  return value === undefined //
    ? good(value)
    : bad([{ message: "not undefined" }]);
};

export const nil = (value: unknown) => {
  return value === null //
    ? good(value)
    : bad([{ message: "not null" }]);
};

/**
 * Never bad, so it can be used wherever issues are expected
 */
export const unknown: Sure<Issues<never>, unknown, unknown, MetaNever> = (x) => good(x);
