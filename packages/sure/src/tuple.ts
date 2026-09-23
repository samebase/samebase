/* eslint-disable @typescript-eslint/no-explicit-any -- variance-sensitive inference slot */
import { bad, good, sure } from "./core.ts";
import type {
  AnySure,
  InferAsync,
  InferBad,
  InferGood,
  InferMeta,
  MayAsync,
  MetaNever,
  MetaObj,
  Sure,
} from "./core.ts";
import { forEach, mapResult } from "./async.ts";

// TODO: add tests, also implement tuple spread
export type TupleInferGoods_old<T> = T extends readonly [infer First, ...infer InferRest]
  ? First extends AnySure
    ? [InferGood<First>, ...TupleInferGoods<InferRest>]
    : []
  : [];

// Add test
export type TupleInferGoods<
  T,
> = //
  T extends readonly [infer First, ...infer InferRest]
    ? First extends AnySure
      ? InferMeta<First> extends MetaObj<{ parent: typeof spread_NOT_IMPLEMENTED }>
        ? // try spreading the rest if it's an array
          InferGood<First> extends readonly unknown[]
          ? [...InferGood<First>, ...TupleInferGoods<InferRest>]
          : // otherwise just return the good
            [InferGood<First>, ...TupleInferGoods<InferRest>]
        : [InferGood<First>, ...TupleInferGoods<InferRest>]
      : []
    : [];

export type TupleInferBads_old<T> = T extends readonly [infer First, ...infer InferRest]
  ? First extends AnySure
    ? [InferBad<First> | undefined, ...TupleInferBads<InferRest>]
    : []
  : [];

export type TupleInferBads<T> = T extends readonly [infer First, ...infer InferRest]
  ? First extends AnySure
    ? InferMeta<First> extends MetaObj<{ parent: typeof spread_NOT_IMPLEMENTED }>
      ? // try spreading the rest if it's an array
        InferBad<First> extends readonly unknown[]
        ? [...InferBad<First>, ...TupleInferBads<InferRest>]
        : // otherwise just return the bad
          [InferBad<First> | undefined, ...TupleInferBads<InferRest>]
      : [InferBad<First> | undefined, ...TupleInferBads<InferRest>]
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
export function spread_NOT_IMPLEMENTED<
  Arr extends Sure<unknown, unknown[], unknown, MetaNever | MetaObj, boolean>,
>(
  schema: Arr,
): Sure<
  InferBad<Arr>,
  InferGood<Arr>,
  unknown,
  MetaObj<{
    parent: typeof spread_NOT_IMPLEMENTED;
    schema: typeof schema;
  }>,
  InferAsync<Arr>
> {
  // IMPORTANT: It's important to pass a new function here
  const val = sure((value) => schema(value), {
    parent: spread_NOT_IMPLEMENTED,
    schema,
  });

  // @ts-expect-error The wrapper returns the child's unchanged result, including its promise.
  return val;
}

export function tuple<Arr extends [AnySure<any>, ...AnySure<any>[]] | []>(
  arr: Arr,
): Sure<
  //
  TupleInferBads<Arr>,
  TupleInferGoods<Arr>,
  unknown,
  MetaObj<{
    type: "tuple";

    schema: Arr;
  }>,
  MayAsync<Arr[number]>
> {
  const struct = sure(
    (value) => {
      if (!Array.isArray(value)) {
        return bad([]);
      }

      let atLeastOneBad = false;
      const bads: unknown[] = [];
      const goods: unknown[] = [];

      return forEach(
        arr.entries(),
        ([i, elem]) =>
          mapResult(elem(value[i]), ([good, unsure]) => {
            if (good) {
              goods.push(unsure);
              // This is necessary in order to maintain the same length
              bads.push(undefined);
            } else {
              bads.push(unsure);

              // Since the `bads` array can containe `undefined` values, it's more clear to
              // have an imperative boolean to make the check
              atLeastOneBad = true;
            }
          }),
        () => (atLeastOneBad ? bad(bads) : good(goods)),
      );
    },
    {
      type: "tuple",

      initial: arr,
    },
  );

  // @ts-expect-error Schema positions determine the output tuple; executed children determine its promise.
  return struct;
}
