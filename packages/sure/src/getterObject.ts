import { bad, good, sure } from "./core.ts";
import type { InferBad, MetaNever, MetaObj, Sure } from "./core.ts";
import { isObject } from "./object.ts";
import type { InferSchemaGood } from "./object.ts";

export type GetterObjectSchema = Record<
  string,
  Sure<unknown, unknown, unknown, MetaNever | MetaObj>
>;

function isOptionalSchema(schema: Sure<unknown, unknown, unknown, MetaNever | MetaObj>) {
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
): Sure<
  { [K in keyof TSchema & string]?: InferBad<TSchema[K]> },
  InferSchemaGood<TSchema>,
  unknown,
  MetaObj<{
    type: "getterObject";

    schema: TSchema;
  }>
> {
  let resolvedSchema: TSchema | undefined;

  const getSchema = () => {
    if (!resolvedSchema) {
      resolvedSchema = { ...schema };
    }

    return resolvedSchema;
  };

  // @ts-expect-error The implementation builds the object dynamically while the signature carries
  // the exact schema-derived object type.
  return sure(
    (value) => {
      if (!isObject(value)) {
        return bad({});
      }

      const groupFail: Record<string, unknown> = {};
      const groupGood: Record<string, unknown> = {};

      for (const [key, sureFunction] of Object.entries(getSchema())) {
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
