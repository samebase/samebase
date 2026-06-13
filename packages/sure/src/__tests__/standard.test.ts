import { describe, it, expect } from "vite-plus/test";
import {
  after,
  array,
  bad,
  good,
  literal,
  number,
  object,
  optional,
  pure,
  standard,
  string,
  toStandardIssues,
  tuple,
  union,
  SURE_VENDOR,
} from "../index.ts";
import type { StandardSchemaV1 } from "../index.ts";
import { assertEqual, assertIs } from "./typeTestUtils.ts";

/**
 * The generic consumer from the Standard Schema README — what any third-party
 * library (tRPC, TanStack Form, AI SDK, ...) does with a schema it accepts.
 */
async function standardValidate<T extends StandardSchemaV1>(
  schema: T,
  input: StandardSchemaV1.InferInput<T>,
): Promise<StandardSchemaV1.InferOutput<T>> {
  let result = schema["~standard"].validate(input);
  if (result instanceof Promise) result = await result;

  if (result.issues) {
    throw new Error(JSON.stringify(result.issues, null, 2));
  }

  return result.value;
}

const userSchema = standard(
  object({
    name: string,
    age: number,
    address: object({
      city: string,
    }),
    tags: array(string),
  }),
);

describe("standard schema props", () => {
  it("exposes version 1 and the vendor", () => {
    expect(userSchema["~standard"].version).toBe(1);
    expect(userSchema["~standard"].vendor).toBe(SURE_VENDOR);
    expect(typeof userSchema["~standard"].validate).toBe("function");
  });

  it("keeps the schema usable as a plain sure function", () => {
    const schema = standard(object({ name: string }));

    const [isGood, unsure] = schema({ name: "a" });

    expect(isGood).toBe(true);
    expect(unsure).toEqual({ name: "a" });

    // meta survives too
    expect(schema.meta.type).toBe("object");
  });

  it("is idempotent and returns the same function", () => {
    const base = object({ name: string });
    const once = standard(base);
    const twice = standard(once);

    expect(twice).toBe(base);
    expect(twice["~standard"].version).toBe(1);
  });
});

describe("standard validate: success", () => {
  it("returns { value } with no issues", () => {
    const result = userSchema["~standard"].validate({
      name: "Ada",
      age: 36,
      address: { city: "London" },
      tags: ["math"],
    });

    expect(result).toEqual({
      value: {
        name: "Ada",
        age: 36,
        address: { city: "London" },
        tags: ["math"],
      },
    });

    // The spec discriminates on `issues` being falsy (sure validates synchronously).
    if (!result.issues) {
      expect(result.value).toBeDefined();
    }
  });

  it("treats missing optional properties as success", () => {
    const schema = standard(object({ name: string, nickname: optional(string) }));

    expect(schema["~standard"].validate({ name: "a" })).toEqual({
      value: { name: "a" },
    });
  });
});

describe("standard validate: failure issues", () => {
  it("reports a primitive failure as a single root issue", () => {
    const result = standard(string)["~standard"].validate(1);

    expect(result).toEqual({
      issues: [{ message: "not string" }],
    });
  });

  it("reports object property failures with paths", () => {
    const result = userSchema["~standard"].validate({
      name: 1,
      age: "x",
      address: { city: "London" },
      tags: [],
    });

    expect(result).toEqual({
      issues: [
        { message: "not string", path: ["name"] },
        { message: "not number", path: ["age"] },
      ],
    });
  });

  it("reports nested object failures with deep paths", () => {
    const result = userSchema["~standard"].validate({
      name: "Ada",
      age: 36,
      address: { city: 7 },
      tags: [],
    });

    expect(result).toEqual({
      issues: [{ message: "not string", path: ["address", "city"] }],
    });
  });

  it("reports array element failures with index paths", () => {
    const result = userSchema["~standard"].validate({
      name: "Ada",
      age: 36,
      address: { city: "London" },
      tags: ["ok", 1, "fine", 2],
    });

    expect(result).toEqual({
      issues: [
        { message: "not string", path: ["tags", 1] },
        { message: "not string", path: ["tags", 3] },
      ],
    });
  });

  it("reports tuple element failures with index paths", () => {
    const schema = standard(tuple([string, number]));

    const result = schema["~standard"].validate([1, "x"]);

    expect(result).toEqual({
      issues: [
        { message: "not string", path: [0] },
        { message: "not number", path: [1] },
      ],
    });
  });

  it("reports self-describing type mismatches", () => {
    expect(standard(object({ name: string }))["~standard"].validate(42)).toEqual({
      issues: [{ message: "not object" }],
    });

    // ... with the path preserved on nested schemas.
    const nested = standard(object({ a: object({ b: string }) }));
    expect(nested["~standard"].validate({ a: 5 })).toEqual({
      issues: [{ message: "not object", path: ["a"] }],
    });

    expect(standard(array(string))["~standard"].validate("nope")).toEqual({
      issues: [{ message: "not array" }],
    });

    expect(standard(tuple([string, number]))["~standard"].validate("nope")).toEqual({
      issues: [{ message: "not array" }],
    });
  });

  it("reports union failures with the second branch's bad", () => {
    const schema = standard(union(string, number));

    expect(schema["~standard"].validate(true)).toEqual({
      issues: [{ message: "not number" }],
    });
  });

  it("reports literal and refinement (after) failures", () => {
    expect(standard(literal("on"))["~standard"].validate("off")).toEqual({
      issues: [{ message: "not literal string (on)" }],
    });

    const nonEmpty = after(
      string,
      pure((value: string) => (value.length > 0 ? good(value) : bad("empty string" as const))),
    );

    expect(standard(nonEmpty)["~standard"].validate("")).toEqual({
      issues: [{ message: "empty string" }],
    });
  });

  it("stringifies non-string custom bads", () => {
    const status = pure((value) => (value === "ok" ? good(value) : bad(404 as const)));

    expect(standard(status)["~standard"].validate("nope")).toEqual({
      issues: [{ message: "404" }],
    });
  });

  it("never returns an empty issues array", () => {
    // A failure with zero extractable messages must still fail downstream.
    const weird = pure((value) => (value === "ok" ? good(value) : bad(undefined)));

    const result = standard(weird)["~standard"].validate("nope");

    expect(result).toEqual({ issues: [{ message: "Invalid value" }] });
  });

  it("attributes bad(undefined) object properties to their key", () => {
    // object() marks failures by key presence, so a present key holding
    // undefined is a failed property — not an array-style hole.
    const weird = pure((value) => (value === "ok" ? good(value) : bad(undefined)));
    const schema = standard(object({ a: weird, b: string }));

    expect(schema["~standard"].validate({ a: "no", b: 5 })).toEqual({
      issues: [
        { message: "Invalid value", path: ["a"] },
        { message: "not string", path: ["b"] },
      ],
    });
  });

  it("uses Error#message for Error bads", () => {
    const erroring = pure((value) =>
      value === "ok" ? good(value) : bad(new Error("boom")),
    );

    expect(standard(erroring)["~standard"].validate("nope")).toEqual({
      issues: [{ message: "boom" }],
    });
  });

  it("returns a failure instead of throwing for out-of-domain input", () => {
    // Schemas with a narrowed input type may throw when validate hands them
    // the raw unknown value — the spec requires a Result either way.
    const trimmed = pure((value: string) => good(value.trim()));

    const result = standard(trimmed)["~standard"].validate(5);

    expect(result.issues).toBeDefined();
    expect(result.issues).toHaveLength(1);
  });

  it("survives cyclic bad values", () => {
    const cyclic: Record<string, unknown> = { reason: "broken" };
    cyclic["self"] = cyclic;

    const schema = pure((value) => (value === "ok" ? good(value) : bad(cyclic)));

    expect(standard(schema)["~standard"].validate("nope")).toEqual({
      issues: [
        { message: "broken", path: ["reason"] },
        // The revisited container is reported once instead of recursing forever.
        { message: "Invalid value", path: ["self"] },
      ],
    });
  });

  it("validates synchronously without a Promise guard", () => {
    // SureStandardProps narrows validate's declared return to the sync Result,
    // so direct callers can discriminate immediately.
    const result = standard(string)["~standard"].validate("hi");

    if (!result.issues) {
      assertIs<string>(result.value);
      expect(result.value).toBe("hi");
    }
  });
});

describe("toStandardIssues", () => {
  it("flattens nested bads into paths", () => {
    expect(
      toStandardIssues({
        a: "broken",
        b: { c: "also broken" },
        d: [undefined, "elem broken"],
      }),
    ).toEqual([
      { message: "broken", path: ["a"] },
      { message: "also broken", path: ["b", "c"] },
      { message: "elem broken", path: ["d", 1] },
    ]);
  });

  it("treats undefined as 'no issue' but never returns zero issues overall", () => {
    expect(toStandardIssues(undefined)).toEqual([{ message: "Invalid value" }]);
    expect(toStandardIssues([undefined, undefined])).toEqual([{ message: "Invalid value" }]);
  });
});

describe("standard schema consumer integration", () => {
  it("works with the spec README's generic standardValidate", async () => {
    const value = await standardValidate(userSchema, {
      name: "Ada",
      age: 36,
      address: { city: "London" },
      tags: ["math"],
    });

    expect(value.name).toBe("Ada");

    // Output type flows through the generic consumer.
    assertIs<{
      name: string;
      age: number;
      address: { city: string };
      tags: string[];
    }>(value);

    await expect(standardValidate(userSchema, { bogus: true })).rejects.toThrow("not string");
  });

  it("is assignable to the bare StandardSchemaV1 interface", () => {
    const schema: StandardSchemaV1 = userSchema;
    const outputTyped: StandardSchemaV1<unknown, { name: string }> = standard(
      object({ name: string }),
    );

    expect(schema["~standard"].vendor).toBe(SURE_VENDOR);
    expect(outputTyped["~standard"].version).toBe(1);
  });

  it("infers input and output types through the spec's inference helpers", () => {
    type Output = StandardSchemaV1.InferOutput<typeof userSchema>;
    type Input = StandardSchemaV1.InferInput<typeof userSchema>;

    assertEqual<Output["name"], string>(true);
    assertEqual<Output["age"], number>(true);
    assertEqual<Output["address"], { city: string }>(true);
    assertEqual<Output["tags"], string[]>(true);
    assertEqual<Input, unknown>(true);
  });
});
