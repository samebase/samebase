import { describe, expect, it } from "vite-plus/test";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterSeedManifest", () => {
  it("contains a single template snapshot contract", () => {
    expect(starterTemplateManifest.version).toMatch(/^notermd-app-[0-9a-f]{12}$/);
    expect(starterTemplateManifest.sourceRepo).toBe("https://github.com/notermd/app.git");
    expect(starterTemplateManifest.sourceBranch).toBe("v5-tanstack-start-workers");
    expect(starterTemplateManifest.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(starterTemplateManifest.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(starterTemplateManifest.commitMessage).toBe("chore: seed starter template");
  });

  it("includes required runnable starter files", () => {
    const filePaths = Object.keys(starterTemplateManifest.files);
    const binaryFilePaths = Object.keys(starterTemplateManifest.binaryFiles);
    const allFilePaths = [...filePaths, ...binaryFilePaths];

    expect(filePaths).toContain("package.json");
    expect(filePaths).toContain(".node-version");
    expect(filePaths).toContain("wrangler.jsonc");
    expect(filePaths).toContain("scripts/build-cloudflare.ts");
    expect(filePaths).toContain("scripts/deploy-cloudflare.ts");
    expect(filePaths).toContain("scripts/ensure-convex-auth.ts");
    expect(filePaths).toContain("convex/auth.ts");
    expect(filePaths).toContain("convex/auth.config.ts");
    expect(filePaths).toContain("convex/guests.ts");
    expect(filePaths).toContain("convex/http.ts");
    expect(filePaths).toContain("src/router.tsx");
    expect(filePaths).toContain("src/routes/index.tsx");
    expect(filePaths).toContain("src/routeTree.gen.ts");
    expect(filePaths).toContain("convex/schema.ts");
    expect(filePaths).toContain("convex/_generated/api.d.ts");
    expect(filePaths).toContain("AGENTS.md");
    expect(filePaths).toContain("docs/local-setup.md");
    expect(starterTemplateManifest.fileModes[".vite-hooks/pre-commit"]).toBe("100755");
    expect(new Set(allFilePaths).size).toBe(allFilePaths.length);
    expect(allFilePaths.length).toBeGreaterThan(10);
  });

  it("includes exact guest-name reservation in the starter auth flow", () => {
    // The schema index, reservation mutation, and client call must stay aligned for exact guest-name lookup.
    expect(starterTemplateManifest.files["convex/guests.ts"]).toContain('.withIndex("by_name"');
    expect(starterTemplateManifest.files["convex/schema.ts"]).toContain("guestNames");
    expect(starterTemplateManifest.files["src/routes/index.tsx"]).toContain(
      "api.guests.ensureName",
    );
  });

  it("shows the creator name on starter todos", () => {
    expect(starterTemplateManifest.files["convex/todos.ts"]).toContain("creatorName");
    expect(starterTemplateManifest.files["src/routes/index.tsx"]).toContain(
      "Created by {todo.creatorName}",
    );
  });
});
