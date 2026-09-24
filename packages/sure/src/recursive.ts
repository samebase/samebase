import { bad, good, pure, sure } from "./core.ts";
import type {
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
import type { AnyValidation, Issue } from "./issue.ts";

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
  TBase extends Sure<
    readonly Issue[],
    Record<string, unknown>,
    unknown,
    MetaNever | MetaObj,
    boolean
  >,
  TChild extends AnyValidation,
>(
  baseObj: TBase,
  // The recursive call includes child validation, which can be async even when baseObj is sync.
  childParser: (
    surer: Sure<InferBad<TBase>, InferGood<TBase>, unknown, MetaNever | MetaObj, boolean>,
  ) => TChild,
): Sure<
  //
  readonly Issue<InferBad<TBase>[number]["error"] | InferBad<TChild>[number]["error"]>[],
  ReplaceSymbolWithObj<InferGood<TBase>, InferGood<TChild>>,
  unknown,
  MetaObj<{
    baseObj: typeof baseObj;
    childParser: typeof childParser;
  }>,
  MayAsync<TBase | TChild>
> {
  const rec = (value: unknown): MaybePromise<Unsure<readonly Issue[], Record<string, unknown>>> =>
    mapResult(baseObj(value), ([isGoodObj, unsureObj]) => {
      if (!isGoodObj) {
        return bad(unsureObj);
      }

      //

      const newChildrenGood: Record<string, unknown> = {};
      let failed = false;
      const issues: Issue[] = [];

      return forEach(
        Object.entries(unsureObj),
        ([key, elem]) => {
          if (elem !== RecurseSymbol) return;

          // @ts-expect-error Recursive callback types still use the base placeholders for replaced fields.
          const child = childParser(rec)(
            // here we send the value from the original object
            // Seems dangerous, maybe other implementation is better
            // @ts-expect-error TODO: fix
            value[key],
          );

          return mapResult(child, ([isGood, unsure]) => {
            if (!isGood) {
              failed = true;
              for (const issue of unsure) {
                issues.push({ path: [key, ...issue.path], error: issue.error });
              }
            } else {
              newChildrenGood[key] = unsure;
            }
          });
        },
        () => (failed ? bad(issues) : good({ ...unsureObj, ...newChildrenGood })),
      );
    });

  // @ts-expect-error Symbol replacement determines payloads; executed children determine the promise.
  return sure(rec, {
    baseObj,
    childrenPraser: childParser,
  });
}
