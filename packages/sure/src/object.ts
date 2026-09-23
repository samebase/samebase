import { sure, good, bad } from "./core.ts";
import type { Sure, AnySure, InferAsync, MayAsync, InferGood, InferBad, MetaObj } from "./core.ts";
import type { KVPair, Objectify, Prettify, Unionize } from "./utils.ts";
import { forEach, mapResult } from "./async.ts";

type PickOptionalsGood<T extends KVPair<AnySure>> = T extends {
  v: MetaObj<{
    type: "optional";
  }>;
}
  ? { k: T["k"]; v: InferGood<T["v"]> }
  : never;

type PickNonOptionals<T extends KVPair<AnySure>> = T extends {
  v: MetaObj<{
    type: "optional";
  }>;
}
  ? never
  : { k: T["k"]; v: InferGood<T["v"]> };

export type InferSchemaGood<T extends Record<string, AnySure>> = Prettify<
  Partial<Objectify<PickOptionalsGood<Unionize<T>>>> & Objectify<PickNonOptionals<Unionize<T>>>
>;

/**
Necessary because `typeof x` is not a type guard.
 */
// eslint-disable-next-line samebase/no-hand-written-type-predicate -- record-shape-over-unknown: control flow cannot earn an index signature, so the audited gap lives here
export function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/**
 * Makes a object property `optional`
 * It doesn't make it nullable or undefinedable
 *
 * The `optional` function will be checked `only` by the `object` function.
 * In all other cases it will the value will not be perceived as optional.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance-sensitive inference slot
export function optional<TSchema extends AnySure<any>>(
  schema: TSchema,
): Sure<
  InferBad<TSchema>,
  InferGood<TSchema>,
  unknown,
  MetaObj<{
    type: "optional";

    schema: TSchema;
  }>,
  InferAsync<TSchema>
> {
  // IMPORTANT: It's important to pass a new function here
  //            since `sure` will update the function with the meta
  // @ts-expect-error The wrapper returns the child's unchanged result, including its promise.
  return sure((value) => schema(value), {
    type: "optional",

    schema,
  });
}

export function object<TSchema extends Record<string, AnySure<unknown>>>(
  schema: TSchema,
): Sure<
  { [K in keyof TSchema & string]?: InferBad<TSchema[K]> },
  InferSchemaGood<TSchema>,
  unknown,
  MetaObj<{
    type: "object";

    schema: TSchema;
  }>,
  MayAsync<TSchema[keyof TSchema]>
> {
  // @ts-expect-error Schema keys determine the output shape; executed children determine its promise.
  return sure(
    (value) => {
      if (!isObject(value)) {
        return bad({});
      }

      const groupFail: Record<string, unknown> = {};
      const groupGood: Record<string, unknown> = {};

      return forEach(
        Object.entries(schema),
        ([key, sureFunction]) => {
          const isOptional =
            isObject(sureFunction.meta) && sureFunction.meta["type"] === "optional";

          if (isOptional && !(key in value)) {
            return;
          }

          return mapResult(sureFunction(value[key]), ([good, unsure]) => {
            if (good) {
              groupGood[key] = unsure;
            } else {
              groupFail[key] = unsure;
            }
          });
        },
        () => (Object.keys(groupFail).length ? bad(groupFail) : good(groupGood)),
      );
    },
    {
      type: "object",

      schema,
    },
  );
}
