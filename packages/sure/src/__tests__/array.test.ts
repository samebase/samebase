import type { Issue } from "../index.ts";
import { describe, it, expect } from "vite-plus/test";
import { array, number } from "../index.ts";
import type {
  InferGood,
  InferBad,
  InferInput,
  InferMeta,
  Sure,
  MetaObj,
  // eslint-disable-next-line no-unused-vars -- type-test scaffolding
  MetaNever,
} from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

const someArray = array(number);

// Type Checks
// eslint-disable-next-line no-unused-vars -- type-test scaffolding
type InferredSure = typeof someArray;
type InferredGood = InferGood<typeof someArray>;
type InferredBad = InferBad<typeof someArray>;
type InferredInput = InferInput<typeof someArray>;
type InferredMeta = InferMeta<typeof someArray>;

assertEqual<InferredGood, number[]>(true);
assertEqual<InferredBad, readonly Issue<"not number" | "not array">[]>(true);
assertEqual<InferredInput, unknown>(true);
assertEqual<
  InferredMeta,
  {
    meta: {
      type: "array";
      schema: Sure<
        readonly Issue<"not number">[],
        number,
        unknown,
        MetaObj<{
          type: "number";
        }>
      >;
    };
  }
>(true);

describe("array", () => {
  it("should return good value", () => {
    const value = someArray([1, 2, 3]);

    expect(value).toStrictEqual([true, [1, 2, 3]]);
  });

  it("should return bad value", () => {
    const value = someArray([1, "two", 3]);

    expect(value).toStrictEqual([false, [{ path: [1], error: "not number" }]]);
  });
});
