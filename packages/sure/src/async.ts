import type { MaybePromise, Unsure } from "./core.ts";

/** Array detection accepts promises from another realm and tuples with extra properties. */
export function mapResult<TBad, TGood, TNext>(
  result: MaybePromise<Unsure<TBad, TGood>>,
  next: (result: Unsure<TBad, TGood>) => MaybePromise<TNext>,
): MaybePromise<TNext> {
  // @ts-expect-error Array.isArray cannot narrow a union of readonly tuples and promises.
  return Array.isArray(result) ? next(result) : result.then(next);
}

/** Visit in order. Only suspend when a visitor returns a promise. */
export function forEach<T, TResult>(
  values: Iterable<T>,
  visit: (value: T) => void | Promise<void>,
  finish: () => TResult,
): MaybePromise<TResult> {
  const iterator = values[Symbol.iterator]();
  const fail = (error: unknown): never => {
    try {
      iterator.return?.();
    } catch {
      // Like for-of, preserve the visitor's error if iterator cleanup also throws.
    }
    throw error;
  };
  const next = (): MaybePromise<TResult> => {
    for (let step = iterator.next(); !step.done; step = iterator.next()) {
      let pending;
      try {
        pending = visit(step.value);
      } catch (error) {
        return fail(error);
      }
      if (pending) return pending.then(next, fail);
    }
    return finish();
  };
  return next();
}
