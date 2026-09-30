import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { resolveRepoRoot } from "./lib/scriptRuntime.ts";
import { trackedFilePath } from "./lib/trackedFilePath.ts";

describe("Cloudflare deploy source", () => {
  it("keeps the template and Sidebars copies identical", () => {
    const repoRoot = resolveRepoRoot();
    const templateSource = readFileSync(
      path.join(repoRoot, trackedFilePath("templates/base/scripts/deploy-cloudflare.ts")),
      "utf8",
    );

    expect(
      readFileSync(
        path.join(repoRoot, trackedFilePath("apps/sidebars-example/scripts/deploy-cloudflare.ts")),
        "utf8",
      ),
    ).toBe(templateSource);
  });
});
