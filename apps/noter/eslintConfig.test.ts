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

function readCommonJsConfig(relativePath: string) {
  return requireFromRepoRoot(relativePath) as {
    plugins?: string[];
    rules?: Record<string, unknown>;
    overrides?: Array<{
      files?: string[];
      excludedFiles?: string[];
      rules?: Record<string, unknown>;
    }>;
  };
}

function readOxlintConfig() {
  return readJson(".oxlintrc.json") as {
    jsPlugins?: Array<{ name?: string; specifier?: string }>;
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
    const oxlintConfig = readOxlintConfig();
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

  it("keeps the app type-aware fallback separate from the primary Oxlint config", () => {
    const fallbackConfig = readCommonJsConfig("./.eslintrc.type-aware.cjs");

    expect(fallbackConfig.plugins).toEqual(
      expect.arrayContaining(["@typescript-eslint", "react-refresh"]),
    );
    expect(fallbackConfig.rules).toMatchObject({
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
    });
  });

  it("uses Oxlint as the primary lint runner and ESLint only for app type-aware fallback", () => {
    const rootPackage = readJson("package.json") as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const appPackage = readJson("apps/noter/package.json") as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(rootPackage.devDependencies).toMatchObject({
      "eslint-plugin-noter-local": "workspace:*",
      oxlint: "^1.59.0",
      "oxlint-tsgolint": "^0.20.0",
    });
    expect(appPackage.devDependencies).toMatchObject({
      "eslint-plugin-noter-local": "workspace:*",
    });
    expect(rootPackage.scripts?.["lint:scripts"]).toContain("pnpm exec oxlint");
    expect(rootPackage.scripts?.["lint:scripts"]).toContain("--type-aware");
    expect(appPackage.scripts?.lint).toContain("pnpm run lint:oxlint");
    expect(appPackage.scripts?.lint).toContain("pnpm run lint:type-aware");
    expect(appPackage.scripts?.["lint:oxlint"]).toContain("pnpm exec oxlint");
    expect(appPackage.scripts?.["lint:type-aware"]).toContain(
      ".eslintrc.type-aware.cjs",
    );
  });
});
