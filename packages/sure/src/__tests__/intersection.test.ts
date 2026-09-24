import { describe, it, expect } from "vite-plus/test";
import { number, intersection, string, object } from "../index.ts";
import type {
  InferBad,
  InferGood,
  InferInput,
  InferMeta,
  // eslint-disable-next-line no-unused-vars -- type-test scaffolding
  InferSchemaGood,
  Issues,
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
assertEqual<InferredBad, Issues<"not object" | "not string"> | Issues<"not object" | "not number">>(
  true,
);
assertEqual<InferredInput, unknown>(true); // The input needs more tests
assertEqual<
  InferredMeta,
  {
    meta: {
      type: "intersection";
      first: Sure<
        Issues<"not object" | "not string">,
        {
          name: string;
        },
        unknown,
        MetaObj<{
          type: "object";
          schema: {
            name: Sure<
              Issues<"not string">,
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
        Issues<"not object" | "not number">,
        {
          age: number;
        },
        unknown,
        MetaObj<{
          type: "object";
          schema: {
            age: Sure<
              Issues<"not number">,
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

    expect(value).toStrictEqual([false, [{ message: "not string", path: ["name"] }]]);

    // TypeChecks
    if (value[0] === false) {
      assertEqual<
        (typeof value)[1],
        Issues<"not object" | "not string"> | Issues<"not object" | "not number">
      >(true);
    }
  });

  it("should return bad value", () => {
    const value = simple({
      name: "1",
      age: "1",
    });

    expect(value).toStrictEqual([false, [{ message: "not number", path: ["age"] }]]);
  });
});
