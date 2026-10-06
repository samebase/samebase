import { describe, expect, it } from "vite-plus/test";

import { alchemyStage } from "./alchemy-stage.ts";

const stageOf = (branch: string) => alchemyStage({ branch, defaultBranch: "main" });

describe("alchemyStage", () => {
  it("deploys the default branch as prod", () => {
    expect(stageOf("main")).toBe("prod");
    expect(alchemyStage({ branch: "trunk", defaultBranch: "trunk" })).toBe("prod");
  });

  it("keeps a branch that is already a safe stage", () => {
    expect(stageOf("feature-foo-bar")).toBe("feature-foo-bar");
    expect(stageOf("123-fix")).toBe("123-fix");
  });

  it("adds a hash of the branch when the safe form differs from the branch", () => {
    expect(stageOf("feature/Foo_bar")).toBe("feature-foo-bar-c86457");
    expect(stageOf("Feature-Foo-Bar")).toBe("feature-foo-bar-95bf29");
    expect(stageOf("PROD")).toBe("prod-e3c834");
  });

  it("refuses a branch whose stage would be prod or empty", () => {
    expect(() => stageOf("prod")).toThrow("Rename the branch");
    expect(() => stageOf("///")).toThrow("has no letter or digit");
  });

  it("always gives a stage that Alchemy accepts", () => {
    for (const branch of [
      "a",
      "-a-",
      "a//b",
      "Ü-mlaut",
      "dependabot/npm_and_yarn/types/node-26.1.1",
    ]) {
      expect(stageOf(branch)).toMatch(/^[a-z0-9]+([-_a-z0-9]+)*$/);
    }
  });
});
