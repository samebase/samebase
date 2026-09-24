// eslint-disable-next-line no-unused-vars -- type-test scaffolding
import { describe, it, expect, assert } from "vite-plus/test";
import {
  tuple,
  number,
  string,
  boolean,
  good,
  bad,
  spread_NOT_IMPLEMENTED,
  array,
  nil,
  undef,
} from "../index.ts";
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
  Good,
  Bad,
  TupleInferGoods,
} from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

const someTuple = tuple([number, string, boolean]);

// Type Checks
{
  type InferredGood = InferGood<typeof someTuple>;
  type InferredBad = InferBad<typeof someTuple>;
  type InferredInput = InferInput<typeof someTuple>;
  type InferredMeta = InferMeta<typeof someTuple>;

  assertEqual<InferredInput, unknown>(true);
  assertEqual<InferredGood, [number, string, boolean]>(true);
  assertEqual<InferredBad, Issues<"not tuple" | "not number" | "not string" | "not boolean">>(true);
  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [
          Sure<
            Issues<"not number">,
            number,
            unknown,
            MetaObj<{
              type: "number";
            }>
          >,
          Sure<
            Issues<"not string">,
            string,
            unknown,
            MetaObj<{
              type: "string";
            }>
          >,
          (x: unknown) => Good<boolean> | Bad<Issues<"not boolean">>,
        ];
      };
    }
  >(true);
}

const myTuple = tuple([
  //
  string,
  spread_NOT_IMPLEMENTED(array(number)),
  string,
]);

{
  type InferredGood = InferGood<typeof myTuple>;
  type InferredBad = InferBad<typeof myTuple>;
  type InferredInput = InferInput<typeof myTuple>;
  type InferredMeta = InferMeta<typeof myTuple>;

  assertEqual<InferredInput, unknown>(true);

  assertEqual<InferredGood, [string, ...number[], string]>(true);
  assertEqual<InferredBad, Issues<"not tuple" | "not string" | "not array" | "not number">>(true);

  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [
          typeof string,
          Sure<
            Issues<"not array" | "not number">,
            number[],
            unknown,
            MetaObj<{
              parent: <Arr extends Sure<unknown, unknown[], unknown>>(
                schema: Arr,
              ) => Sure<
                InferBad<Arr>,
                InferGood<Arr>,
                unknown,
                MetaObj<{
                  parent: typeof spread_NOT_IMPLEMENTED;
                  schema: Arr;
                }>
              >;
              schema: Sure<
                Issues<"not array" | "not number">,
                number[],
                unknown,
                MetaObj<{
                  type: "array";
                  schema: typeof number;
                }>
              >;
            }>
          >,
          typeof string,
        ];
      };
    }
  >(true);
}

const smallSchema = tuple([
  //
  undef,
  spread_NOT_IMPLEMENTED(array(string)),
  number,
]);

{
  type InferredGood = InferGood<typeof smallSchema>;
  type InferredBad = InferBad<typeof smallSchema>;
  type InferredInput = InferInput<typeof smallSchema>;
  type InferredMeta = InferMeta<typeof smallSchema>;

  assertEqual<InferredInput, unknown>(true);

  assertEqual<InferredGood, [undefined, ...string[], number]>(true);
  assertEqual<
    InferredBad,
    Issues<"not tuple" | "not undefined" | "not array" | "not string" | "not number">
  >(true);

  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [
          (value: unknown) => Good<undefined> | Bad<Issues<"not undefined">>,
          Sure<
            Issues<"not array" | "not string">,
            string[],
            unknown,
            MetaObj<{
              parent: <Arr extends Sure<unknown, unknown[], unknown>>(
                schema: Arr,
              ) => Sure<
                InferBad<Arr>,
                InferGood<Arr>,
                unknown,
                MetaObj<{
                  parent: typeof spread_NOT_IMPLEMENTED;
                  schema: Arr;
                }>
              >;
              schema: Sure<
                Issues<"not array" | "not string">,
                string[],
                unknown,
                MetaObj<{
                  type: "array";
                  schema: Sure<
                    Issues<"not string">,
                    string,
                    unknown,
                    MetaObj<{
                      type: "string";
                    }>
                  >;
                }>
              >;
            }>
          >,
          Sure<
            Issues<"not number">,
            number,
            unknown,
            MetaObj<{
              type: "number";
            }>
          >,
        ];
      };
    }
  >(true);
}

describe("tuple", () => {
  it("should return good value", () => {
    const value = someTuple([1, "hello", true]);

    const expected: InferGood<typeof someTuple> = [1, "hello", true];

    expect(value).toStrictEqual(good(expected));
  });

  it("should return bad value", () => {
    const value = someTuple([1, "two", 3]);

    const expected: InferBad<typeof someTuple> = [{ message: "not boolean", path: [2] }];

    expect(value).toStrictEqual(bad(expected));
  });

  it("should return a bad value for non arrays", () => {
    expect(someTuple("1, hello, true")).toStrictEqual([false, [{ message: "not tuple" }]]);
  });

  it("DX: schema is inferred correctly", () => {
    const arrSchema = [
      //
      string,
      spread_NOT_IMPLEMENTED(array(number)),
    ] as const;

    type InferSchema = TupleInferGoods<typeof arrSchema>;

    assertEqual<InferSchema, [string, ...number[], string]>(true);
  });

  it("DX: should allow spread tuples", () => {
    const arrSchema = [
      //
      string,
      spread_NOT_IMPLEMENTED(array(number)),
      string,
    ] as const;

    // eslint-disable-next-line no-unused-vars -- type-test scaffolding
    type InferSchema = typeof arrSchema;

    const schema = tuple([
      //
      string,
      spread_NOT_IMPLEMENTED(array(number)),
      string,
    ]);

    type InferredGood = InferGood<typeof schema>;

    assertEqual<InferredGood, [string, ...number[], string]>(true);
  });

  it("ISSUE: Typescript does not allow multiple rest operators in a tuple", () => {
    const schema = tuple([
      //
      string,
      spread_NOT_IMPLEMENTED(array(number)),

      nil,

      spread_NOT_IMPLEMENTED(smallSchema),
    ]);

    type InferredGood = InferGood<typeof schema>;

    // @ts-expect-error TypeScript does not allow multiple rest elements in one tuple.
    assertEqual<InferredGood, [string, ...number[], null, ...[undefined, ...string[], number]]>(
      true,
    );

    // INFO & TODO: The actual type is `[string, ...(string | number | null | undefined)[], number]`
    //  but it's not possible to type it like this. Needs more docs
  });

  it.skip("UNIT: should actually validate at runtime", () => {
    const smallSchema = tuple([
      //
      undef,
      spread_NOT_IMPLEMENTED(array(string)),
      number,
    ]);

    const value = smallSchema([undefined, "adf", "aaa", 3]);

    const expected: InferGood<typeof smallSchema> = [undefined, "adf", "aaa", 3];

    expect(value).toStrictEqual(good(expected));
  });
});
