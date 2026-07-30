import { describe, expect, it } from "vite-plus/test";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterSeedManifest", () => {
  it("contains a single template snapshot contract", () => {
    expect(starterTemplateManifest.version).toMatch(/^samebase-app-[0-9a-f]{12}$/);
    expect(starterTemplateManifest.sourceRepo).toBe("https://github.com/samebase/app.git");
    expect(starterTemplateManifest.sourceBranch).toBe("codex-generated-app-node-typecheck");
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
    expect(filePaths).toContain("scripts/check-typescript-sources.test.ts");
    expect(filePaths).toContain("scripts/check-typescript-sources.ts");
    expect(filePaths).toContain("scripts/cloudflare-prerender-pages.ts");
    expect(filePaths).toContain("scripts/deploy-cloudflare.ts");
    expect(filePaths).toContain("scripts/ensure-convex-auth.ts");
    expect(filePaths).toContain("scripts/generate-cloudflare-redirects.ts");
    expect(filePaths).toContain("tsconfig.node.json");
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

  it("type-checks handwritten Node automation in normal checks and Cloudflare builds", () => {
    const scriptFiles = Object.keys(starterTemplateManifest.files).filter((filePath) =>
      filePath.startsWith("scripts/"),
    );
    const packageJson: unknown = JSON.parse(starterTemplateManifest.files["package.json"]);
    const nodeTypeScriptConfig: unknown = JSON.parse(
      starterTemplateManifest.files["tsconfig.node.json"],
    );

    expect(starterTemplateManifest.files[".node-version"]).toBe("24\n");
    expect(packageJson).toEqual(
      expect.objectContaining({
        type: "module",
        scripts: expect.objectContaining({
          check:
            "tsc && pnpm run check:typescript-sources && pnpm run typecheck:node && tsc --project convex/tsconfig.json && pnpm run verify:cloudflare-redirects",
          build: "vp run build:cloudflare",
          "build:cloudflare":
            "pnpm run check:typescript-sources && pnpm run typecheck:node && node ./scripts/build-cloudflare.ts",
          "check:typescript-sources": "node ./scripts/check-typescript-sources.ts",
          "typecheck:node": "tsc --project tsconfig.node.json",
        }),
      }),
    );
    expect(scriptFiles.length).toBeGreaterThan(0);
    expect(scriptFiles.every((filePath) => filePath.endsWith(".ts"))).toBe(true);
    expect(nodeTypeScriptConfig).toEqual({
      compilerOptions: {
        target: "ESNext",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: ["node"],
        skipLibCheck: true,
        allowImportingTsExtensions: true,
        verbatimModuleSyntax: true,
        moduleDetection: "force",
        noEmit: true,
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        erasableSyntaxOnly: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ["scripts/**/*.ts", "vite.config.ts"],
    });
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

  it("documents Convex deploy-key permissions for Workers builds", () => {
    expect(starterTemplateManifest.files["README.md"]).toContain("`CONVEX_DEPLOY_KEY`");
    expect(starterTemplateManifest.files["README.md"]).not.toContain("`PROD_CONVEX_DEPLOY_KEY`");
    expect(starterTemplateManifest.files["README.md"]).toContain(
      "`deployment:deploy`, `deployment:env:view`, `deployment:env:write`, and\n  `deployment:data:view`",
    );
    expect(starterTemplateManifest.files["README.md"]).toContain(
      "Do not grant data write, function-run, logs, backups, or integration permissions",
    );
    expect(starterTemplateManifest.files["scripts/build-cloudflare.ts"]).toContain(
      "deployment:deploy, deployment:env:view, deployment:env:write, and deployment:data:view",
    );
    expect(starterTemplateManifest.files["scripts/build-cloudflare.ts"]).toContain(
      "const CONVEX_DEPLOY_KEY =",
    );
    expect(starterTemplateManifest.files["scripts/build-cloudflare.ts"]).not.toContain(
      "PROD_CONVEX_DEPLOY_KEY",
    );
    expect(starterTemplateManifest.files["scripts/build-cloudflare.test.ts"]).toContain(
      'deployKeyName: "CONVEX_DEPLOY_KEY"',
    );
    expect(starterTemplateManifest.files["scripts/build-cloudflare.ts"]).toContain(
      '"--preview-name"',
    );
    expect(starterTemplateManifest.files["scripts/build-cloudflare.ts"]).not.toContain(
      '"--preview-create"',
    );
    expect(starterTemplateManifest.files["docs/cloudflare-workers-builds.md"]).toContain(
      "store `CONVEX_DEPLOY_KEY` on\nthe production trigger and `PREVIEW_CONVEX_DEPLOY_KEY` on the preview trigger",
    );
    expect(starterTemplateManifest.files["docs/cloudflare-workers-builds.md"]).not.toContain(
      "store both secrets on every\ntrigger",
    );
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
