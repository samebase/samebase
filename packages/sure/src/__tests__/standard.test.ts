import { describe, it, expect } from "vite-plus/test";
import { after, bad, good, number, object, pure, standard, string } from "../index.ts";
import type { InferGood, StandardSchema } from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

const user = object({
  name: string,
  age: number,
});

const standardUser = standard(user);

assertEqual<typeof standardUser, StandardSchema<InferGood<typeof user>>>(true);

// Only validators of `unknown` values
standard(
  // @ts-expect-error The input is a string
  pure((value: string) => (value.length > 0 ? good(value) : bad([{ message: "empty" }]))),
);

// Only validators that report issues
standard(
  // @ts-expect-error The bad value is a string
  pure((value) => (typeof value === "string" ? good(value) : bad("not string"))),
);

describe("standard", () => {
  it("has the Standard Schema properties", () => {
    expect(standardUser["~standard"].version).toBe(1);
    expect(standardUser["~standard"].vendor).toBe("sure");
  });

  it("returns the value when good", () => {
    expect(standardUser["~standard"].validate({ name: "John", age: 12 })).toStrictEqual({
      value: { name: "John", age: 12 },
    });
  });

  it("returns the issues when bad", () => {
    expect(standardUser["~standard"].validate({ name: 1 })).toStrictEqual({
      issues: [
        { message: "not string", path: ["name"] },
        { message: "not number", path: ["age"] },
      ],
    });
  });

  it("accepts composed validators", () => {
    const adult = standard(
      after(number, (age) => (age >= 18 ? good(age) : bad([{ message: "not adult" }]))),
    );

    expect(adult["~standard"].validate(12)).toStrictEqual({ issues: [{ message: "not adult" }] });
  });
});
