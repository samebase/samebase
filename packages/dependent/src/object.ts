export function objKeys<Obj extends object>(
  value: Obj,
): Array<keyof Obj & string> {
  const keys: Array<keyof Obj & string> = [];

  for (const key in value) {
    keys.push(key);
  }

  return keys;
}

type PropKey = string | number | symbol;

export function objEntries<Obj extends Record<PropKey, unknown>>(
  value: Obj,
): Array<[keyof Obj & string, Obj[keyof Obj]]> {
  return objKeys(value).map((key) => [key, value[key]]);
}

export function objFromEntries<Key extends PropKey, Value>(
  entries: readonly (readonly [Key, Value])[],
): Record<Key, Value> {
  const ret: Partial<Record<Key, Value>> = {};

  for (const [key, value] of entries) {
    ret[key] = value;
  }

  // @ts-expect-error The record is complete for the key set provided by entries.
  return ret;
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
