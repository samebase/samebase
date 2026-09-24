import { sure, bad, good } from "./core.ts";
import type { InferBad, InferGood, InferInput, MetaObj, Sure } from "./core.ts";

export function intersection<
  TFirstInput,
  TSecondInput,
  TFirst extends Sure<unknown, Record<string, unknown>, TFirstInput>,
  TSecond extends Sure<unknown, Record<string, unknown>, TSecondInput>,
>(
  first: TFirst & ((value: TFirstInput) => unknown),
  second: TSecond & ((value: TSecondInput) => unknown),
): Sure<
  InferBad<TFirst> | InferBad<TSecond>,
  InferGood<TFirst> & InferGood<TSecond>,
  // Variance
  InferInput<TFirst> & InferInput<TSecond>,
  MetaObj<{
    type: "intersection";
    first: TFirst;
    second: TSecond;
  }>
> {
  // @ts-expect-error The child callbacks determine the result payloads.
  return sure(
    (value: InferInput<TFirst> & InferInput<TSecond>) => {
      const [isGoodFirst, unsureFirst] = first(value);

      if (!isGoodFirst) {
        return bad(unsureFirst);
      }

      const [isGoodSecond, unsureSecond] = second(value);

      if (!isGoodSecond) {
        return bad(unsureSecond);
      }

      // TODO: Should we enforce that the outputs are objects?
      return good({ ...unsureFirst, ...unsureSecond });
    },
    {
      type: "intersection",
      first,
      second,
    },
  );
}

export const and = intersection;
