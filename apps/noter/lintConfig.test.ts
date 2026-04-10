import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDir = fileURLToPath(new URL("./", import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");
const requireFromRepoRoot = createRequire(`${repoRoot}/package.json`);

function readJson(relativePath: string) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8"),
  ) as Record<string, unknown>;
}

function readRootLintConfig() {
  return readJson(".oxlintrc.json") as {
    options?: Record<string, unknown>;
    ignorePatterns?: string[];
    jsPlugins?: Array<{ name?: string; specifier?: string }>;
    rules?: Record<string, unknown>;
    overrides?: Array<{
      files?: string[];
      rules?: Record<string, unknown>;
    }>;
  };
}

describe("lint config", () => {
  it("wires the local query param rule through the Oxlint JS plugin bridge", () => {
    const pluginPath = requireFromRepoRoot.resolve("eslint-plugin-noter-local");
    const plugin = requireFromRepoRoot("eslint-plugin-noter-local") as {
      rules?: Record<string, unknown>;
    };
    const oxlintConfig = readRootLintConfig();
    const sourceOverride = oxlintConfig.overrides?.find(
      (override) =>
        override.files?.includes("apps/noter/src/**/*.{ts,tsx}") ?? false,
    );
    const optOutOverride = oxlintConfig.overrides?.find((override) =>
      override.files?.includes("apps/noter/src/lib/queryParams.ts"),
    );

    expect(pluginPath).toBe(path.join(repoRoot, "eslint-rules", "index.js"));
    expect(plugin.rules).toHaveProperty("use-query-param-helpers");
    expect(oxlintConfig.jsPlugins).toContainEqual({
      name: "noter-local",
      specifier: "eslint-plugin-noter-local",
    });
    expect(sourceOverride?.rules).toMatchObject({
      "noter-local/use-query-param-helpers": "error",
    });
    expect(optOutOverride?.rules).toMatchObject({
      "noter-local/use-query-param-helpers": "off",
    });
  });

  it("keeps type-aware and react-refresh coverage in the primary Oxlint config", () => {
    const oxlintConfig = readRootLintConfig();

    expect(oxlintConfig.options).toMatchObject({ typeAware: true });
    expect(oxlintConfig.ignorePatterns).toContain("**/.codespace-agent/**");
    expect(oxlintConfig.jsPlugins).toEqual(
      expect.arrayContaining([
        {
          name: "@convex-dev",
          specifier: "@convex-dev/eslint-plugin",
        },
        {
          name: "react-refresh",
          specifier: "eslint-plugin-react-refresh",
        },
      ]),
    );
    expect(oxlintConfig.rules).toMatchObject({
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
    });
  });

  it("uses Oxlint as the only repo lint runner for app and starter surfaces", () => {
    const rootPackage = readJson("package.json") as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const appPackage = readJson("apps/noter/package.json") as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const starterPackage = readJson("apps/noter-starter-template/package.json") as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(rootPackage.devDependencies).toMatchObject({
      "@convex-dev/eslint-plugin": "0.0.1-alpha.4",
      "eslint-plugin-noter-local": "workspace:*",
      "eslint-plugin-react-refresh": "^0.4.7",
      oxlint: "^1.59.0",
      "oxlint-tsgolint": "^0.20.0",
    });
    expect(rootPackage.scripts?.["lint:scripts"]).toContain("pnpm exec oxlint");
    expect(appPackage.scripts?.lint).toContain("pnpm run lint:oxlint");
    expect(appPackage.scripts?.["lint:oxlint"]).toContain("pnpm exec oxlint");
    expect(starterPackage.scripts?.lint).toContain("pnpm exec oxlint");
    expect(appPackage.scripts?.lint).not.toContain("eslint");
    expect(starterPackage.scripts?.lint).not.toContain("eslint");
    expect(appPackage.devDependencies?.eslint).toBeUndefined();
    expect(appPackage.devDependencies?.["@typescript-eslint/parser"]).toBeUndefined();
    expect(starterPackage.devDependencies?.eslint).toBeUndefined();
    expect(starterPackage.devDependencies?.["@typescript-eslint/parser"]).toBeUndefined();
  });
});
