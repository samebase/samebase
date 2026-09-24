import { bad, good, pure, sure } from "./core.ts";
import type { MetaObj, Sure } from "./core.ts";
import type { Issue } from "./issue.ts";

export const RecurseSymbol = Symbol("recurse");

export const recursiveElem: Sure<never, typeof RecurseSymbol, unknown> = pure(() =>
  good(RecurseSymbol),
);

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
  TBad extends readonly Issue[],
  TGood extends Record<string, unknown>,
  TChildBad extends readonly Issue[],
  TChildGood,
>(
  //
  baseObj: Sure<TBad, TGood, unknown>, //
  // key: TKey,
  childParser: (surer: typeof baseObj) => Sure<TChildBad, TChildGood, unknown>,
): Sure<
  //
  readonly Issue<TBad[number]["error"] | TChildBad[number]["error"]>[],
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

    const newChildrenGood: Record<string, unknown> = {};
    let failed = false;
    const issues: Issue[] = [];

    for (const [key, elem] of Object.entries(unsureObj)) {
      if (elem !== RecurseSymbol) continue;

      // @ts-expect-error The recursive callback still uses base placeholders for replaced fields.
      const [isGood, unsure] = childParser(rec)(
        // here we send the value from the original object
        // Seems dangerous, maybe other implementation is better
        // @ts-expect-error TODO: fix
        value[key],
      );

      if (!isGood) {
        failed = true;
        for (const issue of unsure) {
          issues.push({ path: [key, ...issue.path], error: issue.error });
        }
      } else {
        newChildrenGood[key] = unsure;
      }
    }

    if (failed) {
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
