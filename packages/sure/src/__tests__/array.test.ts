import { describe, it, expect } from "vite-plus/test";
import { array, number } from "../index.ts";
import type {
  InferGood,
  InferBad,
  InferInput,
  InferMeta,
  Issues,
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
assertEqual<InferredBad, Issues<"not array" | "not number">>(true);
assertEqual<InferredInput, unknown>(true);
assertEqual<
  InferredMeta,
  {
    meta: {
      type: "array";
      schema: Sure<
        Issues<"not number">,
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

    expect(value).toStrictEqual([false, [{ message: "not number", path: [1] }]]);
  });

  it("should return an issue for each bad element", () => {
    const value = someArray(["one", 2, "three"]);

    expect(value).toStrictEqual([
      false,
      [
        { message: "not number", path: [0] },
        { message: "not number", path: [2] },
      ],
    ]);
  });

  it("should return a bad value for non arrays", () => {
    expect(someArray({ 0: 1 })).toStrictEqual([false, [{ message: "not array" }]]);
  });
});
