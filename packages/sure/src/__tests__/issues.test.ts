import { describe, it, expect } from "vite-plus/test";
import {
  array,
  bad,
  boolean,
  literal,
  nil,
  number,
  object,
  optional,
  string,
  tuple,
  undef,
  under,
  unknown,
} from "../index.ts";
import type { Bad, InferMessage, Issues } from "../index.ts";
import { assertEqual } from "./typeTestUtils.ts";

describe("issues", () => {
  it("bad keeps the messages of issues literal", () => {
    const value = bad([{ message: "too short" }, { message: "too long", path: ["name"] }]);

    assertEqual<typeof value, Bad<Issues<"too short" | "too long">>>(true);

    expect(value).toStrictEqual([
      false,
      [{ message: "too short" }, { message: "too long", path: ["name"] }],
    ]);
  });

  it("bad stays generic for other values", () => {
    const value = bad({ type: "TimeoutError" });

    assertEqual<typeof value, Bad<{ type: string }>>(true);
  });

  it("under puts issues under a key", () => {
    const issues = under("address", [
      { message: "not string", path: ["country"] },
      { message: "not object" },
    ]);

    assertEqual<typeof issues, Issues<"not string" | "not object">>(true);

    expect(issues).toStrictEqual([
      { message: "not string", path: ["address", "country"] },
      { message: "not object", path: ["address"] },
    ]);
  });

  it("primitives report one issue about the value itself", () => {
    expect(string(1)).toStrictEqual([false, [{ message: "not string" }]]);
    expect(number("1")).toStrictEqual([false, [{ message: "not number" }]]);
    expect(boolean(1)).toStrictEqual([false, [{ message: "not boolean" }]]);
    expect(undef(null)).toStrictEqual([false, [{ message: "not undefined" }]]);
    expect(nil(undefined)).toStrictEqual([false, [{ message: "not null" }]]);
    expect(literal("a")("b")).toStrictEqual([false, [{ message: "not literal string (a)" }]]);
  });

  it("validators that are never bad add no messages", () => {
    const schema = object({ anything: optional(unknown) });

    assertEqual<InferMessage<typeof schema>, "not object">(true);

    expect(schema({ anything: 1 })).toStrictEqual([true, { anything: 1 }]);
  });

  it("collections report every issue with its path", () => {
    const schema = object({
      name: string,
      tags: array(string),
      point: tuple([number, number]),
    });

    assertEqual<
      InferMessage<typeof schema>,
      "not object" | "not string" | "not array" | "not tuple" | "not number"
    >(true);

    expect(schema({ tags: ["a", 1], point: [0, "1"] })).toStrictEqual([
      false,
      [
        { message: "not string", path: ["name"] },
        { message: "not string", path: ["tags", 1] },
        { message: "not number", path: ["point", 1] },
      ],
    ]);
  });
});
