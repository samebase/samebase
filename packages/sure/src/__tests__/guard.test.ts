import { describe, expect, it } from "vite-plus/test";
import { bad, good, guard, object, pure, string } from "../index.ts";
import { assertIs } from "./typeTestUtils.ts";

const sureNumber = pure((value) =>
  typeof value === "number" //
    ? good(value)
    : bad("not a number" as const),
);

describe("guard", () => {
  it("derives a predicate whose target is inferred from the schema", () => {
    const isNumber = guard(sureNumber);

    const value: unknown = 42;
    expect(isNumber(value)).toBe(true);
    if (isNumber(value)) {
      assertIs<number>(value);
    }

    expect(isNumber("nope")).toBe(false);
  });

  it("follows the schema when it evolves, with no hand-written target to go stale", () => {
    const vault = object({
      id: string,
      branch: string,
    });

    const isVault = guard(vault);

    const candidate: unknown = { id: "v1", branch: "main" };
    expect(isVault(candidate)).toBe(true);
    if (isVault(candidate)) {
      // The narrowed type comes from the schema itself: adding a field to
      // `vault` above changes this type and every use site with it.
      assertIs<{ id: string; branch: string }>(candidate);
      expect(candidate.branch).toBe("main");
    }

    expect(isVault({ id: "v1" })).toBe(false);
    expect(isVault(null)).toBe(false);
  });
});
