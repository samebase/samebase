// https://stackoverflow.com/a/50375286/2659549
export type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

export type UnpackPromise<Value> =
  Value extends Promise<infer Inner> ? Inner : Value;

/**
 * Use this instead of `{}` in generic constraints where an object-like value is
 * expected but arbitrary primitives should stay excluded.
 */
export type EmptyObject = Record<string, unknown>;

export type Arguments<Func extends (...args: never[]) => unknown> =
  Func extends (...args: infer Args) => unknown ? Args : never;

export type FirstArgument<Func extends (...args: never[]) => unknown> =
  Arguments<Func> extends [infer Arg, ...unknown[]] ? Arg : never;

export type SecondArgument<Func extends (...args: never[]) => unknown> =
  Arguments<Func> extends [unknown, infer Arg, ...unknown[]] ? Arg : never;

/**
 * Given a union of one-argument function types, expose a callable shape that
 * accepts the union of input values and returns the union of outputs.
 */
export type UnionFuncFix<Func extends (...args: never[]) => unknown> = (
  value: FirstArgument<Func>,
) => ReturnType<Func>;

// https://www.roryba.in/programming/2019/10/12/flattening-typescript-union-types.html
// FlattenUnion<{ a: number; c: number } | { b: string; c: number }>
// becomes { a?: number; b?: string; c: number }.
export type FlattenUnion<Value> = {
  [Key in keyof UnionToIntersection<Value>]: Key extends keyof Value
    ? Value[Key] extends unknown[]
      ? Value[Key]
      : Value[Key] extends object
        ? FlattenUnion<Value[Key]>
        : Value[Key]
    : UnionToIntersection<Value>[Key] | undefined;
};

export type ArrayN<Length extends number, Value> = Length extends 1
  ? [Value, ...Value[]]
  : Length extends 2
    ? [Value, Value, ...Value[]]
    : Length extends 3
      ? [Value, Value, Value, ...Value[]]
      : Length extends 4
        ? [Value, Value, Value, Value, ...Value[]]
        : Length extends 5
          ? [Value, Value, Value, Value, Value, ...Value[]]
          : Length extends 6
            ? [Value, Value, Value, Value, Value, Value, ...Value[]]
            : Length extends 7
              ? [Value, Value, Value, Value, Value, Value, Value, ...Value[]]
              : Value[];

export type Array1<Value> = [Value, ...Value[]];
export type Array2<Value> = [Value, Value, ...Value[]];
export type Array3<Value> = [Value, Value, Value, ...Value[]];
export type Array4<Value> = [Value, Value, Value, Value, ...Value[]];
export type Array5<Value> = [Value, Value, Value, Value, Value, ...Value[]];
export type Array6<Value> = [
  Value,
  Value,
  Value,
  Value,
  Value,
  Value,
  ...Value[],
];
export type Array7<Value> = [
  Value,
  Value,
  Value,
  Value,
  Value,
  Value,
  Value,
  ...Value[],
];

export function map<Value, Result>(
  arr: Array1<Value>,
  callbackfn: (value: Value, index: number) => Result,
): Array1<Result>;
export function map<Value, Result>(
  arr: Array2<Value>,
  callbackfn: (value: Value, index: number) => Result,
): Array2<Result>;
export function map<Value, Result>(
  arr: Value[],
  callbackfn: (value: Value, index: number) => Result,
): Result[];
export function map<Value, Result>(
  arr: Value[],
  callbackfn: (value: Value, index: number) => Result,
): Result[] {
  return arr.map(callbackfn);
}

export function atLeast<Value>(n: 1, arr: Value[]): arr is Array1<Value>;
export function atLeast<Value>(n: 2, arr: Value[]): arr is Array2<Value>;
export function atLeast<Value>(n: 3, arr: Value[]): arr is Array3<Value>;
export function atLeast<Value>(n: number, arr: Value[]): arr is Value[];
export function atLeast<Value>(n: number, arr: Value[]): arr is Value[] {
  return arr.length >= n;
}

/**
 * Wrapper around the `in` operator that narrows the key instead of the object.
 */
export function isKeyOf<Value extends object>(
  obj: Value,
  key: string | number | symbol,
): key is keyof Value {
  return key in obj;
}

export function exactly<Value>(length: 1, arr: Value[]): arr is [Value];
export function exactly<Value>(length: 2, arr: Value[]): arr is [Value, Value];
export function exactly<Value>(
  length: 3,
  arr: Value[],
): arr is [Value, Value, Value];
export function exactly<Value>(length: number, arr: Value[]): arr is Value[];
export function exactly<Value>(length: number, arr: Value[]): arr is Value[] {
  return arr.length === length;
}

export const excactly = exactly;

export function notEmpty<Value>(
  value: Value | null | undefined,
): value is Value {
  return value !== null && value !== undefined;
}

export function atMod<Value>(arr: Array1<Value>, indexMod: number): Value {
  const len = arr.length;
  const targetIndex = ((indexMod % len) + len) % len;
  let currentIndex = 0;

  for (const elem of arr) {
    if (currentIndex === targetIndex) {
      return elem;
    }

    currentIndex += 1;
  }

  return arr[0];
}

export function zip<Left, Right>(
  arrLeft: Array1<Left>,
  arrRight: Array1<Right>,
): Array1<[Left, Right]> {
  const rightIterator = arrRight[Symbol.iterator]();
  const ret: Array<[Left, Right]> = [];

  for (const left of arrLeft) {
    const nextRight = rightIterator.next();

    if (nextRight.done === true) {
      break;
    }

    ret.push([left, nextRight.value]);
  }

  if (atLeast(1, ret)) {
    return ret;
  }

  return [[arrLeft[0], arrRight[0]]];
}

export function last<Value>(arr: Array1<Value>): Value;
export function last<Value>(arr: Value[]): Value | undefined;
export function last<Value>(arr: Value[]): Value | undefined {
  return arr[arr.length - 1];
}

export function split<Value>(
  arr: readonly Value[],
  pred: (elem: Value, index: number) => boolean,
): { good: Value[]; bad: Value[] } {
  const good = arr.filter((elem, index) => pred(elem, index));
  const bad = arr.filter((elem, index) => !pred(elem, index));

  return { good, bad };
}

export function promiseAll<Value>(
  promises: Array3<Promise<Value>>,
): Promise<Array3<Value>>;
export function promiseAll<Value>(
  promises: Array2<Promise<Value>>,
): Promise<Array2<Value>>;
export function promiseAll<Value>(
  promises: Array1<Promise<Value>>,
): Promise<Array1<Value>>;
export function promiseAll<Value>(promises: Promise<Value>[]): Promise<Value[]>;
export function promiseAll<Value>(
  promises: Promise<Value>[],
): Promise<Value[]> {
  return Promise.all(promises);
}

export function mapAll<Value, Result>(
  arr: Array3<Value>,
  callback: (value: Value, index: number) => Promise<Result>,
): Promise<Array3<Result>>;
export function mapAll<Value, Result>(
  arr: Array2<Value>,
  callback: (value: Value, index: number) => Promise<Result>,
): Promise<Array2<Result>>;
export function mapAll<Value, Result>(
  arr: Array1<Value>,
  callback: (value: Value, index: number) => Promise<Result>,
): Promise<Array1<Result>>;
export function mapAll<Value, Result>(
  arr: Value[],
  callback: (value: Value, index: number) => Promise<Result>,
): Promise<Result[]>;
export function mapAll<Value, Result>(
  arr: Value[],
  callback: (value: Value, index: number) => Promise<Result>,
): Promise<Result[]> {
  return Promise.all(arr.map(callback));
}

export function reverse<Value>(arr: Array3<Value>): Array3<Value>;
export function reverse<Value>(arr: Array2<Value>): Array2<Value>;
export function reverse<Value>(arr: Array1<Value>): Array1<Value>;
export function reverse<Value>(arr: Value[]): Value[];
export function reverse<Value>(arr: Value[]): Value[] {
  return [...arr].reverse();
}

export function immutableSplice<Value>(
  array: Value[],
  start: number,
  count: number,
  ...values: Value[]
): Value[] {
  const newArr = [...array];
  newArr.splice(start, count, ...values);
  return newArr;
}

export function unreachable(value: never): never {
  return value;
}

export function promiseTimeout(millis: number): Promise<undefined> {
  return new Promise<undefined>((resolve, reject) => {
    try {
      setTimeout(resolve, millis);
    } catch (error) {
      reject(error);
    }
  });
}

function sameValueZero(left: unknown, right: unknown): boolean {
  return left === right || (left !== left && right !== right);
}

/**
 * Wrapper around Array.includes() that is also a type guard and accepts values
 * that are not already known to belong to the array.
 */
export function includes<ArrayValue extends readonly unknown[]>(
  arr: ArrayValue,
  value: unknown,
): value is ArrayValue[number] {
  return arr.some((item) => sameValueZero(item, value));
}

export type SafeOmit<Value, Key extends keyof Value> = Omit<Value, Key>;
