import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDir, "../../..");
const redirectsPath = path.resolve(repoRoot, "apps/noter/public/_redirects");
const reactRouterConfigPath = path.resolve(
  repoRoot,
  "apps/noter/react-router.config.ts",
);

describe("Cloudflare Pages routing guardrails", () => {
  test("current Pages redirects do not expose internal framework fallback paths", () => {
    const redirects = readFileSync(redirectsPath, "utf8");
    expect(redirects).not.toContain("__spa-fallback");
  });

  test("React Router framework mode is not reintroduced in unsupported ssr:false mode", () => {
    if (!existsSync(reactRouterConfigPath)) {
      expect(true).toBe(true);
      return;
    }

    const config = readFileSync(reactRouterConfigPath, "utf8");
    expect(config).not.toMatch(/\bssr\s*:\s*false\b/);
  });
});
