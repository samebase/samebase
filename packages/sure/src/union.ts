import { sure } from "./core.ts";
import type { AnySure, InferBad, InferGood, InferInput, MayAsync, MetaObj, Sure } from "./core.ts";
import { mapResult } from "./async.ts";

export function union<
  TFirstInput,
  TSecondInput,
  TFirst extends AnySure<TFirstInput>,
  TSecond extends AnySure<TSecondInput>,
>(
  first: TFirst & AnySure<TFirstInput>,
  second: TSecond & AnySure<TSecondInput>,
): Sure<
  InferBad<TFirst> | InferBad<TSecond>,
  InferGood<TFirst> | InferGood<TSecond>,
  // Variance
  InferInput<TFirst> & InferInput<TSecond>,
  MetaObj<{
    type: "union";

    first: TFirst;
    second: TSecond;
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
