import { standardProps } from "./standard.ts";
import type { SureStandardSchema } from "./standard.ts";

// Copied from Zod
// TODO: review all the types
export type Primitive =
  | string //
  | number
  | symbol
  | bigint
  | boolean
  | null
  | undefined;

export type Dictionary = {
  [key: string]: unknown;
};

export type MetaNever = { meta?: never };
// TODO: change to undefined ? or remove?
export type MetaObj<TMeta = unknown> = { meta: TMeta };

/**
@typeparam TBad  - Each struct can returns some kinds of issues (not throwing)
@typeparam TGood  - The type which is guaranteed to be the output of the validator
@typeparam TInput - The type of the input value.

@example a numeric string can be based on the definition of a string.
         so you can base a numeric string on a string struct (if you want).
         By default the `unknown` struct is used. That is the only core struct
 */
export type Sure<
  //
  TBad = unknown,
  TGood = unknown,
  TInput = unknown,
  //
  TMeta extends MetaNever | MetaObj = MetaNever | MetaObj,
> = ((value: TInput) => Good<TGood> | Bad<TBad>) & TMeta;

/**
A Sure schema that also implements the
{@link https://standardschema.dev Standard Schema} interface.

Everything created through `sure()`/`pure()` (and therefore every built-in
factory) is one of these. Plain-function validators stay plain `Sure`s — pass
them through `standard()` (see standard.ts) to attach the `~standard` props.

`Sure` remains the input-side type (what combinators accept), `StandardSure`
the output-side type (what factories return): a raw arrow function must stay
assignable to `Sure`, so `~standard` cannot be required there.

Note the standard props are intersected into the *meta slot* of the `Sure`
alias rather than wrapped around it. Both spell the same structural type, but
this way generic inference against `Sure<_, _, _, infer TMeta>` (used by every
combinator) keeps matching alias-to-alias and infers a clean
`MetaObj<...> & StandardSchemaV1<...>` instead of swallowing the whole
intersection.
 */
export type StandardSure<
  //
  TBad = unknown,
  TGood = unknown,
  TInput = unknown,
  //
  TMeta extends MetaNever | MetaObj = MetaNever | MetaObj,
> = Sure<TBad, TGood, TInput, TMeta & SureStandardSchema<TInput, TGood>>;

/**
Returns the exact function back.
But the types are inferred automatically for you.

Expects you to pass a function that gets an `unknown` value
and returns either:
  [true, <anything you want>]
  [false, <an failure you might want to return, also anything you want>]

Check the `sure.ts` version to check the types


@example Check playground.ts to hover over variables
 */

export function sure<TGood, TBad, TInput, TMeta>(
  insure: Sure<TBad, TGood, TInput>,
  meta: TMeta,
): StandardSure<TBad, TGood, TInput, MetaObj<TMeta>> {
  return Object.assign(insure, { meta, "~standard": standardProps<TInput, TGood>(insure) });
}

export function pure<TGood, TBad, TInput>(
  insure: Sure<TBad, TGood, TInput, MetaNever>,
): StandardSure<TBad, TGood, TInput, MetaNever> {
  return Object.assign(insure, { "~standard": standardProps<TInput, TGood>(insure) });
}

// So that `as const` is not needed for literals
export function bad<TBad extends Primitive>(val: TBad): Bad<TBad>;
export function bad<TBad>(val: TBad): Bad<TBad>;
export function bad<TBad>(val: TBad): Bad<TBad> {
  return [false, val];
}
//
export function good<TGood extends Primitive>(val: TGood): Good<TGood>;
export function good<TGood>(val: TGood): Good<TGood>;
export function good<TGood>(val: TGood): Good<TGood> {
  return [true, val];
}

export type Unsure<TBad, TGood> = //
  Good<TGood> | Bad<TBad>;

export type Good<T> = readonly [true, T];
export type Bad<T> = readonly [false, T];

export type InferBad<
  // Add the Sure constraint
  T extends Sure<
    unknown,
    unknown,
    // Input issue
    any,
    MetaObj | MetaNever
  >,
> = //
  T extends (...args: any) => infer COutput //
    ? COutput extends readonly [false, infer CGood] //
      ? CGood
      : never
    : never;

export type InferGood<
  // Add the Sure constraint
  T extends Sure<
    unknown,
    unknown,
    // Input issue
    any,
    MetaObj | MetaNever
  >,
> = //
  T extends (...args: any) => infer COutput //
    ? COutput extends readonly [true, infer CGood] //
      ? CGood
      : never
    : never;

export type InferInput<
  T extends Sure<
    unknown,
    unknown,
    // Input issue
    any,
    MetaObj | MetaNever
  >,
> = //
  T extends Sure<
    unknown,
    unknown,
    // Input issue
    infer CFrom,
    MetaObj | MetaNever
  >
    ? //
      //
      CFrom
    : never;

// Extracts the `meta` property directly instead of pattern-matching the whole
// Sure intersection — robust to the extra `~standard` props that sure()/pure()
// attach (the old `infer CMeta` picked those up too).
export type InferMeta<T extends Sure<unknown, unknown, any, {}>> = //
  "meta" extends keyof T
    ? undefined extends T["meta"]
      ? MetaNever
      : MetaObj<T["meta"]>
    : MetaNever | MetaObj;
