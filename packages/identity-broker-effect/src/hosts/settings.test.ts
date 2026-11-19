import { Schema } from "effect";
import { describe, expect, test } from "vite-plus/test";
import type { Registration } from "../core/policy.ts";
import { AllowedRepositories, allowListPolicy } from "./settings.ts";

const registration = (repositoryId: string, ownerId: string): Registration => ({
  repositoryId,
  repository: "samebase/samebase",
  ownerId,
  app: "web",
  deploymentType: "production",
  redirectUris: ["https://samebase.com/callback"],
  proof: "github-actions",
});

describe("allow-list policy", () => {
  const policy = allowListPolicy(
    Schema.decodeUnknownSync(AllowedRepositories)(
      '[{"repositoryId":"1021726325","ownerId":"285392744"}]',
    ),
  );

  test("a listed repository with its owner gets both connectors", () => {
    expect(policy(registration("1021726325", "285392744"))).toEqual({
      connectors: ["google", "github"],
      resources: [],
      paused: false,
    });
  });

  test("the listed repository under another owner gets none", () => {
    expect(policy(registration("1021726325", "1")).connectors).toEqual([]);
  });

  test("another repository of the listed owner gets none", () => {
    expect(policy(registration("2", "285392744")).connectors).toEqual([]);
  });

  test("a malformed list fails the decode", () => {
    expect(() =>
      Schema.decodeUnknownSync(AllowedRepositories)('[{"repositoryId":1021726325}]'),
    ).toThrow();
  });
});
