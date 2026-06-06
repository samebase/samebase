import { sure, good, bad } from "./core.ts";
import type { Bad, Good, Sure, InferGood, InferBad, MetaObj, Unsure } from "./core.ts";
import type { KVPair, Objectify, Prettify, Unionize } from "./utils.ts";

type PickOptionalsGood<T extends KVPair<Sure>> = T extends {
  v: Sure<
    unknown,
    unknown,
    never,
    MetaObj<{
      type: "optional";
    }>
  >;
}
  ? { k: T["k"]; v: InferGood<T["v"]> }
  : never;

type PickNonOptionals<T extends KVPair<Sure>> = T extends {
  v: Sure<
    unknown,
    unknown,
    never,
    MetaObj<{
      type: "optional";
    }>
  >;
}
  ? never
  : { k: T["k"]; v: InferGood<T["v"]> };

export type InferSchemaGood<T extends Record<string, Sure>> = Prettify<
  Partial<Objectify<PickOptionalsGood<Unionize<T>>>> & Objectify<PickNonOptionals<Unionize<T>>>
>;

/**
Necessary because `typeof x` is not a type guard.
 */
export function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export interface OptionalSure<TSchema> {
  (value: unknown): Good<unknown> | Bad<unknown>;
  meta: {
    type: "optional";

    schema: TSchema;
  };
}

function isOptionalInnerSchema(
  value: unknown,
): value is (value: unknown) => Unsure<unknown, unknown> {
  return typeof value === "function";
}

/**
 * Makes a object property `optional`
 * It doesn't make it nullable or undefinedable
 *
 * The `optional` function will be checked `only` by the `object` function.
 * In all other cases it will the value will not be perceived as optional.
 */
export function optional<TSchema>(schema: TSchema): OptionalSure<TSchema> {
  // IMPORTANT: It's important to pass a new function here
  //            since `sure` will update the function with the meta
  return sure(
    (value) => {
      if (!isOptionalInnerSchema(schema)) {
        return bad({});
      }

      return schema(value);
    },
    {
      type: "optional",

      schema,
    },
  );
}

export function object<
  //
  TPropFail,
  TPropGood,
  TSchema extends Record<string, Sure<TPropFail, TPropGood, unknown>>,
>(
  schema: TSchema,
): Sure<
  { [K in keyof TSchema & string]?: InferBad<TSchema[K]> },
  InferSchemaGood<TSchema>,
  unknown,
  MetaObj<{
    type: "object";

    schema: TSchema;
  }>
> {
  // @ts-expect-error - TODO: expected
  return sure(
    (value) => {
      if (!isObject(value)) {
        return bad({});
      }

      const groupFail = {};
      const groupGood = {};

      for (const [key, sureFunction] of Object.entries(schema)) {
        const isOptional = isObject(sureFunction.meta) && sureFunction.meta["type"] === "optional";

        if (isOptional && !(key in value)) {
          continue;
        }

        const [good, unsure] = sureFunction(value[key]);

        if (good) {
          // @ts-expect-error
          groupGood[key] = unsure;
        } else {
          // @ts-expect-error
          groupFail[key] = unsure;
        }
      }

      if (Object.keys(groupFail).length) {
        return bad(groupFail);
      }

      return good(groupGood);
    },
    {
      type: "object",

      schema,
    },
  );
}
