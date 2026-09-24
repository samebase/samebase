import type { Issue } from "../index.ts";
import { describe, it, expect } from "vite-plus/test";
import {
  good,
  bad,
  fail,
  after,
  MetaObj,
  MetaNever,
  InferGood,
  InferBad,
  InferInput,
  InferMeta,
  object,
  string,
  Sure,
  Good,
  Bad,
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
    MetaObj<{ type: "after"; first: typeof sureNumber; second: typeof positiveNum }>
  >(true);
}

/*
Big Object
 */

const sureBig = after(
  object({
    age: after(
      (value: unknown) => (typeof value === "number" ? good(value) : fail("not number")),
      (val) => {
        if (val % 1 !== 0) return fail("not integer");
        if (val < 0) return fail("not positive");
        if (val > 200) return fail("too old, sorry");

        return good(val);
      },
    ),
    name: string,
  }),
  (val) => {
    if (val.name === "john" && val.age < 30) {
      return bad({ name: `john's below 30 are too young` as const });
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
    | readonly Issue<
        | "not number"
        | "not positive"
        | "not integer"
        | "too old, sorry"
        | "not string"
        | "not object"
      >[]
    | { name: "john's below 30 are too young" }
  >(true);

  assertEqual<
    InferredMeta,
    MetaObj<{
      type: "after";
      first: Sure<
        readonly Issue<
          | "not number"
          | "not positive"
          | "not integer"
          | "too old, sorry"
          | "not string"
          | "not object"
        >[],
        { age: number; name: string },
        unknown,
        MetaObj<{
          type: "object";
          schema: {
            age: Sure<
              | readonly Issue<"not number">[]
              | readonly Issue<"not positive">[]
              | readonly Issue<"not integer">[]
              | readonly Issue<"too old, sorry">[],
              number,
              unknown,
              MetaObj<{
                type: "after";
                first: (value: unknown) => Good<number> | Bad<readonly Issue<"not number">[]>;
                second: (
                  val: number,
                ) =>
                  | Good<number>
                  | Bad<readonly Issue<"not positive">[]>
                  | Bad<readonly Issue<"not integer">[]>
                  | Bad<readonly Issue<"too old, sorry">[]>;
              }>
            >;
            name: typeof string;
          };
        }>
      >;
      second: (val: {
        age: number;
        name: string;
      }) => Good<{ age: number; name: string }> | Bad<{ name: "john's below 30 are too young" }>;
    }>
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
});
