import { describe, expect, it } from "vite-plus/test";
import {
  array,
  bad,
  fail,
  good,
  intersection,
  object,
  optional,
  pure,
  recurse,
  recursiveElem,
  sure,
  string,
  tuple,
  union,
  unknown as unknownValue,
} from "../index.ts";
import type { InferBad, InferGood, Issue } from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

describe("validation issues", () => {
  it("keeps undefined failures at their own indexes", () => {
    const leaf = pure((value) => (value === "ok" ? good(value) : fail(undefined)));
    const schema = array(leaf);
    assertEqual<InferBad<typeof schema>, readonly Issue<undefined | "not array">[]>(true);

    expect(schema(["ok", "fail"])).toStrictEqual(bad([{ path: [1], error: undefined }]));
    expect(schema(["fail", "ok"])).toStrictEqual(bad([{ path: [0], error: undefined }]));
  });

  it("prefixes custom paths and keeps error payloads opaque", () => {
    const key = Symbol("field");
    const thenable = {
      then: () => {
        throw new Error("Must not run a payload");
      },
    };
    const payloads = [
      undefined,
      null,
      false,
      0,
      "",
      [{ path: ["payload"], error: "opaque" }],
      Promise.resolve(1),
      thenable,
    ];

    for (const payload of payloads) {
      const schema = object({
        rows: array(
          tuple([pure(() => bad([{ path: [key], error: payload }, ...fail(payload)[1]]))]),
        ),
      });
      const result = schema({ rows: [[0]] });
      expect(result).toStrictEqual(
        bad([
          { path: ["rows", 0, 0, key], error: payload },
          { path: ["rows", 0, 0], error: payload },
        ]),
      );
      if (!result[0]) expect(result[1][0]?.error).toBe(payload);
    }
  });

  it("keeps a child failure even when its issue array is empty", () => {
    const empty = pure(() => bad([]));
    expect(object({ value: empty })({ value: 1 })).toStrictEqual(bad([]));
    expect(array(empty)([1])).toStrictEqual(bad([]));
    expect(tuple([empty])([1])).toStrictEqual(bad([]));
    expect(recurse(object({ child: recursiveElem }), () => empty)({ child: 1 })).toStrictEqual(
      bad([]),
    );
  });

  it("reports outer shape failures even when a schema has no children", () => {
    expect(object({})(null)).toStrictEqual(fail("not object"));
    expect(array(good)(null)).toStrictEqual(fail("not array"));
    expect(tuple([])(null)).toStrictEqual(fail("not tuple"));
  });

  it("composes validators that only succeed without inventing an error type", () => {
    const first = pure(() => good(undefined));
    const second = sure(() => good(null), { type: "constant" });
    assertEqual<InferBad<typeof first>, never>(true);
    assertEqual<InferBad<typeof second>, never>(true);
    const schema = object({ first, second, third: optional(unknownValue) });
    assertEqual<InferGood<typeof schema>, { first: undefined; second: null; third?: unknown }>(
      true,
    );
    assertEqual<InferBad<typeof schema>, readonly Issue<"not object">[]>(true);
    expect(schema({})).toStrictEqual(good({ first: undefined, second: null }));

    const choice = union(
      pure(() => good("x")),
      string,
    );
    const combined = intersection(
      pure(() => good({ x: 1 })),
      object({ y: string }),
    );
    assertEqual<InferBad<typeof choice>, readonly Issue<"not string">[]>(true);
    assertEqual<InferBad<typeof combined>, readonly Issue<"not object" | "not string">[]>(true);
    expect(object({ value: choice })({ value: 1 })).toStrictEqual(good({ value: "x" }));
    expect(array(combined)([{ y: "y" }])).toStrictEqual(good([{ x: 1, y: "y" }]));
  });

  it("requires issue arrays at collection boundaries", () => {
    const raw = pure(() => bad(undefined));
    // @ts-expect-error A collection needs paths; use fail for a custom validation failure.
    object({ value: raw });
    // @ts-expect-error A collection needs paths; use fail for a custom validation failure.
    array(raw);
    // @ts-expect-error A collection needs paths; use fail for a custom validation failure.
    tuple([raw]);
    // Generic results still accept any failure payload.
    expect(raw(null)).toStrictEqual([false, undefined]);
  });
});
