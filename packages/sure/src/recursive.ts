import { bad, good, sure, under } from "./core.ts";
import type { Issue, Issues, MetaObj, Sure } from "./core.ts";

export const RecurseSymbol = Symbol("recurse");

export const recursiveElem: Sure<
  // Never bad, the value in its place is validated by `recurse`
  Issues<never>,
  typeof RecurseSymbol,
  unknown
> = () => good(RecurseSymbol);

export type ReplaceSymbolWithObj<Obj extends Record<string, unknown>, With> = {
  [K in keyof Obj]: typeof RecurseSymbol extends Obj[K] //
    ? With
    : Obj[K];
  //
};

export function recurse<
  //
  // TKey extends keyof TGood,
  // TKey extends string,
  TMessage extends string,
  TGood extends Record<string, unknown>,
  TChildMessage extends string,
  TChildGood,
>(
  //
  baseObj: Sure<Issues<TMessage>, TGood, unknown>, //
  // key: TKey,
  childParser: (surer: typeof baseObj) => Sure<Issues<TChildMessage>, TChildGood, unknown>,
): Sure<
  //
  Issues<TMessage | TChildMessage>,
  ReplaceSymbolWithObj<TGood, TChildGood>,
  unknown,
  MetaObj<{
    baseObj: typeof baseObj;
    childParser: typeof childParser;
  }>
> {
  const rec = (value: unknown) => {
    const [isGoodObj, unsureObj] = baseObj(value);

    if (!isGoodObj) {
      return bad(unsureObj);
    }

    //

    const issues: Issue[] = [];
    let newChildrenGood = {};

    for (const [key, elem] of Object.entries(unsureObj)) {
      if (elem !== RecurseSymbol) continue;

      // @ts-expect-error
      const [isGood, unsure] = childParser(rec)(
        // here we send the value from the original object
        // Seems dangerous, maybe other implementation is better
        // @ts-expect-error TODO: fix
        value[key],
      );

      if (!isGood) {
        issues.push(...under(key, unsure));
      } else {
        // @ts-expect-error
        newChildrenGood[key] = unsure;
      }
    }

    if (issues.length) {
      return bad(issues);
    }

    return good({ ...unsureObj, ...newChildrenGood });
  };

  // @ts-expect-error
  return sure(rec, {
    baseObj,
    childrenPraser: childParser,
  });
}
