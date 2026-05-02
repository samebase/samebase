import { describe, expect, it } from "vite-plus/test";

import {
  arrayOf,
  atLeast,
  atMod,
  exactly,
  expectType,
  includes,
  map,
  notEmpty,
  objEntries,
  objFromEntries,
  objKeys,
  objMapEntries,
  promiseAll,
  reverse,
  split,
  zip,
  type Array1,
  type Array2,
  type SafeOmit,
  type UnionToIntersection,
} from "../src/index.ts";

describe("dependent array helpers", () => {
  it("keeps tuple guarantees for map, reverse, and promiseAll", async () => {
    const values: Array1<number> = [1, 2, 3];

    const mapped = map(values, (value) => `${value}`);
    const reversed = reverse(mapped);
    const promised = await promiseAll([
      Promise.resolve("a"),
      Promise.resolve("b"),
    ]);

    expectType<Array1<string>>()(mapped, true);
    expectType<Array1<string>>()(reversed, true);
    expectType<Array2<string>>()(promised, true);
    expect(reversed).toEqual(["3", "2", "1"]);
  });

  it("narrows non-empty arrays and exact tuple lengths", () => {
    const values = ["a", "b", "c"];

    expect(atLeast(1, values)).toBe(true);
    if (atLeast(1, values)) {
      expectType<Array1<string>>()(values, true);
      expect(lastValue(values)).toBe("c");
    }

    expect(exactly(3, values)).toBe(true);
    if (exactly(3, values)) {
      expectType<[string, string, string]>()(values, true);
    }
  });

  it("wraps modular indexes and zips falsy values without dropping them", () => {
    expect(atMod(["a", "b", "c"], -1)).toBe("c");
    expect(zip([0, 1], [false, true])).toEqual([
      [0, false],
      [1, true],
    ]);
  });

  it("filters nullish values and splits arrays by a predicate", () => {
    const values = [1, null, 2, undefined, 3].filter(notEmpty);
    const grouped = split(values, (value) => value % 2 === 1);

    expectType<number[]>()(values, true);
    expect(grouped).toEqual({ good: [1, 3], bad: [2] });
  });

  it("implements typed includes with SameValueZero semantics", () => {
    const validValues = ["ready", "error", Number.NaN] as const;
    const value: unknown = Number.NaN;

    expect(includes(validValues, value)).toBe(true);
    if (includes(validValues, value)) {
      expectType<(typeof validValues)[number]>()(value, true);
    }
  });

  it("creates filled arrays", () => {
    expect(arrayOf(3, "x")).toEqual(["x", "x", "x"]);
  });
});

describe("dependent object helpers", () => {
  it("returns typed keys and entries", () => {
    const obj = { a: 1, b: "two" } as const;

    const keys = objKeys(obj);
    const entries = objEntries(obj);

    expectType<Array<"a" | "b">>()(keys, true);
    expectType<Array<["a" | "b", 1 | "two"]>>()(entries, true);
    expect(keys).toEqual(["a", "b"]);
    expect(entries).toEqual([
      ["a", 1],
      ["b", "two"],
    ]);
  });

  it("creates and maps typed objects from entries", () => {
    const obj = objFromEntries([
      ["a", 1],
      ["b", 2],
    ] as const);

    const mapped = objMapEntries(obj, ([key, value]) => [
      `${key}-next`,
      value * 2,
    ]);

    expectType<Record<"a" | "b", 1 | 2>>()(obj, true);
    expect(mapped).toEqual({ "a-next": 2, "b-next": 4 });
  });
});

describe("dependent type helpers", () => {
  it("exposes reusable type utilities", () => {
    type Intersected = UnionToIntersection<{ a: 1 } | { b: 2 }>;
    type Omitted = SafeOmit<{ a: 1; b: 2 }, "b">;
    const intersected: { a: 1 } & { b: 2 } = { a: 1, b: 2 };
    const omitted: Omitted = { a: 1 };

    expectType<{ a: 1 } & { b: 2 }>()(intersected, true);
    expectType<Intersected>()(intersected, true);
    expectType<Omitted>()(omitted, true);
  });
});

function lastValue<Value>(values: Array1<Value>): Value {
  return values[values.length - 1];
}
