import { describe, expect, it } from "vite-plus/test";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterTemplateManifest", () => {
  it("is the Alchemy starter, with the fixed provider", () => {
    const filePaths = Object.keys(starterTemplateManifest.files);

    expect(starterTemplateManifest.version).toBe(
      `samebase-base-${starterTemplateManifest.contentHash.slice(0, 12)}`,
    );
    expect(starterTemplateManifest.sourceRepository).toBe("https://github.com/samebase/base.git");
    expect(starterTemplateManifest.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(starterTemplateManifest.commitMessage).toBe(
      "Initialize app from Samebase starter build v2210",
    );
    expect(filePaths).toEqual(
      expect.arrayContaining([
        ".github/workflows/alchemy.yml",
        ".github/workflows/destroy.yml",
        "alchemy.run.ts",
        "scripts/ensure-convex-auth.ts",
      ]),
    );
    expect(filePaths).not.toContain("wrangler.jsonc");
    expect(starterTemplateManifest.files["package.json"]).toContain(
      '"@samebase/alchemy-convex": "0.33.0"',
    );
  });
});
