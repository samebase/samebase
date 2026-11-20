import { Schema } from "effect";
import { expect, test } from "vite-plus/test";
import { AllowedRepositories } from "./settings.ts";

test("the allow-list decodes from its JSON text, and a malformed list fails the decode", () => {
  expect(
    Schema.decodeUnknownSync(AllowedRepositories)(
      '[{"repositoryId":"1021726325","ownerId":"285392744"}]',
    ),
  ).toEqual([{ repositoryId: "1021726325", ownerId: "285392744" }]);
  expect(() =>
    Schema.decodeUnknownSync(AllowedRepositories)('[{"repositoryId":1021726325}]'),
  ).toThrow();
});
