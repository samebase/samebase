import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const appDir = fileURLToPath(new URL("./", import.meta.url));
const repoRoot = path.resolve(appDir, "..", "..");
const sourceDir = path.join(appDir, "src");
const eslintConfigPath = path.join(repoRoot, ".eslintrc.cjs");

describe("eslint config", () => {
  it("loads the local query param rule without rulesdir", async () => {
    const fixtureDir = await mkdtemp(
      path.join(sourceDir, "__eslint-rule-fixture-"),
    );
    const fixturePath = path.join(fixtureDir, "useQueryParamHelpers.tsx");

    await writeFile(
      fixturePath,
      [
        "import { useSearchParams } from 'react-router-dom'",
        "",
        "export function QueryParamFixture() {",
        "  const [searchParams] = useSearchParams()",
        "  searchParams.set('tab', 'settings')",
        "  return null",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    try {
      const eslint = new ESLint({
        cwd: repoRoot,
        overrideConfigFile: eslintConfigPath,
      });
      const [result] = await eslint.lintFiles([fixturePath]);

      expect(result).toBeDefined();
      expect(
        result?.messages.some(
          (message) => message.ruleId === "noter-local/use-query-param-helpers",
        ),
      ).toBe(true);
      expect(
        result?.messages.some((message) =>
          message.message.includes("Definition for rule"),
        ),
      ).toBe(false);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
});
