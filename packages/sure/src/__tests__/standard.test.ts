import { describe, expect, it } from "vite-plus/test";
import type { StandardSchemaV1 as OfficialStandardSchemaV1 } from "@standard-schema/spec";
import { array, bad, good, number, object, pure, standard, string, tuple } from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

const personSchema = standard(
  object({
    age: number,
    address: object({
      country: string,
    }),
  }),
);

const officialSchema: OfficialStandardSchemaV1<
  unknown,
  {
    age: number;
    address: {
      country: string;
    };
  }
> = personSchema;

assertEqual<OfficialStandardSchemaV1.InferInput<typeof personSchema>, unknown>(true);
assertEqual<
  OfficialStandardSchemaV1.InferOutput<typeof personSchema>,
  {
    age: number;
    address: {
      country: string;
    };
  }
>(true);

const stringInputSchema = pure((value: string) =>
  value.length > 0 ? good(value) : bad("empty string" as const),
);

// @ts-expect-error Standard Schema validate receives unknown, so adapters must start from unknown-input schemas.
standard(stringInputSchema);

describe("standard", () => {
  it("keeps the schema callable", () => {
    expect(standard(string)("ok")).toStrictEqual(good("ok"));
  });

  it("returns a Standard Schema success result", () => {
    expect(standard(string)["~standard"].validate("ok")).toStrictEqual({ value: "ok" });
  });

  it("returns a primitive failure as an issue", () => {
    expect(standard(string)["~standard"].validate(1)).toStrictEqual({
      issues: [{ message: "not string" }],
    });
  });

  it("returns object failure paths", () => {
    expect(
      officialSchema["~standard"].validate({
        age: "12",
        address: {
          country: 123,
        },
      }),
    ).toStrictEqual({
      issues: [
        { message: "not number", path: ["age"] },
        { message: "not string", path: ["address", "country"] },
      ],
    });
  });

  it("returns root object failures without a path", () => {
    expect(standard(object({ name: string }))["~standard"].validate("not object")).toStrictEqual({
      issues: [{ message: "not object" }],
    });
  });

  it("returns array failure paths", () => {
    expect(standard(array(number))["~standard"].validate([1, "two", 3])).toStrictEqual({
      issues: [{ message: "not number", path: [1] }],
    });
  });

  it("returns root array failures without a path", () => {
    expect(standard(array(number))["~standard"].validate("not array")).toStrictEqual({
      issues: [{ message: "not array" }],
    });
  });

  it("returns tuple failure paths", () => {
    expect(standard(tuple([number, string]))["~standard"].validate([1, 2])).toStrictEqual({
      issues: [{ message: "not string", path: [1] }],
    });
  });

  it("returns root tuple failures without a path", () => {
    expect(standard(tuple([number, string]))["~standard"].validate("not tuple")).toStrictEqual({
      issues: [{ message: "not tuple" }],
    });
  });
});
