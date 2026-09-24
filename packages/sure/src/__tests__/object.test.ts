import type { Issue } from "../index.ts";
/* eslint-disable no-unused-vars -- type-test scaffolding */
import { describe, it, expect } from "vite-plus/test";
import {
  object,
  bad,
  fail,
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
  firstName: pure((value) => (typeof value === "string" ? good(value) : fail("not string (sure)"))),

  // with inner pure
  middleName: pure((value) =>
    typeof value === "string" ? good(value) : fail("not string (pure)"),
  ),

  // with inner raw
  lastName: (value: unknown) =>
    typeof value === "string"
      ? ([true, value] as const)
      : ([false, [{ path: [], error: "not string (raw)" }]] as const),

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
  readonly Issue<
    | "not number"
    | "not string (sure)"
    | "not string (pure)"
    | "not string (raw)"
    | "not string"
    | "not object"
  >[]
>(true);

assertEqual<InferredInput, unknown>(true);

assertEqual<
  InferredMeta,
  MetaObj<{
    type: "object";
    schema: {
      age: typeof number;
      firstName: Sure<readonly Issue<"not string (sure)">[], string, unknown, MetaNever>;
      middleName: Sure<readonly Issue<"not string (pure)">[], string, unknown, MetaNever>;
      lastName: (
        value: unknown,
      ) =>
        | readonly [true, string]
        | readonly [
            false,
            readonly [{ readonly path: readonly []; readonly error: "not string (raw)" }],
          ];
      address: Sure<
        readonly Issue<"not string" | "not object">[],
        { country: string },
        unknown,
        MetaObj<{ type: "object"; schema: { country: typeof string } }>
      >;
    };
  }>
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
        { path: ["firstName"], error: "not string (sure)" },
        { path: ["middleName"], error: "not string (pure)" },
        { path: ["lastName"], error: "not string (raw)" },
        { path: ["address", "country"], error: "not string" },
      ],
    ]);

    expect(value).toEqual(
      bad([
        { path: ["firstName"], error: "not string (sure)" },
        { path: ["middleName"], error: "not string (pure)" },
        { path: ["lastName"], error: "not string (raw)" },
        { path: ["address", "country"], error: "not string" },
      ]),
    );
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
        .toStrictEqual([false, [{ path: ["age"], error: "not number" }]]);

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
        // TODO: The error seems meh
        .toStrictEqual([false, [{ path: ["age"], error: "not literal undefined (undefined)" }]]);

      expect(schema({ name: "John" })) //
        .toStrictEqual([true, { name: "John" }]);
    });
  });
});
