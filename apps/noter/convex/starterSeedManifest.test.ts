import { describe, expect, it } from "vitest";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterSeedManifest", () => {
  it("contains a single template snapshot contract", () => {
    expect(starterTemplateManifest.version.length).toBeGreaterThan(0);
    expect(starterTemplateManifest.commitMessage).toBe(
      "chore: seed starter template",
    );
    expect(starterTemplateManifest.source.repository).toBe(
      "noter-md/convex-cloudflare-pages-stack",
    );
    expect(starterTemplateManifest.source.commitSha.length).toBeGreaterThan(0);
  });

  it("includes required runnable starter files", () => {
    const filePaths = Object.keys(starterTemplateManifest.files);

    expect(filePaths).toContain("package.json");
    expect(filePaths).toContain("pnpm-workspace.yaml");
    expect(filePaths).toContain("apps/web/package.json");
    expect(filePaths).toContain("apps/web/src/App.tsx");
    expect(filePaths).toContain("apps/web/convex/schema.ts");
    expect(filePaths).toContain("AGENTS.md");
    expect(filePaths.length).toBeGreaterThan(10);
  });
});
