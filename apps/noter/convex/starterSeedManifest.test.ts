import { describe, expect, it } from "vite-plus/test";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterSeedManifest", () => {
  it("contains a single template snapshot contract", () => {
    expect(starterTemplateManifest.version.length).toBeGreaterThan(0);
    expect(starterTemplateManifest.commitMessage).toBe(
      "chore: seed starter template",
    );
  });

  it("includes required runnable starter files", () => {
    const filePaths = Object.keys(starterTemplateManifest.files);

    expect(filePaths).toContain("package.json");
    expect(filePaths).toContain("src/App.tsx");
    expect(filePaths).toContain("convex/schema.ts");
    expect(filePaths).toContain("AGENTS.md");
    expect(filePaths.length).toBeGreaterThan(10);
  });
});
