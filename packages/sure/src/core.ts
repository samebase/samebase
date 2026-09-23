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
  TAsync extends boolean = false,
> = ((value: TInput) => Resolve<Unsure<TBad, TGood>, TAsync>) & TMeta;

export type Resolve<T, TAsync extends boolean> = TAsync extends true ? Promise<Awaited<T>> : T;
export type MaybePromise<T> = T | Promise<T>;
export type AnySure<TInput = never> = Sure<unknown, unknown, TInput, MetaNever | MetaObj, boolean>;

type PromiseMode<T> = T extends Promise<unknown> ? true : false;
export type InferAsync<T extends AnySure> = PromiseMode<ReturnType<T>>;

/** A composite can skip its async children, so it can still return synchronously. */
export type MayAsync<T extends AnySure> = true extends InferAsync<T> ? boolean : false;

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

export function sure<TInput, TResult extends MaybePromise<Unsure<unknown, unknown>>, TMeta>(
  insure: (value: TInput) => TResult,
  meta: TMeta,
): ((value: TInput) => TResult) & MetaObj<TMeta> {
  return Object.assign(insure, { meta });
}

export function pure<TInput, TResult extends MaybePromise<Unsure<unknown, unknown>>>(
  insure: ((value: TInput) => TResult) & MetaNever,
): ((value: TInput) => TResult) & MetaNever {
  return insure;
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

export type Unsure<
  TBad,
  TGood,
> = //
  Good<TGood> | Bad<TBad>;

export type Good<T> = readonly [true, T];
export type Bad<T> = readonly [false, T];

export type InferBad<T extends AnySure> = Extract<Awaited<ReturnType<T>>, Bad<unknown>>[1];

export type InferGood<T extends AnySure> = Extract<Awaited<ReturnType<T>>, Good<unknown>>[1];

export type InferInput<T extends AnySure> = Parameters<T>[0];

export type InferMeta<T extends AnySure> =
  T extends MetaObj<infer TMeta>
    ? MetaObj<TMeta>
    : T extends MetaNever
      ? MetaNever
      : MetaNever | MetaObj;
