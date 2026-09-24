/* eslint-disable @typescript-eslint/no-explicit-any -- variance-sensitive inference slot */
import { bad, good, sure } from "./core.ts";
import type { InferBad, InferGood, MetaNever, MetaObj, Sure } from "./core.ts";
import { fail, type AnyValidation, type Issue } from "./issue.ts";

// TODO: add tests, also implement tuple spread
export type TupleInferGoods_old<T> = T extends readonly [infer First, ...infer InferRest]
  ? First extends Sure<unknown, infer Good, any, MetaObj | MetaNever>
    ? [Good, ...TupleInferGoods<InferRest>]
    : []
  : [];

// Add test
export type TupleInferGoods<
  T,
> = //
  T extends readonly [infer First, ...infer InferRest]
    ? First extends Sure<unknown, infer Good, any, infer Meta>
      ? Meta extends MetaObj<{ parent: typeof spread_NOT_IMPLEMENTED }>
        ? // try spreading the rest if it's an array
          Good extends readonly unknown[]
          ? [...Good, ...TupleInferGoods<InferRest>]
          : // otherwise just return the good
            [Good, ...TupleInferGoods<InferRest>]
        : [Good, ...TupleInferGoods<InferRest>]
      : []
    : [];

/**
 * @deprecated
 *
 * It's possible to add a spread operator.
 * But it's seems that it would add a lot of complexity and will have to link the library too much.
 *
 * A tuple would have to know about both the spread and an array.
 *
 * It made sense for `object` and `optional`, since they're linked.
 * But for tuples it can be more clearly implemented as a separate user-land function.
 */
export function spread_NOT_IMPLEMENTED<Arr extends Sure<unknown, unknown[], unknown>>(
  schema: Arr,
): Sure<
  InferBad<Arr>,
  InferGood<Arr>,
  unknown,
  MetaObj<{
    parent: typeof spread_NOT_IMPLEMENTED;
    schema: typeof schema;
  }>
> {
  // IMPORTANT: It's important to pass a new function here
  const val = sure((value) => schema(value), {
    parent: spread_NOT_IMPLEMENTED,
    schema,
  });

  // @ts-expect-error - this is fine
  return val;
}

export function tuple<Arr extends [AnyValidation<any>, ...AnyValidation<any>[]] | []>(
  arr: Arr,
): Sure<
  //
  readonly Issue<InferBad<Arr[number]>[number]["error"] | "not tuple">[],
  TupleInferGoods<Arr>,
  unknown,
  MetaObj<{
    type: "tuple";

    schema: Arr;
  }>
> {
  const struct = sure(
    (value) => {
      if (!Array.isArray(value)) {
        return fail("not tuple");
      }

      let failed = false;
      const issues: Issue[] = [];
      const goods: unknown[] = [];

      for (const [i, elem] of arr.entries()) {
        const [good, unsure] = elem(value[i]);

        if (good) {
          goods.push(unsure);
        } else {
          failed = true;
          for (const issue of unsure) {
            issues.push({ path: [i, ...issue.path], error: issue.error });
          }
        }
      }

      if (failed) {
        return bad(issues);
      }

      return good(goods);
    },
    {
      type: "tuple",

      initial: arr,
    },
  );

  // @ts-expect-error Schema positions determine the output tuple and issue payloads.
  return struct;
}
