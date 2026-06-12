import type { Sure } from "./core.ts";
import { object } from "./object.ts";
import { objMapEntries } from "./utils.ts";
import type { PrettifyRec } from "./utils.ts";

export type ExtractPrimitives<TSchema> = {
  [t in keyof TSchema]: InferJustMeta<TSchema[t]>;
};
// prettier-ignore
export type InferJustMetaOld<T
// extends Sure<unknown, unknown, any, {}>
> =
  // for objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-level scratch
  T extends Sure<unknown, unknown, any, {meta: {
    type: 'object'
    schema: infer CSchema
  }}>
    ?{
      type: 'object'
      schema: ExtractPrimitives<CSchema>
    }

      // for optional
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-level scratch
  :T extends Sure<unknown, unknown, any, {meta: {
    type: 'optional'
    schema: infer CSchema
  }}>
    ?{
      type: 'optional'
      schema: InferJustMeta<CSchema>
    }

    // for array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-level scratch
  :T extends Sure<unknown, unknown, any, {meta: {
    type: 'array'
    schema: infer CSchema
  }}> ? {
    type: 'array'
    schema: InferJustMeta<CSchema>
  }


    // for any other type
    :
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-level scratch
    T extends Sure<unknown, unknown, any, {meta: infer Meta}>
    ? Meta :

  // Here we'll not be able to differentiate MetaNever from MetaObj<undefined>
  // Both will be extracted as `undefined`
  undefined

// prettier-ignore
export type InferJustMeta<
  T,
  // extends Sure<unknown, unknown, any, {}>
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-level scratch
> = T extends Sure<unknown, unknown, any, { meta: infer Meta }>
  ? // for objects
    Meta extends {
      type: 'object'
      schema: infer CSchema
    }
    ? {
        type: 'object'
        schema: ExtractPrimitives<CSchema>
      }
    : // for optional
    Meta extends {
        type: 'optional'
        schema: infer CSchema
      }
    ? {
        type: 'optional'
        schema: InferJustMeta<CSchema>
      }
    : // for array
    Meta extends {
        type: 'array'
        schema: infer CSchema
      }
    ? {
        type: 'array'
        schema: InferJustMeta<CSchema>
      }
    : // for any other type
      Meta
  : // Here we'll not be able to differentiate MetaNever from MetaObj<undefined>
    // Both will be extracted as `undefined`
    undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-level scratch
export function justMeta<TSchema extends Sure<unknown, unknown, any>>(
  insure: TSchema,
): PrettifyRec<InferJustMeta<TSchema>> {
  // object.getMeta(insure) -> if not object -> null

  // eslint-disable-next-line no-unused-expressions -- type-level scratch
  object;

  // @ts-expect-error more explicit?
  if (insure.meta?.type === "object") {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- type-level scratch
    const { schema, ...rest } = insure.meta as any;

    // @ts-expect-error more explicit?
    const ret = objMapEntries(schema, ([key, value]) => {
      return [key, justMeta(value)];
    });

    return { schema: ret, ...rest };
  }

  // @ts-expect-error more explicit?
  if (insure.meta?.type === "optional") {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- type-level scratch
    const { schema, ...rest } = insure.meta as any;

    return {
      schema: justMeta(schema),
      ...rest,
    };
  }

  // @ts-expect-error more explicit?
  if (insure.meta?.type === "array") {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- type-level scratch
    const { schema, ...rest } = insure.meta as any;

    return {
      schema: justMeta(schema),
      ...rest,
    };
  }

  if (insure.meta) {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- type-level scratch
    return insure.meta as any;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- type-level scratch
  return undefined as any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-level scratch
export function metaToJsonSchema<TMeta>(meta: TMeta): any {
  if (!meta) {
    return {
      type: "unknown",
    };
  }

  // @ts-expect-error figure out
  if (meta.type === "object") {
    // go through each and check if it's optional
    const optionalKeys: string[] = [];
    // @ts-expect-error asdfsd
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- type-level scratch
    const withoutOptional = objMapEntries(meta.schema as any, ([key, value]) => {
      if (value.type === "optional") {
        // @ts-expect-error asdfsd
        optionalKeys.push(key);
        return [key, value.schema];
      }

      return [key, value];
    });

    const required = Object.keys(withoutOptional).filter((key) => !optionalKeys.includes(key));

    return {
      type: "object",
      properties: objMapEntries(withoutOptional, ([key, value]) => {
        return [key, metaToJsonSchema(value)];
      }),
      required,
    };
  }

  // @ts-expect-error figure out
  if (meta.type === "array") {
    return {
      type: "array",
      // @ts-expect-error rename schema to items here
      items: metaToJsonSchema(meta.schema),
    };
  }

  //
  return meta;
}
