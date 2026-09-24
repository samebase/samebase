import { describe, expect, it } from "vite-plus/test";
import {
  after,
  array,
  bad,
  err,
  good,
  intersection,
  number,
  object,
  optional,
  pure,
  recurse,
  recursiveElem,
  string,
  sure,
  tuple,
  union,
} from "../index.ts";
import type {
  Good,
  InferAsync,
  InferBad,
  InferGood,
  InferInput,
  MaybePromise,
  MetaNever,
  Sure,
  Unsure,
} from "../index.ts";
import { justMeta } from "../meta_wip.ts";
import { assertEqual, assertIs } from "./typeTestUtils.ts";

const asyncNumber = pure((value) => Promise.resolve(number(value)));

describe("async composition", () => {
  it("infers leaf promises without widening synchronous schemas", async () => {
    assertEqual<InferInput<typeof asyncNumber>, unknown>(true);
    assertEqual<InferGood<typeof asyncNumber>, number>(true);
    assertEqual<InferBad<typeof asyncNumber>, "not number">(true);
    assertEqual<ReturnType<typeof asyncNumber>, Promise<Unsure<"not number", number>>>(true);
    assertIs<Sure<"not number", number, unknown, MetaNever, true>>(asyncNumber);
    // @ts-expect-error A promise-returning validator cannot satisfy a synchronous Sure.
    assertIs<Sure<"not number", number>>(asyncNumber);

    const narrow = pure((value: string) => Promise.resolve(good(value.length)));
    assertEqual<InferInput<typeof narrow>, string>(true);
    const withMeta = sure((value) => asyncNumber(value), { type: "remote-number" as const });
    expect(justMeta(withMeta)).toEqual({ type: "remote-number" });
    assertEqual<ReturnType<typeof number>, Unsure<"not number", number>>(true);
    await expect(asyncNumber(2)).resolves.toEqual(good(2));
    await expect(asyncNumber("2")).resolves.toEqual(bad("not number"));
  });

  it("lifts a nested object and preserves field and error inference", async () => {
    const schema = object({
      name: string,
      age: asyncNumber,
      tags: array(string),
      location: optional(tuple([string, asyncNumber])),
    });
    type Value = { name: string; age: number; tags: string[]; location?: [string, number] };
    type Error = {
      name?: "not string";
      age?: "not number";
      tags?: ("not string" | undefined)[];
      location?: ["not string" | undefined, "not number" | undefined];
    };
    assertEqual<InferGood<typeof schema>, Value>(true);
    assertEqual<InferBad<typeof schema>, Error>(true);
    assertEqual<ReturnType<typeof schema>, MaybePromise<Unsure<Error, Value>>>(true);
    const result = schema({ name: "Ada", age: 2, tags: [], location: ["home", 4] });
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toEqual(
      good({ name: "Ada", age: 2, tags: [], location: ["home", 4] }),
    );
    await expect(schema({ name: 1, age: "2", tags: [3], location: [2, "3"] })).resolves.toEqual(
      bad({
        name: "not string",
        age: "not number",
        tags: ["not string"],
        location: ["not string", "not number"],
      }),
    );
  });

  it("keeps skipped async children synchronous", () => {
    expect(array(asyncNumber)([])).toEqual(good([]));
    expect(array(asyncNumber)(null)).toEqual(bad([]));
    expect(tuple([asyncNumber])(null)).toEqual(bad([]));
    expect(object({ age: asyncNumber })(null)).toEqual(bad({}));
    expect(object({ age: optional(asyncNumber) })({})).toEqual(good({}));
    expect(union(number, asyncNumber)(1)).toEqual(good(1));
    expect(after(number, asyncNumber)("bad")).toEqual(bad("not number"));
    expect(intersection(object({ name: string }), object({ age: asyncNumber }))(null)).toEqual(
      bad({}),
    );
  });

  it("runs object children in order and continues after a validation error", async () => {
    const calls: string[] = [];
    const schema = object({
      first: pure(() => {
        calls.push("first");
        return Promise.resolve(bad("unavailable"));
      }),
      second: pure((value) => {
        calls.push("second");
        return number(value);
      }),
    });
    const result = schema({ first: 1, second: "bad" });
    expect(calls).toEqual(["first"]);
    await expect(result).resolves.toEqual(bad({ first: "unavailable", second: "not number" }));
    expect(calls).toEqual(["first", "second"]);
  });

  it("allows a leaf to choose synchronous or async results for each input", async () => {
    const schema = pure((value) =>
      typeof value === "string" ? Promise.resolve(number(Number(value))) : number(value),
    );
    assertEqual<InferAsync<typeof schema>, boolean>(true);
    expect(schema(1)).toEqual(good(1));
    await expect(schema("2")).resolves.toEqual(good(2));
    await expect(array(schema)([1, "2", 3])).resolves.toEqual(good([1, 2, 3]));
  });

  it("infers an async function and an explicit wrapper around overloaded work", async () => {
    const asyncLeaf = pure(async (value) => number(await Promise.resolve(value)));
    assertEqual<InferAsync<typeof asyncLeaf>, true>(true);
    await expect(asyncLeaf(1)).resolves.toEqual(good(1));

    function work(value: string): Promise<Good<string>>;
    function work(value: number): Good<number>;
    function work(value: string | number): Promise<Good<string>> | Good<number> {
      return typeof value === "string" ? Promise.resolve(good(value)) : good(value);
    }
    const schema = pure((value: string | number) =>
      typeof value === "string" ? work(value) : work(value),
    );
    assertEqual<InferAsync<typeof schema>, boolean>(true);
    assertEqual<InferGood<typeof schema>, string | number>(true);
    expect(tuple([schema])([1])).toEqual(good([1]));
    await expect(tuple([schema])(["one"])).resolves.toEqual(good(["one"]));
  });

  it("keeps array and tuple errors at their original positions", async () => {
    await expect(array(asyncNumber)([1, "bad", 3])).resolves.toEqual(
      bad([undefined, "not number", undefined]),
    );
    await expect(tuple([asyncNumber, string])([1, 2])).resolves.toEqual(
      bad([undefined, "not string"]),
    );
    const undefinedError = pure(() => Promise.resolve(bad(undefined)));
    await expect(array(undefinedError)([1])).resolves.toEqual(bad([undefined]));
  });

  it("waits before applying after, union, and intersection branches", async () => {
    const positive = after(asyncNumber, (value) => {
      assertEqual<typeof value, number>(true);
      return value > 0 ? good(value) : bad("not positive");
    });
    await expect(positive(2)).resolves.toEqual(good(2));
    await expect(positive(-1)).resolves.toEqual(bad("not positive"));
    await expect(union(asyncNumber, string)("hello")).resolves.toEqual(good("hello"));
    await expect(
      intersection(object({ age: asyncNumber }), object({ name: string }))({ age: 2, name: "Ada" }),
    ).resolves.toEqual(good({ age: 2, name: "Ada" }));
    let called = false;
    const second = pure(() => {
      called = true;
      return good({});
    });
    await expect(union(asyncNumber, second)(2)).resolves.toEqual(good(2));
    await expect(after(asyncNumber, second)("bad")).resolves.toEqual(bad("not number"));
    await expect(
      intersection(object({ age: asyncNumber }), second)({ age: "bad" }),
    ).resolves.toEqual(bad({ age: "not number" }));
    expect(called).toBe(false);
  });

  it("propagates promise rejection without turning it into a validation error", async () => {
    const failure = new Error("connection failed");
    const rejected = pure(() => Promise.reject<Unsure<never, Record<string, unknown>>>(failure));
    const schemas = [
      object({ value: rejected }),
      array(rejected),
      tuple([rejected]),
      after(rejected, good),
      union(rejected, good),
      intersection(rejected, good),
      optional(rejected),
      recurse(rejected, (inner) => array(inner)),
    ];
    for (const schema of schemas) {
      await expect(schema([{}])).rejects.toBe(failure);
    }
    const throws = pure(() => {
      throw failure;
    });
    expect(() => object({ value: throws })({ value: 1 })).toThrow(failure);
  });

  it("supports async work inside recursive child validation", async () => {
    const schema = recurse(object({ name: string, children: recursiveElem }), (inner) =>
      after(array(inner), (children) => Promise.resolve(good(children))),
    );
    assertEqual<InferAsync<typeof schema>, boolean>(true);
    const value = { name: "root", children: [{ name: "child", children: [] }] };
    await expect(schema(value)).resolves.toEqual(good(value));
    expect(schema(null)).toEqual(bad({}));
    expect(schema({ name: "root", children: [{ name: 2, children: [] }] })).toEqual(
      bad({ children: [{ name: "not string" }] }),
    );
  });

  it("unwraps async results and rejects with their bad payload", async () => {
    const parse = err(asyncNumber);
    assertEqual<ReturnType<typeof parse>, Promise<number>>(true);
    await expect(parse(2)).resolves.toBe(2);
    await expect(parse("2")).rejects.toBe("not number");
    const nested = err(pure(() => Promise.resolve(good(Promise.resolve(3)))));
    assertEqual<ReturnType<typeof nested>, Promise<number>>(true);
    await expect(nested(null)).resolves.toBe(3);
  });

  it("does not treat a promise inside a good payload as async validation", async () => {
    const schema = object({ value: pure(() => good(Promise.resolve(2))) });
    assertEqual<ReturnType<typeof schema>, Unsure<{ value?: never }, { value: Promise<number> }>>(
      true,
    );
    const result = schema({ value: 1 });
    assertIs<Good<{ value: Promise<number> }> | readonly [false, { value?: never }]>(result);
    expect(result[0]).toBe(true);
    if (result[0]) await expect(result[1].value).resolves.toBe(2);
  });

  it("preserves unrestricted payloads in both async outcomes", async () => {
    const thenable = {
      then: () => {
        throw new Error("A payload must not be awaited");
      },
    };
    const payloads = [undefined, null, false, 0, "", Promise.resolve(1), thenable];
    for (const payload of payloads) {
      const success = pure(() => Promise.resolve(good(payload)));
      const failure = pure(() => Promise.resolve(bad(payload)));
      await expect(object({ value: success })({ value: 1 })).resolves.toStrictEqual(
        good({ value: payload }),
      );
      await expect(object({ value: failure })({ value: 1 })).resolves.toStrictEqual(
        bad({ value: payload }),
      );
      await expect(array(success)([1])).resolves.toStrictEqual(good([payload]));
      await expect(array(failure)([1])).resolves.toStrictEqual(bad([payload]));
      await expect(tuple([success])([1])).resolves.toStrictEqual(good([payload]));
      await expect(tuple([failure])([1])).resolves.toStrictEqual(bad([payload]));
      await expect(after(success, good)(1)).resolves.toStrictEqual(good(payload));
      await expect(union(failure, success)(1)).resolves.toStrictEqual(good(payload));
    }
  });

  it("accepts a tuple with an extra then property without interpreting it", () => {
    const schema = pure(() =>
      Object.assign(good(1), {
        then: () => {
          throw new Error("A result tuple must not be awaited");
        },
      }),
    );
    assertEqual<InferGood<typeof schema>, 1>(true);
    assertEqual<InferBad<typeof schema>, never>(true);
    assertEqual<InferAsync<typeof schema>, false>(true);
    expect(array(schema)([0])).toEqual(good([1]));
    expect(err(schema)(0)).toBe(1);
  });

  it("closes array iterators when a validator throws or rejects", async () => {
    const failure = new Error("validation failed");
    const calls: string[] = [];
    const values = [1];
    values[Symbol.iterator] = function* () {
      try {
        yield 1;
      } finally {
        calls.push("closed");
        // eslint-disable-next-line no-unsafe-finally -- Verify that cleanup failure cannot replace the validation failure.
        throw new Error("cleanup failed");
      }
    };
    expect(() =>
      array(
        pure(() => {
          throw failure;
        }),
      )(values),
    ).toThrow(failure);
    await expect(array(pure(() => Promise.reject(failure)))(values)).rejects.toBe(failure);
    expect(calls).toEqual(["closed", "closed"]);
  });
});
