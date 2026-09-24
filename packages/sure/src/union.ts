import { bad, good, sure } from "./core.ts";
import type { Issues, MetaNever, MetaObj, Sure } from "./core.ts";

export function union<
  //
  TFirstMessage extends string,
  TFirstGood,
  TFirstInput,
  TFirstMeta extends MetaNever | MetaObj,
  //
  TSecondMessage extends string,
  TSecondGood,
  TSecondInput,
  TSecondMeta extends MetaNever | MetaObj,
>(
  first: Sure<Issues<TFirstMessage>, TFirstGood, TFirstInput, TFirstMeta>,
  second: Sure<Issues<TSecondMessage>, TSecondGood, TSecondInput, TSecondMeta>,
): Sure<
  Issues<TFirstMessage | TSecondMessage>,
  TFirstGood | TSecondGood,
  // Variance
  TFirstInput & TSecondInput,
  MetaObj<{
    type: "union";

    first: typeof first;
    second: typeof second;
  }>
> {
  return sure(
    // @ts-expect-error Should be fixed at the definition of sure, I think.
    (value: TFirstInput & TSecondInput) => {
      const [isGoodFirst, unsureFirst] = first(value);

      if (isGoodFirst) {
        return good(unsureFirst);
      }

      const [isGoodSecond, unsureSecond] = second(value);

      if (isGoodSecond) {
        return good(unsureSecond);
      }

      // Neither matched, so the issues of both explain why
      return bad([...unsureFirst, ...unsureSecond]);
    },
    {
      type: "union",

      first,
      second,
    },
  );
}

export const or = union;
