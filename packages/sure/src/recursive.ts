import { bad, good, pure, sure } from "./core.ts";
import type {
  AnySure,
  InferBad,
  InferGood,
  MayAsync,
  MaybePromise,
  MetaNever,
  MetaObj,
  Sure,
  Unsure,
} from "./core.ts";
import { forEach, mapResult } from "./async.ts";

export const RecurseSymbol = Symbol("recurse");

export const recursiveElem: Sure<
  // The `bad` type is used by the type system to replace the symbol
  typeof RecurseSymbol,
  typeof RecurseSymbol,
  unknown
> = pure(() => good(RecurseSymbol));

export type ReplaceSymbolWithObj<Obj extends Record<string, unknown>, With> = {
  [K in keyof Obj]: typeof RecurseSymbol extends Obj[K] //
    ? With
    : Obj[K];
  //
};

export function recurse<
  TBase extends Sure<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown,
    MetaNever | MetaObj,
    boolean
  >,
  TChild extends AnySure<unknown>,
>(
  baseObj: TBase,
  // The recursive call includes child validation, which can be async even when baseObj is sync.
  childParser: (
    surer: Sure<InferBad<TBase>, InferGood<TBase>, unknown, MetaNever | MetaObj, boolean>,
  ) => TChild,
): Sure<
  //
  ReplaceSymbolWithObj<InferBad<TBase>, InferBad<TChild>>,
  ReplaceSymbolWithObj<InferGood<TBase>, InferGood<TChild>>,
  unknown,
  MetaObj<{
    baseObj: typeof baseObj;
    childParser: typeof childParser;
  }>,
  MayAsync<TBase | TChild>
> {
  const rec = (
    value: unknown,
  ): MaybePromise<Unsure<Record<string, unknown>, Record<string, unknown>>> =>
    mapResult(baseObj(value), ([isGoodObj, unsureObj]) => {
      if (!isGoodObj) {
        return bad(unsureObj);
      }

      //

      const newChildrenGood: Record<string, unknown> = {};
      const newChildrenBad: Record<string, unknown> = {};

      return forEach(
        Object.entries(unsureObj),
        ([key, elem]) => {
          if (elem !== RecurseSymbol) return;

          const child = childParser(rec)(
            // here we send the value from the original object
            // Seems dangerous, maybe other implementation is better
            // @ts-expect-error TODO: fix
            value[key],
          );

          return mapResult(child, ([isGood, unsure]) => {
            if (!isGood) {
              newChildrenBad[key] = unsure;
            } else {
              newChildrenGood[key] = unsure;
            }
          });
        },
        () =>
          Object.keys(newChildrenBad).length
            ? bad(newChildrenBad)
            : good({ ...unsureObj, ...newChildrenGood }),
      );
    });

  // @ts-expect-error Symbol replacement determines payloads; executed children determine the promise.
  return sure(rec, {
    baseObj,
    childrenPraser: childParser,
  });
}
