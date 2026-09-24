import { good, sure } from "./core.ts";
import type { InferBad, InferGood, InferInput, MetaObj, Sure } from "./core.ts";

export function union<
  TFirstInput,
  TSecondInput,
  TFirst extends Sure<unknown, unknown, TFirstInput>,
  TSecond extends Sure<unknown, unknown, TSecondInput>,
>(
  first: TFirst & Sure<unknown, unknown, TFirstInput>,
  second: TSecond & Sure<unknown, unknown, TSecondInput>,
): Sure<
  InferBad<TFirst> | InferBad<TSecond>,
  InferGood<TFirst> | InferGood<TSecond>,
  // Variance
  InferInput<TFirst> & InferInput<TSecond>,
  MetaObj<{
    type: "union";

    first: TFirst;
    second: TSecond;
  }>
> {
  // @ts-expect-error The child callbacks determine the result payloads.
  return sure(
    (value: InferInput<TFirst> & InferInput<TSecond>) => {
      const [isGoodFirst, unsureFirst] = first(value);

      if (isGoodFirst) {
        return good(unsureFirst);
      }

      return second(value);
    },
    {
      type: "union",

      first,
      second,
    },
  );
}

export const or = union;
