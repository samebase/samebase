import { describe, it, expect } from "vite-plus/test";
import {
  good,
  bad,
  after,
  MetaObj,
  MetaNever,
  InferGood,
  InferBad,
  InferInput,
  InferMeta,
  object,
  number,
  string,
  Sure,
  Good,
  Bad,
  Issues,
} from "../index.ts";
import { assertEqual, assertIs } from "./typeTestUtils.ts";

const sureNumber = (value: unknown) =>
  typeof value === "number" //
    ? good(value)
    : bad("not number");

const positiveNum = (value: number) => {
  if (value > 0) {
    return [true, value] as const;
  }

  return [false, "not positive"] as const;
};

const combined = after(sureNumber, positiveNum);

{
  type InferredGood = InferGood<typeof positiveNum>;
  type InferredBad = InferBad<typeof positiveNum>;
  type InferredInput = InferInput<typeof positiveNum>;
  type InferredMeta = InferMeta<typeof positiveNum>;

  assertEqual<InferredGood, number>(true);
  assertEqual<InferredBad, "not positive">(true);
  assertEqual<InferredInput, number>(true);

  // TODO: Not liking this, should it by MetaNever by default?
  assertEqual<InferredMeta, MetaNever | MetaObj>(true);
}

{
  // eslint-disable-next-line no-unused-vars -- type-test scaffolding
  type InferredSure = typeof combined;

  type InferredGood = InferGood<typeof combined>;
  type InferredBad = InferBad<typeof combined>;
  type InferredInput = InferInput<typeof combined>;
  type InferredMeta = InferMeta<typeof combined>;

  assertEqual<InferredGood, number>(true);
  assertEqual<InferredBad, "not positive" | "not number">(true);
  assertEqual<InferredInput, unknown>(true);
  assertEqual<
    InferredMeta,
    MetaObj<{
      type: "after";
      first: typeof sureNumber;
      second: typeof positiveNum;
    }>
  >(true);
}

/*
Big Object
 */

const sureBig = after(
  object({
    age: after(number, (val) => {
      if (val % 1 !== 0) return bad([{ message: "not integer" }]);
      if (val < 0) return bad([{ message: "not positive" }]);
      if (val > 200) return bad([{ message: "too old, sorry" }]);

      return good(val);
    }),
    name: string,
  }),
  (val) => {
    if (val.name === "john" && val.age < 30) {
      return bad([{ message: `john's below 30 are too young`, path: ["name"] }]);
    }

    return good(val);
  },
);

{
  type InferredGood = InferGood<typeof sureBig>;
  type InferredBad = InferBad<typeof sureBig>;
  type InferredInput = InferInput<typeof sureBig>;
  type InferredMeta = InferMeta<typeof sureBig>;

  assertEqual<InferredInput, unknown>(true);
  assertEqual<
    InferredGood,
    {
      age: number;
      name: string;
    }
  >(true);

  assertEqual<
    InferredBad,
    | Issues<
        | "not object"
        | "not number"
        | "not positive"
        | "not integer"
        | "too old, sorry"
        | "not string"
      >
    | Issues<"john's below 30 are too young">
  >(true);

  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "after";
        first: Sure<
          Issues<
            | "not object"
            | "not number"
            | "not positive"
            | "not integer"
            | "too old, sorry"
            | "not string"
          >,
          {
            age: number;
            name: string;
          },
          unknown,
          MetaObj<{
            type: "object";
            schema: {
              age: Sure<
                | Issues<"not number">
                | Issues<"not integer">
                | Issues<"not positive">
                | Issues<"too old, sorry">,
                number,
                unknown,
                MetaObj<{
                  type: "after";
                  first: typeof number;
                  second: (
                    val: number,
                  ) =>
                    | Good<number>
                    | Bad<Issues<"not integer">>
                    | Bad<Issues<"not positive">>
                    | Bad<Issues<"too old, sorry">>;
                }>
              >;
              name: typeof string;
            };
          }>
        >;
        second: (val: { age: number; name: string }) =>
          | Good<{
              age: number;
              name: string;
            }>
          | Bad<Issues<"john's below 30 are too young">>;
      };
    }
  >(true);
}

describe("after", () => {
  it("should correctly run", () => {
    const [ok, out] = combined(1);

    expect(ok).toBe(true);
    expect(out).toBe(1);

    {
      // DX checks
      assertIs<boolean>(ok);
      assertIs<number | "not number" | "not positive">(out);

      if (ok) {
        assertIs<number>(out);
      } else {
        assertIs<"not number" | "not positive">(out);
      }
    }
  });

  it("reports the issues of the first validator", () => {
    expect(sureBig({ age: "12", name: "john" })).toStrictEqual([
      false,
      [{ message: "not number", path: ["age"] }],
    ]);
  });

  it("reports the issues of the second validator", () => {
    expect(sureBig({ age: -1, name: "jane" })).toStrictEqual([
      false,
      [{ message: "not positive", path: ["age"] }],
    ]);

    expect(sureBig({ age: 12, name: "john" })).toStrictEqual([
      false,
      [{ message: "john's below 30 are too young", path: ["name"] }],
    ]);
  });
});
