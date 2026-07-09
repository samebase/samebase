import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { buildRuntimeSamebaseSyncScript } from "../../vite.config";

describe("samebase sync public script", () => {
  it("builds the hosted samebase.ts asset from the package source", async () => {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDirectoryPath = path.dirname(currentFilePath);
    const packageScript = readFileSync(
      path.resolve(currentDirectoryPath, "../../../../packages/sync/samebase.ts"),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trimEnd();

    expect(await buildRuntimeSamebaseSyncScript()).toBe(`${packageScript}\n`);
  });
});
