import { describe, expect, it } from "vite-plus/test";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterTemplateManifest", () => {
  it("seeds the workflows that deploy and destroy the app", () => {
    expect(Object.keys(starterTemplateManifest.files)).toEqual(
      expect.arrayContaining([".github/workflows/alchemy.yml", ".github/workflows/destroy.yml"]),
    );
  });
});
