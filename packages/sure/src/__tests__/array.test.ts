import { describe, it, expect } from "vite-plus/test";
import { array, number } from "../index.ts";
import type { InferGood, InferBad, InferInput, InferMeta } from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

const someArray = array(number);

// Type Checks
type InferredGood = InferGood<typeof someArray>;
type InferredBad = InferBad<typeof someArray>;
type InferredInput = InferInput<typeof someArray>;
type InferredMeta = InferMeta<typeof someArray>;

assertEqual<InferredGood, number[]>(true);
assertEqual<InferredBad, ("not number" | undefined)[]>(true);
assertEqual<InferredInput, unknown>(true);
assertEqual<InferredMeta extends { meta: { type: "array" } } ? true : false, true>(true);
assertEqual<InferredMeta extends { meta: { schema: typeof number } } ? true : false, true>(true);

describe("array", () => {
  it("should return good value", () => {
    const value = someArray([1, 2, 3]);

    expect(value).toStrictEqual([true, [1, 2, 3]]);
  });

  it("should return bad value", () => {
    const value = someArray([1, "two", 3]);

    expect(value).toStrictEqual([false, [undefined, "not number", undefined]]);
  });
});
