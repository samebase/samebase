import { sure, bad, good } from "./core.ts";
import type {
  InferBad,
  InferGood,
  InferInput,
  MayAsync,
  MetaNever,
  MetaObj,
  Sure,
} from "./core.ts";
import { mapResult } from "./async.ts";

export function intersection<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance-sensitive inference slot
  TFirst extends Sure<unknown, Record<string, unknown>, any, MetaNever | MetaObj, boolean>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance-sensitive inference slot
  TSecond extends Sure<unknown, Record<string, unknown>, any, MetaNever | MetaObj, boolean>,
>(
  first: TFirst,
  second: TSecond,
): Sure<
  InferBad<TFirst> | InferBad<TSecond>,
  InferGood<TFirst> & InferGood<TSecond>,
  // Variance
  InferInput<TFirst> & InferInput<TSecond>,
  MetaObj<{
    type: "intersection";
    first: typeof first;
    second: typeof second;
  }>,
  MayAsync<TFirst | TSecond>
> {
  // @ts-expect-error Child results determine the conditional return and inferred tuple payloads.
  return sure(
    (value: InferInput<TFirst> & InferInput<TSecond>) =>
      mapResult(first(value), ([isGoodFirst, unsureFirst]) => {
        if (!isGoodFirst) {
          return bad(unsureFirst);
        }

        return mapResult(second(value), ([isGoodSecond, unsureSecond]) => {
          if (!isGoodSecond) {
            return bad(unsureSecond);
          }

          // TODO: Should we enforce that the outputs are objects?
          return good({ ...unsureFirst, ...unsureSecond });
        });
      }),
    {
      type: "intersection",
      first,
      second,
    },
  );
}

export const and = intersection;
