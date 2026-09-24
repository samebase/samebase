/* eslint-disable @typescript-eslint/no-explicit-any -- variance-sensitive inference slot */
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
): Sure<TBad, TGood, TInput, MetaObj<TMeta>> {
  return Object.assign(insure, { meta });
}

export function pure<TGood, TBad, TInput>(
  insure: Sure<TBad, TGood, TInput, MetaNever>,
): Sure<TBad, TGood, TInput, MetaNever> {
  return insure;
}

// So that `as const` is not needed for literals
export function bad<TBad extends Primitive>(val: TBad): Bad<TBad>;
// So that `as const` is not needed for the messages of issues
export function bad<const TMessage extends string>(val: Issues<TMessage>): Bad<Issues<TMessage>>;
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

export type Unsure<
  TBad,
  TGood,
> = //
  Good<TGood> | Bad<TBad>;

export type Good<T> = readonly [true, T];
export type Bad<T> = readonly [false, T];

/**
One reason why a value is bad.

It has the shape of a Standard Schema issue, so a list of them can be
given to anything that understands Standard Schema.
@see https://standardschema.dev

@typeparam TMessage - Kept literal, so the possible messages are part of the type.

`path` points to the part of the value that is bad.
It is missing when the value itself is bad.
 */
export type Issue<TMessage extends string = string> = {
  readonly message: TMessage;
  readonly path?: ReadonlyArray<PropertyKey>;
};

/**
The bad value of the validators in this package.

A flat list: nested values add to the `path` of an issue,
not to the shape of the list.
 */
export type Issues<TMessage extends string = string> = ReadonlyArray<Issue<TMessage>>;

/**
Moves the issues of a part of a value under the `key` of that part.

Used by the validators of collections (`object`, `array`, `tuple`),
so that each issue keeps pointing to where it happened.
 */
export function under<TMessage extends string>(
  key: PropertyKey,
  issues: Issues<TMessage>,
): Issues<TMessage> {
  return issues.map((issue) => ({ ...issue, path: [key, ...(issue.path ?? [])] }));
}

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

export type InferMessage<
  T extends Sure<
    Issues,
    unknown,
    // Input issue
    any,
    MetaObj | MetaNever
  >,
> = //
  Extract<InferBad<T>, Issues>[number]["message"];

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

export type InferMeta<
  T extends Sure<unknown, unknown, any, {}>,
> = //
  T extends Sure<unknown, unknown, any, infer CMeta> //
    ? CMeta
    : {};
