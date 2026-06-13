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
  Sure,
  StandardSure,
  MetaObj,
  MetaNever,
  Good,
  Bad,
  TupleInferGoods,
  TupleInferBads,
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
  assertEqual<
    InferredBad,
    | "not array"
    | ["not number" | undefined, "not string" | undefined, "not boolean" | undefined]
  >(true);
  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [
          StandardSure<
            "not number",
            number,
            unknown,
            MetaObj<{
              type: "number";
            }>
          >,
          StandardSure<
            "not string",
            string,
            unknown,
            MetaObj<{
              type: "string";
            }>
          >,
          StandardSure<"not boolean", boolean, unknown, MetaNever>,
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
  assertEqual<
    InferredBad,
    // The spread element's bad is now a union ("not array" | element bads), and
    // TupleInferBads distributes over it: the array member still spreads, the
    // "not array" member stays as a single middle element.
    | "not array"
    | ["not string" | undefined, "not array" | undefined, "not string" | undefined]
    | ["not string" | undefined, ...("not number" | undefined)[], "not string" | undefined]
  >(true);

  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [
          typeof string,
          Sure<
            "not array" | ("not number" | undefined)[],
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
              schema: StandardSure<
                "not array" | ("not number" | undefined)[],
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
    // Same distribution as above.
    | "not array"
    | ["not undefined" | undefined, "not array" | undefined, "not number" | undefined]
    | ["not undefined" | undefined, ...("not string" | undefined)[], "not number" | undefined]
  >(true);

  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [
          StandardSure<"not undefined", undefined, unknown, MetaNever>,
          Sure<
            "not array" | ("not string" | undefined)[],
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
              schema: StandardSure<
                "not array" | ("not string" | undefined)[],
                string[],
                unknown,
                MetaObj<{
                  type: "array";
                  schema: StandardSure<
                    "not string",
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
          StandardSure<
            "not number",
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

    const expected: InferBad<typeof someTuple> = [undefined, undefined, "not boolean"];

    expect(value).toStrictEqual(bad(expected));
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
