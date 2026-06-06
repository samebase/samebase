import { bad, good, sure } from "./core.ts";
import type { Bad, Good, MetaNever, MetaObj, Sure } from "./core.ts";
import { isObject } from "./object.ts";

export type GetterObjectSchema = object;

type GetterObjectField = Sure<unknown, unknown, unknown, MetaNever | MetaObj>;

export interface GetterObjectSure<TSchema extends GetterObjectSchema> {
  (value: unknown): Good<Record<string, unknown>> | Bad<Record<string, unknown>>;
  meta: {
    type: "getterObject";

    schema: TSchema;
  };
}

function isSureSchema(value: unknown): value is GetterObjectField {
  return typeof value === "function";
}

function isOptionalSchema(schema: GetterObjectField) {
  return isObject(schema.meta) && schema.meta["type"] === "optional";
}

/**
 * Like object(), but schema keys may be JavaScript getters.
 *
 * The first parse copies the schema into a plain object. That copy invokes getters after the
 * recursive validator variable has been assigned, then caches the resolved validators.
 */
export function getterObject<TSchema extends GetterObjectSchema>(
  schema: TSchema,
): GetterObjectSure<TSchema> {
  let resolvedSchema: TSchema | undefined;

  const getSchema = () => {
    if (!resolvedSchema) {
      resolvedSchema = { ...schema };
    }

    return resolvedSchema;
  };

  return sure(
    (value) => {
      if (!isObject(value)) {
        return bad({});
      }

      const groupFail: Record<string, unknown> = {};
      const groupGood: Record<string, unknown> = {};

      for (const [key, sureFunction] of Object.entries(getSchema())) {
        if (!isSureSchema(sureFunction)) {
          groupFail[key] = "not sure schema";
          continue;
        }

        if (isOptionalSchema(sureFunction) && !(key in value)) {
          continue;
        }

        const [isGood, unsure] = sureFunction(value[key]);

        if (isGood) {
          groupGood[key] = unsure;
        } else {
          groupFail[key] = unsure;
        }
      }

      if (Object.keys(groupFail).length) {
        return bad(groupFail);
      }

      return good(groupGood);
    },
    {
      type: "getterObject",

      schema,
    },
  );
}
