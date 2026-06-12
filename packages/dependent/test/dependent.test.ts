import { describe, expect, it } from "vite-plus/test";

import {
  arrayOf,
  atLeast,
  atMod,
  exactly,
  expectType,
  guard,
  includes,
  isRecord,
  map,
  notEmpty,
  promiseAll,
  reverse,
  split,
  zip,
  type Array1,
  type Array2,
  type SafeOmit,
  type UnionToIntersection,
} from "../src/index.ts";
import { entries, fromEntries, keys, mapEntries, pick } from "../src/object.ts";

describe("dependent array helpers", () => {
  it("keeps tuple guarantees for map, reverse, and promiseAll", async () => {
    const values: Array1<number> = [1, 2, 3];

    const mapped = map(values, (value) => `${value}`);
    const reversed = reverse(mapped);
    const promised = await promiseAll([Promise.resolve("a"), Promise.resolve("b")]);

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

  it("wraps modular indexes and zips shared indexes", () => {
    expect(atMod(["a", "b", "c"], -1)).toBe("c");
    expect(zip([0, 1], [true, true])).toEqual([
      [0, true],
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

    const resultKeys = keys(obj);
    const resultEntries = entries(obj);

    expectType<Array<"a" | "b">>()(resultKeys, true);
    expectType<Array<["a", 1] | ["b", "two"]>>()(resultEntries, true);
    expect(resultKeys).toEqual(["a", "b"]);
    expect(resultEntries).toEqual([
      ["a", 1],
      ["b", "two"],
    ]);
  });

  it("creates and maps typed objects from entries", () => {
    const obj = fromEntries([
      ["a", 1],
      ["b", 2],
    ] as const);

    const mapped = mapEntries(obj, ([key, value]) => [`${key}-next`, value * 2]);

    expectType<Record<"a" | "b", 1 | 2>>()(obj, true);
    expect(mapped).toEqual({ "a-next": 2, "b-next": 4 });
  });

  it("picks typed object keys", () => {
    const obj: {
      readonly a: 1;
      readonly b: "two";
      readonly c?: true;
    } = { a: 1, b: "two" };

    const picked = pick(obj, ["a", "c"] as const);

    expectType<{ readonly a: 1; readonly c?: true }>()(picked, true);
    expect(picked).toEqual({ a: 1 });
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

describe("isRecord", () => {
  it("admits plain objects and rejects null, arrays, and functions", () => {
    const value: unknown = { a: 1 };

    expect(isRecord(value)).toBe(true);
    if (isRecord(value)) {
      expectType<Record<string, unknown>>()(value, true);
    }
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord(() => null)).toBe(false);
    expect(isRecord("a")).toBe(false);
  });
});

describe("guard", () => {
  type Circle = { kind: "circle"; radius: number };
  type Square = { kind: "square"; size: number };
  type Shape = Circle | Square;

  const circle: Shape = { kind: "circle", radius: 1 };
  const square: Shape = { kind: "square", size: 2 };

  it("narrows through an identity-checked callback", () => {
    const isCircle = guard<Shape | null | undefined, Circle>((shape) =>
      shape?.kind === "circle" ? shape : null,
    );

    expect(isCircle(circle)).toBe(true);
    expect(isCircle(square)).toBe(false);
    if (isCircle(circle)) {
      expectType<Circle>()(circle, true);
    }
  });

  it("accepts the annotated-callback call shape", () => {
    const isSquare = guard((shape: Shape): Square | null =>
      shape.kind === "square" ? shape : null,
    );

    expect(isSquare(square)).toBe(true);
    expect(isSquare(circle)).toBe(false);
  });

  it("rejects null inputs instead of matching the null failure result", () => {
    const isCircle = guard<Shape | null | undefined, Circle>((shape) =>
      shape?.kind === "circle" ? shape : null,
    );

    // Without the factory's null pre-check, a failed match on a null input
    // would compare null to null and falsely claim `null is Circle`.
    expect(isCircle(null)).toBe(false);
    expect(isCircle(undefined)).toBe(false);
  });

  it("rejects reconstructed values: the callback must return the value itself", () => {
    const isCircleCopy = guard<Shape, Circle>((shape) =>
      shape.kind === "circle" ? { ...shape } : null,
    );

    expect(isCircleCopy(circle)).toBe(false);
  });

  it("treats equal primitives as identical, including NaN", () => {
    const isNumber = guard<unknown, number>((value) => (typeof value === "number" ? value : null));

    expect(isNumber(5)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(true);
    expect(isNumber("5")).toBe(false);
  });

  it("makes an unearned claim a compile error", () => {
    // With a block body the contextual-type error lands on the argument, so
    // the directive sits on the call rather than the return statement.
    // @ts-expect-error the un-narrowed input cannot earn the Circle claim.
    void guard<Shape, Circle>((shape) => {
      return shape;
    });
  });

  it("documents why the throw-based variant does not ship", () => {
    // Considered alternative: failure is a throw instead of a null result.
    // It avoids the `| null` in the callback's return annotation, but the
    // catch-all turns every genuine bug inside the callback into "no match".
    function guardThrow<Value, Narrowed extends Value>(
      match: (value: Value) => Narrowed,
      // eslint-disable-next-line noter/no-hand-written-type-predicate -- exercises the rejected throw-variant shape
    ): (value: Value) => value is Narrowed {
      // eslint-disable-next-line noter/no-hand-written-type-predicate -- exercises the rejected throw-variant shape
      return (value): value is Narrowed => {
        try {
          return Object.is(match(value), value);
        } catch {
          return false;
        }
      };
    }

    const isCircle = guardThrow((shape: Shape): Circle => {
      if (shape.kind === "circle") return shape;
      throw new Error("no match");
    });

    expect(isCircle(circle)).toBe(true);
    expect(isCircle(square)).toBe(false);

    const buggy = guardThrow((shape: Shape): Circle => {
      const parsed: unknown = JSON.parse("{"); // stands in for an accidental bug
      if (shape.kind === "circle" && parsed !== undefined) return shape;
      throw new Error("no match");
    });

    expect(buggy(circle)).toBe(false);
  });
});

function lastValue<Value>(values: Array1<Value>): Value {
  // @ts-expect-error Array1 guarantees a value at the computed last index.
  return values[values.length - 1];
}
