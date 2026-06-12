import { describe, it, expect } from "vite-plus/test";
import { number, union, string } from "../index.ts";
import type {
  InferBad,
  InferGood,
  InferInput,
  InferMeta,
  // eslint-disable-next-line no-unused-vars -- type-test scaffolding
  MetaNever,
  MetaObj,
  Sure,
} from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

const simple = union(number, string);

// TypeChecks
type InferredGood = InferGood<typeof simple>;
type InferredBad = InferBad<typeof simple>;
type InferredInput = InferInput<typeof simple>;
type InferredMeta = InferMeta<typeof simple>;

assertEqual<InferredGood, number | string>(true);
assertEqual<InferredBad, "not number" | "not string">(true);
assertEqual<InferredInput, unknown>(true);
assertEqual<
  InferredMeta,
  {
    meta: {
      type: "union";
      first: Sure<
        "not number",
        number,
        unknown,
        MetaObj<{
          type: "number";
        }>
      >;
      second: Sure<
        "not string",
        string,
        unknown,
        MetaObj<{
          type: "string";
        }>
      >;
    };
  }
>(true);
//
//

describe("or", () => {
  it("should return good value", () => {
    const value = simple(1);

    expect(value).toStrictEqual([true, 1]);

    // TypeChecks
    if (value[0] === true) {
      assertEqual<(typeof value)[1], number | string>(true);
    }
  });

  it("should return good value", () => {
    const value = simple("1");

    expect(value).toStrictEqual([true, "1"]);

    // TypeChecks
    if (value[0] === true) {
      assertEqual<(typeof value)[1], number | string>(true);
    }
  });

  it("should return bad value", () => {
    const value = simple(true);

    expect(value).toStrictEqual([false, "not string"]);

    // TypeChecks
    if (value[0] === false) {
      assertEqual<(typeof value)[1], "not number" | "not string">(true);
    }
  });

  it("if first value bad, return second", () => {
    const value = simple({});

    expect(value).toStrictEqual([false, "not string"]);
  });
});
