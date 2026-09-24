import { sure, bad } from "./core.ts";
import type { Sure, AnySure, MayAsync, MetaObj, InferBad, InferGood, InferInput } from "./core.ts";
import { mapResult } from "./async.ts";

/**
A common use-case is to first validate that a value is a string.
And then validate other things about the string.

This function will run the @see first validator first.
If it returns a bad value, then the bad value is returned.

If it returns a good value, then the new @see second function will be run.
 */

export function after<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance-sensitive inference slot
  TFirst extends AnySure<any>,
  TSecond extends AnySure<InferGood<TFirst>>,
>(
  first: TFirst,
  second: TSecond,
): Sure<
  InferBad<TFirst> | InferBad<TSecond>,
  InferGood<TSecond>,
  InferInput<TFirst>,
  MetaObj<{
    type: "after";
    first: typeof first;
    second: typeof second;
  }>,
  MayAsync<TFirst | TSecond>
> {
  // @ts-expect-error Child results determine the conditional return and inferred tuple payloads.
  return sure(
    (value) =>
      mapResult(first(value), ([good, out]) => {
        if (good) {
          // @ts-expect-error This is the first validator's successful payload, InferGood<TFirst>.
          return second(out);
        }

        return bad(out);
      }),
    {
      type: "after",
      first,
      second,
    },
  );
}
