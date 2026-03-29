import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { format as formatWithPrettier } from "prettier";

describe("noter sync public script", () => {
  it("keeps the committed deploy-scoped noter.js asset in sync with the package source", async () => {
    const publicScriptUrl = new URL("../../public/noter.js", import.meta.url);
    const publicScript = readFileSync(publicScriptUrl, "utf8")
      .replace(/\r\n/g, "\n")
      .trim();
    const packageScript = readFileSync(
      new URL("../../../../packages/sync/noter.js", import.meta.url),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trim();
    const formattedPackageScript = (
      await formatWithPrettier(packageScript, {
        filepath: fileURLToPath(publicScriptUrl),
      })
    ).trim();

    expect(publicScript).toBe(formattedPackageScript);
  });
});
