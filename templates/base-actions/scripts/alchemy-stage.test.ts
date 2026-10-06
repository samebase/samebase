import { describe, expect, it } from "vite-plus/test";

import { alchemyStage } from "./alchemy-stage.ts";

const stageOf = (branch: string) => alchemyStage({ branch, defaultBranch: "main" });

describe("alchemyStage", () => {
  it("deploys the default branch as prod", () => {
    expect(stageOf("main")).toBe("prod");
    expect(alchemyStage({ branch: "trunk", defaultBranch: "trunk" })).toBe("prod");
  });

  it("gives every other branch its safe form and a hash of the branch", () => {
    expect(stageOf("feature/Foo_bar")).toBe("feature-foo-bar-c86457");
    expect(stageOf("feature-foo-bar")).toBe("feature-foo-bar-8c7b58");
    expect(stageOf("feature-foo-bar-c86457")).toBe("feature-foo-bar-c86457-91387f");
    expect(stageOf("prod")).toBe("prod-6754af");
  });

  it("gives two branches two stages, even when one looks like a stage of the other", () => {
    const branches = [
      "feature/Foo_bar",
      "feature-foo-bar",
      "feature-foo-bar-c86457",
      "Feature-Foo-Bar",
    ];
    expect(new Set(branches.map(stageOf)).size).toBe(branches.length);
  });

  it("cuts the readable part to 40 characters without a trailing dash", () => {
    expect(stageOf(`${"a".repeat(39)}/long-branch`)).toMatch(/^a{39}-[0-9a-f]{6}$/);
  });

  it("refuses a branch without a letter or digit", () => {
    expect(() => stageOf("///")).toThrow("has no letter or digit");
  });

  it("always gives a preview stage that Alchemy accepts and that is not prod", () => {
    for (const branch of [
      "a",
      "-a-",
      "a//b",
      "Ü-mlaut",
      "prod",
      "PROD",
      "dependabot/npm_and_yarn/types/node-26.1.1",
    ]) {
      expect(stageOf(branch)).toMatch(/^[a-z0-9]+([-_a-z0-9]+)*$/);
      expect(stageOf(branch)).not.toBe("prod");
    }
  });
});
