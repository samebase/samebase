import { bad, good, sure } from "./core.ts";
import type { InferBad, MetaNever, MetaObj, Sure } from "./core.ts";
import { isObject, type InferSchemaGood } from "./object.ts";
import type { KVPair, Unionize } from "./utils.ts";

export type Object2PathBad<
  TPath extends readonly PropertyKey[] = readonly PropertyKey[],
  TBad = unknown,
> = readonly [path: TPath, bad: TBad];

type Object2Schema = Record<string, Sure<unknown, unknown, unknown, MetaNever | MetaObj>>;

type PrefixObject2PathBad<TKey extends PropertyKey, TBad> =
  TBad extends ReadonlyArray<infer Entry>
    ? Entry extends Object2PathBad<infer ChildPath, infer ChildBad>
      ? Object2PathBad<readonly [TKey, ...ChildPath], ChildBad>
      : Object2PathBad<readonly [TKey], TBad>
    : Object2PathBad<readonly [TKey], TBad>;

type Object2PropBad<TProp extends KVPair<Sure<unknown, unknown, unknown>>> = PrefixObject2PathBad<
  TProp["k"],
  InferBad<TProp["v"]>
>;

export type Object2Bad<TSchema extends Object2Schema> = ReadonlyArray<
  Object2PathBad<readonly [], "not object"> | Object2PropBad<Unionize<TSchema>>
>;

function isObject2PathBad(value: unknown): value is Object2PathBad {
  return Array.isArray(value) && value.length === 2 && Array.isArray(value[0]);
}

function isObject2PathBads(value: unknown): value is readonly Object2PathBad[] {
  return Array.isArray(value) && value.every(isObject2PathBad);
}

function hasObject2Meta(schema: Sure<unknown, unknown, unknown, MetaNever | MetaObj>) {
  return "meta" in schema && isObject(schema.meta) && schema.meta["type"] === "object2";
}

function prefixObject2Bad(
  key: string,
  schema: Sure<unknown, unknown, unknown, MetaNever | MetaObj>,
  value: unknown,
): readonly Object2PathBad[] {
  if (hasObject2Meta(schema) && isObject2PathBads(value)) {
    return value.map(([path, issue]) => [[key, ...path], issue] as const);
  }

  return [[[key], value] as const];
}

export function object2<TSchema extends Object2Schema>(
  schema: TSchema,
): Sure<
  Object2Bad<TSchema>,
  InferSchemaGood<TSchema>,
  unknown,
  MetaObj<{
    type: "object2";
    schema: TSchema;
  }>
> {
  // @ts-expect-error Generic object iteration loses the key/parser relationship.
  return sure(
    (value) => {
      if (!isObject(value)) {
        return bad([[[], "not object" as const]]);
      }

      const failures: Object2PathBad[] = [];
      const output: Record<string, unknown> = {};

      for (const [key, parser] of Object.entries(schema)) {
        const [isGood, result] = parser(value[key]);

        if (isGood) {
          output[key] = result;
        } else {
          failures.push(...prefixObject2Bad(key, parser, result));
        }
      }

      if (failures.length) {
        return bad(failures);
      }

      return good(output);
    },
    {
      type: "object2",
      schema,
    },
  );
}
