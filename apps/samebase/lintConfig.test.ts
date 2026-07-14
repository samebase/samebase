import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord } from "@samebase/dependent/main";
import { describe, expect, it } from "vite-plus/test";
import repoViteConfig from "../../vite.config.ts";

const appDir = fileURLToPath(new URL("./", import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");

type JsonRecord = Record<string, unknown>;

type JsPluginConfig = {
  name?: string;
  specifier?: string;
};

type OxlintOverride = {
  files?: string[];
  rules?: JsonRecord;
};

type OxlintConfig = {
  options?: JsonRecord;
  ignorePatterns?: string[];
  jsPlugins?: JsPluginConfig[];
  rules?: JsonRecord;
  overrides?: OxlintOverride[];
};

type PackageSurface = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function expectRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function readJsonObject(relativePath: string): JsonRecord {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
  return expectRecord(parsed, relativePath);
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  const items: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error(`${label} must contain only strings`);
    }
    items.push(entry);
  }

  return items;
}

function readOptionalRecord(value: unknown, label: string): JsonRecord | undefined {
  if (value === undefined) {
    return undefined;
  }
  return expectRecord(value, label);
}

function readOptionalStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readStringArray(value, label);
}

function readOptionalStringRecord(
  value: unknown,
  label: string,
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = expectRecord(value, label);
  const parsed: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== "string") {
      throw new Error(`${label}.${key} must be a string`);
    }
    parsed[key] = entry;
  }

  return parsed;
}

function readOptionalJsPlugins(value: unknown, label: string): JsPluginConfig[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  const plugins: JsPluginConfig[] = [];
  for (const [index, entry] of value.entries()) {
    const record = expectRecord(entry, `${label}[${index}]`);
    const plugin: JsPluginConfig = {};

    if (record.name !== undefined) {
      if (typeof record.name !== "string") {
        throw new Error(`${label}[${index}].name must be a string`);
      }
      plugin.name = record.name;
    }

    if (record.specifier !== undefined) {
      if (typeof record.specifier !== "string") {
        throw new Error(`${label}[${index}].specifier must be a string`);
      }
      plugin.specifier = record.specifier;
    }

    plugins.push(plugin);
  }

  return plugins;
}

function readOptionalOverrides(value: unknown, label: string): OxlintOverride[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  const overrides: OxlintOverride[] = [];
  for (const [index, entry] of value.entries()) {
    const record = expectRecord(entry, `${label}[${index}]`);
    const override: OxlintOverride = {};

    if (record.files !== undefined) {
      override.files = readStringArray(record.files, `${label}[${index}].files`);
    }

    if (record.rules !== undefined) {
      override.rules = expectRecord(record.rules, `${label}[${index}].rules`);
    }

    overrides.push(override);
  }

  return overrides;
}

function readRootViteConfig(): JsonRecord {
  return expectRecord(repoViteConfig, "vite.config.ts");
}

function readRootLintConfig(): OxlintConfig {
  const config = expectRecord(readRootViteConfig()["lint"], "vite.config.ts.lint");
  return {
    options: readOptionalRecord(config.options, "vite.config.ts.lint.options"),
    ignorePatterns: readOptionalStringArray(
      config.ignorePatterns,
      "vite.config.ts.lint.ignorePatterns",
    ),
    jsPlugins: readOptionalJsPlugins(config.jsPlugins, "vite.config.ts.lint.jsPlugins"),
    rules: readOptionalRecord(config.rules, "vite.config.ts.lint.rules"),
    overrides: readOptionalOverrides(config.overrides, "vite.config.ts.lint.overrides"),
  };
}

function readRootFmtConfig(): JsonRecord {
  return expectRecord(readRootViteConfig()["fmt"], "vite.config.ts.fmt");
}

function readRootStagedConfig(): Record<string, string> {
  const staged = readOptionalStringRecord(readRootViteConfig()["staged"], "vite.config.ts.staged");
  if (!staged) {
    throw new Error("vite.config.ts.staged must be defined");
  }
  return staged;
}

function readPackageSurface(relativePath: string): PackageSurface {
  const pkg = readJsonObject(relativePath);
  return {
    scripts: readOptionalStringRecord(pkg.scripts, `${relativePath}.scripts`),
    devDependencies: readOptionalStringRecord(
      pkg.devDependencies,
      `${relativePath}.devDependencies`,
    ),
  };
}

describe("lint config", () => {
  it("keeps type-aware and react-refresh coverage in the primary Oxlint config", () => {
    const oxlintConfig = readRootLintConfig();
    const appWideOverride = oxlintConfig.overrides?.find((override) =>
      override.files?.includes("apps/samebase/**/*.{ts,tsx}"),
    );
    expect(oxlintConfig.options).toMatchObject({ typeAware: true });
    expect(oxlintConfig.ignorePatterns).toContain("**/.codespace-agent/**");
    expect(oxlintConfig.ignorePatterns).not.toContain("**/vite.config.ts");
    expect(appWideOverride?.rules?.["@typescript-eslint/no-explicit-any"]).toBeUndefined();
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
        {
          name: "samebase",
          specifier: "./scripts/lint/eslint-plugin-samebase.js",
        },
      ]),
    );
    expect(oxlintConfig.jsPlugins).not.toContainEqual({
      name: "samebase-local",
      specifier: "eslint-plugin-samebase-local",
    });
    expect(oxlintConfig.rules).toMatchObject({
      "samebase/no-ios-small-text-entry-control": "error",
      "samebase/no-raw-public-convex-function-builders": "error",
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/consistent-type-assertions": ["warn", { assertionStyle: "never" }],
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/restrict-template-expressions": "error",
      "no-restricted-globals": [
        "warn",
        {
          name: "URLSearchParams",
          message: expect.stringContaining("route search"),
        },
      ],
    });
  });

  it("uses vite.config.ts as the Oxc source of truth and vp for hooks/lint", () => {
    const fmtConfig = readRootFmtConfig();
    const stagedConfig = readRootStagedConfig();
    const rootPackage = readPackageSurface("package.json");
    const appPackage = readPackageSurface("apps/samebase/package.json");

    expect(rootPackage.devDependencies).toMatchObject({
      "@convex-dev/eslint-plugin": "2.0.0",
      "eslint-plugin-react-refresh": "^0.4.7",
    });
    expect(rootPackage.devDependencies?.["eslint-plugin-samebase-local"]).toBeUndefined();
    expect(rootPackage.devDependencies?.vitest).toBeUndefined();
    expect(rootPackage.devDependencies?.oxlint).toBeUndefined();
    expect(rootPackage.devDependencies?.["oxlint-tsgolint"]).toBeUndefined();
    expect(fmtConfig).toMatchObject({
      printWidth: 100,
      proseWrap: "always",
    });
    expect(stagedConfig).toMatchObject({
      "*.{cjs,css,cts,html,js,json,jsonc,jsonl,jsx,md,mjs,mts,ts,toml,tsx,yaml,yml}":
        "vp check --fix",
    });
    expect(rootPackage.scripts?.prepare).toBe("vp config --hooks-dir .vite-hooks");
    expect(rootPackage.scripts?.["lint:scripts"]).toContain("pnpm exec vp lint");
    expect(rootPackage.scripts?.["lint:scripts"]).not.toContain("--config");
    expect(appPackage.scripts?.check).toContain("pnpm run lint:vp");
    expect(appPackage.scripts?.lint).toContain("pnpm run check");
    expect(appPackage.scripts?.["lint:vp"]).toContain("exec vp lint");
    expect(appPackage.scripts?.["lint:vp"]).not.toContain("--config");
    expect(appPackage.scripts?.lint).not.toContain("eslint");
    expect(rootPackage.devDependencies?.husky).toBeUndefined();
    expect(appPackage.devDependencies?.eslint).toBeUndefined();
    expect(appPackage.devDependencies?.["@typescript-eslint/parser"]).toBeUndefined();
  });

  it("keeps fully Convex-managed agent files out of repo formatting", () => {
    const fmtConfig = readRootFmtConfig();

    expect(readStringArray(fmtConfig.ignorePatterns, "vite.config.ts.fmt.ignorePatterns")).toEqual(
      expect.arrayContaining(["apps/samebase/AGENTS.md", "apps/samebase/CLAUDE.md"]),
    );
  });
});
