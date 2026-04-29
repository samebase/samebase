import { describe, expect, it } from "vite-plus/test";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterSeedManifest", () => {
  it("contains a single template snapshot contract", () => {
    expect(starterTemplateManifest.version).toMatch(
      /^notermd-app-[0-9a-f]{12}$/,
    );
    expect(starterTemplateManifest.sourceRepo).toBe(
      "https://github.com/notermd/app.git",
    );
    expect(starterTemplateManifest.sourceBranch).toBe("main");
    expect(starterTemplateManifest.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(starterTemplateManifest.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(starterTemplateManifest.commitMessage).toBe(
      "chore: seed starter template",
    );
  });

  it("includes required runnable starter files", () => {
    const filePaths = Object.keys(starterTemplateManifest.files);

    expect(filePaths).toContain("package.json");
    expect(filePaths).toContain("src/routes/index.tsx");
    expect(filePaths).toContain("src/routeTree.gen.ts");
    expect(filePaths).toContain("convex/schema.ts");
    expect(filePaths).toContain("convex/_generated/api.d.ts");
    expect(filePaths).toContain("AGENTS.md");
    expect(filePaths.length).toBeGreaterThan(10);
  });
});
