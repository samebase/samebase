import { describe, expect, it } from "vite-plus/test";
import { array, bad, fail, good, object, pure, recurse, recursiveElem, tuple } from "../index.ts";
import type { InferBad, Issue } from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

describe("validation issues", () => {
  it("keeps undefined failures at their own indexes in sync and async arrays", async () => {
    const leaf = pure((value) => (value === "ok" ? good(value) : fail(undefined)));
    const sync = array(leaf);
    const async = array(pure((value) => Promise.resolve(leaf(value))));
    assertEqual<InferBad<typeof sync>, readonly Issue<undefined | "not array">[]>(true);

    expect(sync(["ok", "fail"])).toStrictEqual(bad([{ path: [1], error: undefined }]));
    expect(sync(["fail", "ok"])).toStrictEqual(bad([{ path: [0], error: undefined }]));
    await expect(async(["ok", "fail"])).resolves.toStrictEqual(
      bad([{ path: [1], error: undefined }]),
    );
  });

  it("prefixes existing paths without interpreting array or object payloads", async () => {
    const key = Symbol("field");
    const payload = [{ path: ["payload"], error: "opaque" }];
    const schema = object({
      rows: array(
        tuple([
          pure(() =>
            Promise.resolve(
              bad([
                { path: [key], error: payload },
                { path: [], error: undefined },
              ]),
            ),
          ),
        ]),
      ),
    });

    const result = await schema({ rows: [[0]] });
    expect(result).toStrictEqual(
      bad([
        { path: ["rows", 0, 0, key], error: payload },
        { path: ["rows", 0, 0], error: undefined },
      ]),
    );
    if (!result[0]) expect(result[1][0]?.error).toBe(payload);
  });

  it("keeps a child failure even when its issue array is empty", async () => {
    const empty = pure(() => bad([]));
    const pending = pure(() => Promise.resolve(empty(null)));
    expect(object({ value: empty })({ value: 1 })).toStrictEqual(bad([]));
    expect(array(empty)([1])).toStrictEqual(bad([]));
    expect(tuple([empty])([1])).toStrictEqual(bad([]));
    expect(recurse(object({ child: recursiveElem }), () => empty)({ child: 1 })).toStrictEqual(
      bad([]),
    );
    await expect(object({ value: pending })({ value: 1 })).resolves.toStrictEqual(bad([]));
  });

  it("reports outer shape failures even when a schema has no children", () => {
    expect(object({})(null)).toStrictEqual(fail("not object"));
    expect(array(good)(null)).toStrictEqual(fail("not array"));
    expect(tuple([])(null)).toStrictEqual(fail("not tuple"));
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
