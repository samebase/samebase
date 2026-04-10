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

function readEslintConfig() {
  return requireFromRepoRoot("./.eslintrc.cjs") as {
    plugins?: string[];
    overrides?: Array<{
      files?: string[];
      excludedFiles?: string[];
      rules?: Record<string, string>;
    }>;
  };
}

describe("eslint config", () => {
  it("wires the local query param rule through the workspace plugin", () => {
    const pluginPath = requireFromRepoRoot.resolve("eslint-plugin-noter-local");
    const plugin = requireFromRepoRoot("eslint-plugin-noter-local") as {
      rules?: Record<string, unknown>;
    };
    const eslintConfig = readEslintConfig();
    const sourceOverride = eslintConfig.overrides?.find(
      (override) =>
        override.files?.includes("apps/noter/src/**/*.{ts,tsx}") ?? false,
    );

    expect(pluginPath).toBe(path.join(repoRoot, "eslint-rules", "index.js"));
    expect(plugin.rules).toHaveProperty("use-query-param-helpers");
    expect(eslintConfig.plugins).toContain("noter-local");
    expect(sourceOverride?.rules).toMatchObject({
      "noter-local/use-query-param-helpers": "error",
    });
  });

  it("uses plugin wiring instead of rulesdir flags", () => {
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
    });
    expect(appPackage.devDependencies).toMatchObject({
      "eslint-plugin-noter-local": "workspace:*",
    });
    expect(rootPackage.scripts?.["lint:scripts"]).not.toContain("--rulesdir");
    expect(appPackage.scripts?.lint).not.toContain("--rulesdir");
    expect(appPackage.scripts?.["lint:ci"]).not.toContain("--rulesdir");
  });
});
