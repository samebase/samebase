import { describe, it, expect } from "vite-plus/test";
import { good, number, intersection, string, object } from "../index.ts";
import type {
  InferBad,
  InferGood,
  InferInput,
  InferMeta,
  // eslint-disable-next-line no-unused-vars -- type-test scaffolding
  InferSchemaGood,
  // eslint-disable-next-line no-unused-vars -- type-test scaffolding
  MetaNever,
  MetaObj,
  Sure,
} from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

const option1 = object({
  name: string,
});

const simple = intersection(
  option1,
  object({
    age: number,
  }),
);

// TypeChecks
type InferredGood = InferGood<typeof simple>;
type InferredBad = InferBad<typeof simple>;
type InferredInput = InferInput<typeof simple>;
type InferredMeta = InferMeta<typeof simple>;

assertEqual<InferredGood, { name: string } & { age: number }>(true);
assertEqual<InferredBad, { name?: "not string" } | { age?: "not number" }>(true);
assertEqual<InferredInput, unknown>(true); // The input needs more tests
assertEqual<
  InferredMeta,
  {
    meta: {
      type: "intersection";
      first: Sure<
        {
          name?: "not string";
        },
        {
          name: string;
        },
        unknown,
        MetaObj<{
          type: "object";
          schema: {
            name: Sure<
              "not string",
              string,
              unknown,
              MetaObj<{
                type: "string";
              }>
            >;
          };
        }>
      >;
      second: Sure<
        {
          age?: "not number";
        },
        {
          age: number;
        },
        unknown,
        MetaObj<{
          type: "object";
          schema: {
            age: Sure<
              "not number",
              number,
              unknown,
              MetaObj<{
                type: "number";
              }>
            >;
          };
        }>
      >;
    };
  }
>(true);

//
//
describe("and", () => {
  it("infers inline inputs as unknown and preserves explicit input types", async () => {
    const inline = intersection(
      (value) => {
        assertEqual<typeof value, unknown>(true);
        return good({ first: value });
      },
      (value) => {
        assertEqual<typeof value, unknown>(true);
        return good({ second: value });
      },
    );
    expect(inline(1)).toStrictEqual(good({ first: 1, second: 1 }));

    const first = () => good({ present: true });
    const second = (value: string) => Promise.resolve(good({ length: value.length }));
    const narrow = intersection(first, second);
    assertEqual<InferInput<typeof narrow>, string>(true);
    assertEqual<typeof narrow.meta.first, typeof first>(true);
    assertEqual<typeof narrow.meta.second, typeof second>(true);
    await expect(narrow("hello")).resolves.toStrictEqual(good({ present: true, length: 5 }));
  });

  it("should return good value", () => {
    const value = simple({
      name: "1",
      age: 1,
    });

    expect(value).toStrictEqual([true, { name: "1", age: 1 }]);

    // TypeChecks
    if (value[0] === true) {
      assertEqual<(typeof value)[1], { name: string } & { age: number }>(true);
    }
  });

  it("should return bad value", () => {
    const value = simple({
      name: 1,
      age: 1,
    });

    expect(value).toStrictEqual([false, { name: "not string" }]);

    // TypeChecks
    if (value[0] === false) {
      assertEqual<
        (typeof value)[1],
        | {
            name?: "not string";
          }
        | {
            age?: "not number";
          }
      >(true);
    }
  });

  it("should return bad value", () => {
    const value = simple({
      name: "1",
      age: "1",
    });

    expect(value).toStrictEqual([false, { age: "not number" }]);
  });
});
