import { sure } from "./core.ts";
import type { AnySure, InferBad, InferGood, InferInput, MayAsync, MetaObj, Sure } from "./core.ts";
import { mapResult } from "./async.ts";

export function union<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance-sensitive inference slot
  TFirst extends AnySure<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance-sensitive inference slot
  TSecond extends AnySure<any>,
>(
  first: TFirst,
  second: TSecond,
): Sure<
  InferBad<TFirst> | InferBad<TSecond>,
  InferGood<TFirst> | InferGood<TSecond>,
  // Variance
  InferInput<TFirst> & InferInput<TSecond>,
  MetaObj<{
    type: "union";

    first: typeof first;
    second: typeof second;
  }>,
  MayAsync<TFirst | TSecond>
> {
  // @ts-expect-error Child results determine the conditional return and inferred tuple payloads.
  return sure(
    (value: InferInput<TFirst> & InferInput<TSecond>) =>
      mapResult(first(value), (result) => (result[0] ? result : second(value))),
    {
      type: "union",

      first,
      second,
    },
  );
}

export const or = union;
