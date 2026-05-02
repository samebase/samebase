export function objKeys<Obj extends object>(
  value: Obj,
): Array<keyof Obj & string> {
  // @ts-expect-error Object.keys returns the own enumerable string keys at runtime.
  return Object.keys(value);
}

type PropKey = string | number | symbol;

export function objEntries<Obj extends Record<PropKey, unknown>>(
  value: Obj,
): Array<[keyof Obj & string, Obj[keyof Obj]]> {
  // @ts-expect-error Object.entries returns the same entries with weaker types.
  return Object.entries(value);
}

export function objFromEntries<Key extends PropKey, Value>(
  entries: readonly (readonly [Key, Value])[],
): Record<Key, Value> {
  // @ts-expect-error Object.fromEntries preserves the runtime key/value pairs.
  return Object.fromEntries(entries);
}

export function objMapEntries<
  Obj extends Record<PropKey, unknown>,
  ResultKey extends PropKey,
  ResultValue,
>(
  value: Obj,
  callback: (
    entry: [key: keyof Obj, value: Obj[keyof Obj]],
  ) => readonly [ResultKey, ResultValue],
): Record<ResultKey, ResultValue> {
  return objFromEntries(objEntries(value).map(callback));
}
