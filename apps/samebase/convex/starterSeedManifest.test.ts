import { describe, expect, it } from "vite-plus/test";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterSeedManifest", () => {
  it("contains a single template snapshot contract", () => {
    expect(starterTemplateManifest.version).toMatch(/^samebase-app-[0-9a-f]{12}$/);
    expect(starterTemplateManifest.sourceRepo).toBe("https://github.com/samebase/app.git");
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
    expect(filePaths).toContain("scripts/cloudflare-prerender-pages.ts");
    expect(filePaths).toContain("scripts/deploy-cloudflare.ts");
    expect(filePaths).toContain("scripts/ensure-convex-auth.ts");
    expect(filePaths).toContain("scripts/generate-cloudflare-redirects.ts");
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
    expect(filePaths).toContain("public/_redirects");
    expect(starterTemplateManifest.fileModes[".vite-hooks/pre-commit"]).toBe("100755");
    expect(new Set(allFilePaths).size).toBe(allFilePaths.length);
    expect(allFilePaths.length).toBeGreaterThan(10);
  });

  it("keeps Cloudflare SPA mode and exact prerender aliases aligned", () => {
    expect(starterTemplateManifest.files["public/_redirects"]).toContain(
      "Cloudflare SPA mode owns app-route fallback through /index.html.",
    );
    expect(starterTemplateManifest.files["public/_redirects"]).toContain(
      "# @samebase/app-prerender-redirects:start",
    );
    expect(starterTemplateManifest.files["public/_redirects"]).toContain("/ /_landing.html 200");
    expect(starterTemplateManifest.files["scripts/cloudflare-prerender-pages.ts"]).toContain(
      'outputPath: "/_landing.html"',
    );
    expect(starterTemplateManifest.files["vite.config.ts"]).toContain('maskPath: "/#__spa-shell"');
    expect(starterTemplateManifest.files["package.json"]).toContain(
      '"generate:cloudflare-redirects"',
    );
  });

  it("uses system fonts without a default webfont dependency", () => {
    expect(starterTemplateManifest.files["package.json"]).not.toContain("@fontsource");
    expect(starterTemplateManifest.files["src/style.css"]).not.toContain("@fontsource");
    expect(starterTemplateManifest.files["src/style.css"]).toContain("ui-sans-serif");
  });

  it("includes durable guest-name reservation in the starter auth flow", () => {
    // The schema index, reservation mutation, and client call must stay aligned for exact guest-name lookup.
    expect(starterTemplateManifest.files["convex/guests.ts"]).toContain('.withIndex("by_name"');
    expect(starterTemplateManifest.files["convex/guests.ts"]).toContain("fallbackGuestName");
    expect(starterTemplateManifest.files["convex/guests.ts"]).toContain(
      "FALLBACK_GUEST_NAME_SPACE",
    );
    expect(starterTemplateManifest.files["convex/schema.ts"]).toContain("guestNames");
    expect(starterTemplateManifest.files["src/routes/index.tsx"]).toContain(
      "api.guests.ensureName",
    );
  });

  it("lists starter todos publicly with creator names", () => {
    expect(starterTemplateManifest.files["README.md"]).toContain(
      "the public todo list keeps guest author attribution",
    );
    expect(starterTemplateManifest.files["convex/schema.ts"]).toContain(
      '.index("by_created_at", ["createdAt"])',
    );
    expect(starterTemplateManifest.files["convex/todos.ts"]).toContain(
      '.withIndex("by_created_at")',
    );
    expect(starterTemplateManifest.files["convex/todos.ts"]).toContain("creatorName");
    expect(starterTemplateManifest.files["convex/todos.ts"]).toContain("viewerCanToggle");
    expect(starterTemplateManifest.files["convex/todos.ts"]).toContain("viewerTodoCount");
    expect(starterTemplateManifest.files["src/routes/index.tsx"]).toContain(
      "<TodoList todos={todos} />",
    );
    expect(starterTemplateManifest.files["src/routes/index.tsx"]).toContain(
      "Created by {todo.creatorName}",
    );
  });

  it("caps starter todo abuse paths", () => {
    expect(starterTemplateManifest.files["convex/todos.ts"]).toContain("MAX_TODOS_PER_USER = 50");
    expect(starterTemplateManifest.files["convex/todos.ts"]).toContain(".take(MAX_TODOS_PER_USER)");
    expect(starterTemplateManifest.files["convex/todos.ts"]).toContain("MAX_TODO_TEXT_LENGTH");
    expect(starterTemplateManifest.files["src/routes/index.tsx"]).toContain(
      "maxLength={TODO_TEXT_LIMIT}",
    );
  });
});
