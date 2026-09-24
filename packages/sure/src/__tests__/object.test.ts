/* eslint-disable no-unused-vars -- type-test scaffolding */
import { describe, it, expect } from "vite-plus/test";
import {
  object,
  bad,
  number,
  string,
  good,
  pure,
  sure,
  optional,
  union,
  literal,
  is,
  or,
} from "../index.ts";
import type {
  InferBad,
  InferGood,
  InferInput,
  InferMeta,
  InferSchemaGood,
  Issues,
  MetaNever,
  MetaObj,
  Sure,
} from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";
import { Prettify, PrettifyRec } from "../utils.ts";
import { ExtractPrimitives, InferJustMeta } from "../meta_wip.ts";

const someObj = object({
  age: number,

  // with inner sure
  firstName: pure((value) =>
    typeof value === "string" ? good(value) : bad([{ message: "not string (sure)" }]),
  ),

  // with inner pure
  middleName: pure((value) =>
    typeof value === "string" ? good(value) : bad([{ message: "not string (pure)" }]),
  ),

  // with inner raw
  lastName: (value: unknown) =>
    typeof value === "string"
      ? ([true, value] as const)
      : ([false, [{ message: "not string (raw)" }]] as const),

  address: object({
    country: string,
  }),
});

// TypeChecks
type InferredGood = InferGood<typeof someObj>;
type InferredBad = InferBad<typeof someObj>;
type InferredInput = InferInput<typeof someObj>;
type InferredMeta = InferMeta<typeof someObj>;

assertEqual<
  InferredGood,
  {
    age: number;
    firstName: string;
    middleName: string;
    lastName: string;
    address: {
      country: string;
    };
  }
>(true);

assertEqual<
  InferredBad,
  Issues<
    | "not object"
    | "not number"
    | "not string (sure)"
    | "not string (pure)"
    | "not string (raw)"
    | "not string"
  >
>(true);

assertEqual<InferredInput, unknown>(true);

assertEqual<
  InferredMeta,
  {
    meta: {
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
        firstName: Sure<Issues<"not string (sure)">, string, unknown, MetaNever>;
        middleName: Sure<Issues<"not string (pure)">, string, unknown, MetaNever>;
        lastName: (
          value: unknown,
        ) =>
          | readonly [true, string]
          | readonly [false, readonly [{ readonly message: "not string (raw)" }]];
        address: Sure<
          Issues<"not object" | "not string">,
          {
            country: string;
          },
          unknown,
          MetaObj<{
            type: "object";
            schema: {
              country: Sure<
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
      };
    };
  }
>(true);

assertEqual<typeof someObj, Sure<InferredBad, InferredGood, InferredInput, InferredMeta>>(true);

describe("object", () => {
  it("should return good value", () => {
    const value = someObj({
      age: 12,
      address: {
        country: "USA",
      },
      firstName: "John",
      lastName: "Doe",
      middleName: "D.",
    });

    expect(value).toEqual([
      true,
      {
        age: 12,
        address: {
          country: "USA",
        },
        firstName: "John",
        lastName: "Doe",
        middleName: "D.",
      },
    ]);
  });

  it("should return bad value", () => {
    const value = someObj({
      age: 12,
      address: {
        country: 123,
      },
    });

    expect(value).toEqual([
      false,
      [
        { message: "not string (sure)", path: ["firstName"] },
        { message: "not string (pure)", path: ["middleName"] },
        { message: "not string (raw)", path: ["lastName"] },
        { message: "not string", path: ["address", "country"] },
      ],
    ]);

    expect(value).toEqual(
      bad([
        { message: "not string (sure)", path: ["firstName"] },
        { message: "not string (pure)", path: ["middleName"] },
        { message: "not string (raw)", path: ["lastName"] },
        { message: "not string", path: ["address", "country"] },
      ]),
    );
  });

  it("should return a bad value for non objects", () => {
    expect(someObj("John")).toStrictEqual([false, [{ message: "not object" }]]);
    expect(someObj(null)).toStrictEqual([false, [{ message: "not object" }]]);
  });

  describe("optionals", () => {
    it("should support optional properties", () => {
      const schema = object({
        name: string,
        age: optional(number),
      });

      // Ok when age is number
      expect(schema({ name: "John", age: 12 })) //
        .toStrictEqual([true, { name: "John", age: 12 }]);

      // Not allow when age is undefined
      expect(schema({ name: "John", age: undefined })) //
        .toStrictEqual([false, [{ message: "not number", path: ["age"] }]]);

      // Allow when age is not present !!
      expect(schema({ name: "John" })) //
        .toStrictEqual([true, { name: "John" }]);
    });

    it("should combine with undefined and/or null", () => {
      const schema = object({
        name: string,
        age: optional(or(number, is(undefined))),
      });

      expect(schema({ name: "John", age: 12 })) //
        .toStrictEqual([true, { name: "John", age: 12 }]);

      expect(schema({ name: "John", age: undefined })) //
        .toStrictEqual([true, { name: "John", age: undefined }]);

      expect(schema({ name: "John", age: null })) //
        .toStrictEqual([
          false,
          [
            { message: "not number", path: ["age"] },
            { message: "not literal undefined (undefined)", path: ["age"] },
          ],
        ]);

      expect(schema({ name: "John" })) //
        .toStrictEqual([true, { name: "John" }]);
    });
  });
});
