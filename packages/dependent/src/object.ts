export function keys<Obj extends object>(value: Obj): Array<keyof Obj & string> {
  // @ts-expect-error Object.keys returns the own enumerable string keys at runtime.
  return Object.keys(value);
}

type PropKey = string | number | symbol;
type ObjectEntry<Obj extends object> = {
  [Key in keyof Obj & string]: [Key, Obj[Key]];
}[keyof Obj & string];

type StringKeyOf<Obj extends object> = keyof Obj & string;
type StringKeysWithUndefined<Obj extends object> = {
  [Key in StringKeyOf<Obj>]-?: undefined extends Obj[Key] ? Key : never;
}[StringKeyOf<Obj>];

export type UndefinedOmitted<Obj extends object> = Pick<
  Obj,
  Exclude<StringKeyOf<Obj>, StringKeysWithUndefined<Obj>>
> & {
  [Key in StringKeysWithUndefined<Obj>]?: Exclude<Obj[Key], undefined>;
};

export function entries<Obj extends object>(value: Obj): Array<ObjectEntry<Obj>> {
  // @ts-expect-error Object.entries returns the same entries with weaker types.
  return Object.entries(value);
}

export function fromEntries<Key extends PropKey, Value>(
  entries: readonly (readonly [Key, Value])[],
): Record<Key, Value> {
  // @ts-expect-error Object.fromEntries preserves the runtime key/value pairs.
  return Object.fromEntries(entries);
}

export function omitUndefined<Obj extends object>(value: Obj): UndefinedOmitted<Obj> {
  const definedEntries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);

  // @ts-expect-error The filter removes each undefined value and Object.fromEntries preserves the keys.
  return Object.fromEntries(definedEntries);
}

export function pick<Obj extends object, const Keys extends readonly (keyof Obj)[]>(
  value: Obj,
  keys: Keys,
): Pick<Obj, Keys[number]> {
  const picked: Partial<Pick<Obj, Keys[number]>> = {};

  for (const key of keys) {
    if (key in value) {
      picked[key] = value[key];
    }
  }

  // @ts-expect-error The loop above copies every requested key present on value.
  return picked;
}

export function mapEntries<
  Obj extends Record<PropKey, unknown>,
  ResultKey extends PropKey,
  ResultValue,
>(
  value: Obj,
  callback: (entry: [key: keyof Obj, value: Obj[keyof Obj]]) => readonly [ResultKey, ResultValue],
): Record<ResultKey, ResultValue> {
  return fromEntries(entries(value).map(callback));
}
