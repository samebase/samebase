import type { Issue } from "../index.ts";
import { describe, expect, it } from "vite-plus/test";
import {
  InferBad,
  InferGood,
  InferInput,
  InferMeta,
  MetaObj,
  Sure,
  number,
  object,
  optional,
  or,
  string,
  undef,
} from "../index.ts";

import { assertEqual } from "./typeTestUtils.ts";

const optionalObj = object({
  name: string,
  // There's a difference, see `exactOptionalPropertyTypes`
  age: optional(number),

  lastName: optional(or(string, undef)),
});

// TypeChecks
type InferredGood = InferGood<typeof optionalObj>;
type InferredBad = InferBad<typeof optionalObj>;
type InferredInput = InferInput<typeof optionalObj>;
type InferredMeta = InferMeta<typeof optionalObj>;

assertEqual<
  InferredGood,
  {
    name: string;
    age?: number;
    lastName?: string | undefined;
  }
>(true);

assertEqual<
  InferredBad,
  readonly Issue<"not string" | "not number" | "not undefined" | "not object">[]
>(true);

assertEqual<InferredInput, unknown>(true);

assertEqual<
  InferredMeta,
  MetaObj<{
    type: "object";
    schema: {
      name: typeof string;
      age: Sure<
        InferBad<typeof number>,
        number,
        unknown,
        MetaObj<{ type: "optional"; schema: typeof number }>
      >;
      lastName: Sure<
        InferBad<typeof string> | InferBad<typeof undef>,
        string | undefined,
        unknown,
        MetaObj<{
          type: "optional";
          schema: Sure<
            InferBad<typeof string> | InferBad<typeof undef>,
            string | undefined,
            unknown,
            MetaObj<{ type: "union"; first: typeof string; second: typeof undef }>
          >;
        }>
      >;
    };
  }>
>(true);

assertEqual<
  typeof optionalObj,
  Sure<
    //
    InferredBad,
    InferredGood,
    InferredInput,
    InferredMeta
  >
>(true);

describe("optional", () => {
  it("good: age is number", () => {
    // Ok when age is number
    expect(
      optionalObj({
        name: "John",
        age: 12,
        lastName: "Doe",
      }),
    ) //
      .toStrictEqual([true, { name: "John", age: 12, lastName: "Doe" }]);
  });

  it("good: age is not present", () => {
    // Ok when age is not present
    expect(
      optionalObj({
        name: "John",
        lastName: "Doe",
      }),
    ) //
      .toStrictEqual([true, { name: "John", lastName: "Doe" }]);
  });

  it("bad: age is undefined", () => {
    // Not ok when age is undefined
    expect(
      optionalObj({
        name: "John",
        age: undefined,
        lastName: "Doe",
      }),
    ) //
      .toStrictEqual([false, [{ path: ["age"], error: "not number" }]]);
  });

  it("bad: age is string", () => {
    expect(
      optionalObj({
        name: "John",
        age: "12",
        lastName: "Doe",
      }),
    ) //
      .toStrictEqual([false, [{ path: ["age"], error: "not number" }]]);
  });

  it("ok: lastName is not present", () => {
    expect(
      optionalObj({
        name: "John",
        age: 12,
      }),
    ) //
      .toStrictEqual([
        true,
        {
          name: "John",
          age: 12,
        },
      ]);
  });

  it("ok: lastName is undefined", () => {
    expect(
      optionalObj({
        name: "John",
        age: 12,
        lastName: undefined,
      }),
    ) //
      .toStrictEqual([
        true,
        {
          name: "John",
          age: 12,
          lastName: undefined,
        },
      ]);
  });
});
