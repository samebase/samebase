import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildNoterSyncPublicScript } from "../../noterSyncPublicScript";

describe("noter sync public script", () => {
  it("keeps the committed noter.ts asset byte-for-byte in sync with the package source", () => {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDirectoryPath = path.dirname(currentFilePath);
    const publicScript = readFileSync(
      path.resolve(currentDirectoryPath, "../../public/noter.ts"),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trimEnd();
    const packageScript = readFileSync(
      path.resolve(currentDirectoryPath, "../../../../packages/sync/noter.ts"),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trimEnd();
    const mirroredPublicScript = buildNoterSyncPublicScript({
      packageScript,
    }).trimEnd();

    expect(publicScript).toBe(packageScript);
    expect(publicScript).toBe(mirroredPublicScript);
  });
});
