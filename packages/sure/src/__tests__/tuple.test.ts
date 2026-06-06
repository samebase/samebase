import { describe, it, expect } from "vite-plus/test";
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
  MetaObj,
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
  assertEqual<
    InferredBad,
    ["not number" | undefined, "not string" | undefined, "not boolean" | undefined]
  >(true);
  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [
          Sure<
            "not number",
            number,
            unknown,
            MetaObj<{
              type: "number";
            }>
          >,
          Sure<
            "not string",
            string,
            unknown,
            MetaObj<{
              type: "string";
            }>
          >,
          (x: unknown) => Good<boolean> | Bad<"not boolean">,
        ];
      };
    }
  >(true);
}

const numberArray = array(number);
const spreadNumberArray = spread_NOT_IMPLEMENTED(numberArray);

const myTuple = tuple([
  //
  string,
  spreadNumberArray,
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
    [
      //
      "not string" | undefined,
      ...("not number" | undefined)[],
      "not string" | undefined,
    ]
  >(true);

  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [typeof string, typeof spreadNumberArray, typeof string];
      };
    }
  >(true);
}

const stringArray = array(string);
const spreadStringArray = spread_NOT_IMPLEMENTED(stringArray);

const smallSchema = tuple([
  //
  undef,
  spreadStringArray,
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
    [
      //
      "not undefined" | undefined,
      ...("not string" | undefined)[],
      "not number" | undefined,
    ]
  >(true);

  assertEqual<
    InferredMeta,
    {
      meta: {
        type: "tuple";
        schema: [
          (value: unknown) => Good<undefined> | Bad<"not undefined">,
          typeof spreadStringArray,
          Sure<
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
