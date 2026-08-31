import { describe, expect, it } from "vite-plus/test";
import { starterTemplateManifest } from "./starterSeedManifest.generated";

describe("starterSeedManifest", () => {
  it("identifies the v2002 template snapshot", () => {
    expect({
      contentHash: starterTemplateManifest.contentHash,
      commitMessage: starterTemplateManifest.commitMessage,
    }).toEqual({
      contentHash: "4c4eff83cd4151a099cdaf8110b5683c0565b6aae71dce13269db3ead1884210",
      commitMessage: "Initialize app from Samebase starter build v2002",
    });
    expect(starterTemplateManifest.version).toBe(
      `samebase-base-${starterTemplateManifest.contentHash.slice(0, 12)}`,
    );
    expect(starterTemplateManifest.sourcePath).toBe("templates/base");
    expect(starterTemplateManifest.publishedRepo).toBe("https://github.com/samebase/base.git");
  });

  it("includes required runnable starter files", () => {
    const filePaths = Object.keys(starterTemplateManifest.files);
    const binaryFilePaths = Object.keys(starterTemplateManifest.binaryFiles);
    const allFilePaths = [...filePaths, ...binaryFilePaths];

    expect(filePaths).toContain("package.json");
    expect(filePaths).toContain("pnpm-lock.yaml");
    expect(filePaths).toContain("pnpm-workspace.yaml");
    expect(filePaths).toContain(".github/workflows/ci.yml");
    expect(filePaths).toContain(".node-version");
    expect(filePaths).toContain("wrangler.jsonc");
    expect(filePaths).toContain("scripts/build-cloudflare.ts");
    expect(filePaths).toContain("prerender.config.ts");
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

  it("keeps one Vite+ toolchain and explicit TypeScript projects in normal checks and builds", () => {
    const packageJson: unknown = JSON.parse(starterTemplateManifest.files["package.json"]);
    const nodeTypeScriptConfig: unknown = JSON.parse(
      starterTemplateManifest.files["tsconfig.node.json"],
    );
    const buildCloudflareScript = starterTemplateManifest.files["scripts/build-cloudflare.ts"];
    const pnpmWorkspace = starterTemplateManifest.files["pnpm-workspace.yaml"];

    expect(starterTemplateManifest.files[".node-version"]).toBe("24\n");
    expect(packageJson).toEqual(
      expect.objectContaining({
        name: "samebase-base",
        type: "module",
        scripts: expect.objectContaining({
          check:
            "vp check && vp run typecheck && vp test && vp run verify:cloudflare-redirects && vp run verify:dev-launcher-version",
          build: "vp run build:cloudflare",
          "build:app": "vp run check && vp build",
          "build:cloudflare": "node ./scripts/build-cloudflare.ts",
          format: "vp fmt",
          "format:check": "vp fmt --check",
          lint: "vp lint --report-unused-disable-directives",
          prepare: "vp config --no-agent",
          test: "vp test",
          typecheck: "tsc && vp run typecheck:node && tsc --project convex/tsconfig.json",
          "typecheck:node": "tsc --project tsconfig.node.json",
          "verify:cloudflare-redirects":
            "vp run generate:cloudflare-redirects && git diff --exit-code -- public/_redirects",
        }),
        devDependencies: expect.objectContaining({
          vite: "catalog:",
          "vite-plus": "catalog:",
          vitest: "catalog:",
        }),
        packageManager: "pnpm@11.1.1",
      }),
    );
    expect(pnpmWorkspace).toContain("vite: npm:@voidzero-dev/vite-plus-core@0.3.0");
    expect(pnpmWorkspace).toContain("vitest: 4.1.11");
    expect(pnpmWorkspace).toContain("vite-plus: 0.3.0");
    expect(starterTemplateManifest.files["package.json"]).not.toContain('"eslint"');
    expect(starterTemplateManifest.files["package.json"]).not.toContain('"prettier"');
    expect(buildCloudflareScript).toContain(
      'const WORKERS_BUILD_COMMAND = "vp run build:app && node ./scripts/verify-current-branch-head.ts";',
    );
    expect(buildCloudflareScript).toContain('await run("vp", ["run", "build:app"]);');
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
        exactOptionalPropertyTypes: true,
        noUncheckedSideEffectImports: true,
        noImplicitReturns: true,
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        noUncheckedIndexedAccess: false,
        allowUnreachableCode: false,
        allowUnusedLabels: false,
        forceConsistentCasingInFileNames: true,
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
      "# @samebase/base-prerender-redirects:start",
    );
    expect(starterTemplateManifest.files["public/_redirects"]).toContain("/ /_landing.html 200");
    expect(starterTemplateManifest.files["prerender.config.ts"]).toContain(
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

  it("documents scoped Convex deploy keys and the Worker Previews beta boundary", () => {
    expect(starterTemplateManifest.files["README.md"]).toContain("`CONVEX_DEPLOY_KEY`");
    expect(starterTemplateManifest.files["README.md"]).not.toContain("`PROD_CONVEX_DEPLOY_KEY`");
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
      'CONVEX_DEPLOY_KEY: "preview-key"',
    );
    expect(starterTemplateManifest.files["scripts/build-cloudflare.ts"]).toContain(
      '"--preview-name"',
    );
    expect(starterTemplateManifest.files["scripts/build-cloudflare.ts"]).not.toContain(
      '"--preview-create"',
    );
    expect(starterTemplateManifest.files["docs/cloudflare-workers-builds.md"]).toContain(
      "Use one key name with a different value on each Workers Builds trigger",
    );
    expect(starterTemplateManifest.files["docs/cloudflare-workers-builds.md"]).toContain(
      "Do not add a Convex deploy key under **Settings > Variables and secrets > Previews Base**",
    );
    expect(starterTemplateManifest.files["package.json"]).toContain('"deploy:worker-preview"');
    expect(starterTemplateManifest.files["scripts/deploy-cloudflare.ts"]).toContain(
      '["preview", "--worker-name", workerName',
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
      "The example app is a public todo list.",
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
