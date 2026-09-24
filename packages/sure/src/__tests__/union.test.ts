import type { Issue } from "../index.ts";
import { describe, it, expect } from "vite-plus/test";
import { bad, good, number, union, string } from "../index.ts";
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
assertEqual<InferredBad, readonly Issue<"not number">[] | readonly Issue<"not string">[]>(true);
assertEqual<InferredInput, unknown>(true);
assertEqual<
  InferredMeta,
  {
    meta: {
      type: "union";
      first: Sure<
        readonly Issue<"not number">[],
        number,
        unknown,
        MetaObj<{
          type: "number";
        }>
      >;
      second: Sure<
        readonly Issue<"not string">[],
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
  it("infers inline inputs as unknown and preserves explicit input types", async () => {
    const inline = union(
      (value) => {
        assertEqual<typeof value, unknown>(true);
        return bad(value);
      },
      (value) => {
        assertEqual<typeof value, unknown>(true);
        return good(value);
      },
    );
    expect(inline(1)).toStrictEqual(good(1));

    const first = () => bad(undefined);
    const second = (value: string) => Promise.resolve(good(value.length));
    const narrow = union(first, second);
    assertEqual<InferInput<typeof narrow>, string>(true);
    assertEqual<typeof narrow.meta.first, typeof first>(true);
    assertEqual<typeof narrow.meta.second, typeof second>(true);
    await expect(narrow("hello")).resolves.toStrictEqual(good(5));
  });

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

    expect(value).toStrictEqual([false, [{ path: [], error: "not string" }]]);

    // TypeChecks
    if (value[0] === false) {
      assertEqual<
        (typeof value)[1],
        readonly Issue<"not number">[] | readonly Issue<"not string">[]
      >(true);
    }
  });

  it("if first value bad, return second", () => {
    const value = simple({});

    expect(value).toStrictEqual([false, [{ path: [], error: "not string" }]]);
  });
});
