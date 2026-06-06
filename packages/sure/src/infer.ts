import type { MetaNever, MetaObj, Sure } from "./core.ts";

type AnySure = Sure<unknown, unknown, never, MetaObj | MetaNever>;

type OptionalObjectKey<TSchema extends object> = {
  [K in keyof TSchema]: TSchema[K] extends Sure<
    unknown,
    unknown,
    never,
    MetaObj<{
      type: "optional";
    }>
  >
    ? K
    : never;
}[keyof TSchema];

type RequiredObjectKey<TSchema extends object> = Exclude<keyof TSchema, OptionalObjectKey<TSchema>>;

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type InferGetterObjectGood<TSchema extends object> = Prettify<
  {
    -readonly [K in RequiredObjectKey<TSchema>]: TSchema[K] extends AnySure
      ? InferGood<TSchema[K]>
      : never;
  } & {
    -readonly [K in OptionalObjectKey<TSchema>]?: TSchema[K] extends AnySure
      ? InferGood<TSchema[K]>
      : never;
  }
>;

type InferGetterObjectBad<TSchema extends object> = Prettify<{
  -readonly [K in keyof TSchema & string]?: TSchema[K] extends AnySure
    ? InferBad<TSchema[K]>
    : never;
}>;

type InferGoodFromMeta<TMeta> = TMeta extends {
  type: "array";
  schema: infer TSchema;
}
  ? TSchema extends AnySure
    ? Array<InferGood<TSchema>>
    : never
  : TMeta extends {
        type: "optional";
        schema: infer TSchema;
      }
    ? TSchema extends AnySure
      ? InferGood<TSchema>
      : never
    : TMeta extends {
          type: "getterObject";
          schema: infer TSchema;
        }
      ? TSchema extends object
        ? InferGetterObjectGood<TSchema>
        : never
      : never;

type InferBadFromMeta<TMeta> = TMeta extends {
  type: "array";
  schema: infer TSchema;
}
  ? TSchema extends AnySure
    ? Array<InferBad<TSchema> | undefined>
    : never
  : TMeta extends {
        type: "optional";
        schema: infer TSchema;
      }
    ? TSchema extends AnySure
      ? InferBad<TSchema>
      : never
    : TMeta extends {
          type: "getterObject";
          schema: infer TSchema;
        }
      ? TSchema extends object
        ? InferGetterObjectBad<TSchema>
        : never
      : never;

export type InferBad<
  T extends Sure<
    unknown,
    unknown,
    // Input issue
    never,
    MetaObj | MetaNever
  >,
> =
  T extends Sure<unknown, unknown, never, MetaObj<infer TMeta>>
    ? [InferBadFromMeta<TMeta>] extends [never]
      ? T extends (value: never) => infer COutput
        ? COutput extends readonly [false, infer CGood]
          ? CGood
          : never
        : never
      : InferBadFromMeta<TMeta>
    : T extends (value: never) => infer COutput
      ? COutput extends readonly [false, infer CGood]
        ? CGood
        : never
      : never;

export type InferGood<
  T extends Sure<
    unknown,
    unknown,
    // Input issue
    never,
    MetaObj | MetaNever
  >,
> =
  T extends Sure<unknown, unknown, never, MetaObj<infer TMeta>>
    ? [InferGoodFromMeta<TMeta>] extends [never]
      ? T extends (value: never) => infer COutput
        ? COutput extends readonly [true, infer CGood]
          ? CGood
          : never
        : never
      : InferGoodFromMeta<TMeta>
    : T extends (value: never) => infer COutput
      ? COutput extends readonly [true, infer CGood]
        ? CGood
        : never
      : never;

export type InferInput<
  T extends Sure<
    unknown,
    unknown,
    // Input issue
    never,
    MetaObj | MetaNever
  >,
> =
  T extends Sure<
    unknown,
    unknown,
    // Input issue
    infer CFrom,
    MetaObj | MetaNever
  >
    ? CFrom
    : never;

export type InferMeta<T extends Sure<unknown, unknown, never, {}>> =
  T extends Sure<unknown, unknown, never, infer CMeta> ? CMeta : {};
