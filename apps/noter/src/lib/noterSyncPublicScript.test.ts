import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { format as formatWithPrettier } from "prettier";

import {
  buildNoterSyncPublicScript,
  resolveNoterSyncPublicScriptSourceUrl,
} from "../../noterSyncPublicScript";

describe("noter sync public script", () => {
  it("keeps the committed noter.js asset in sync with the package source and production source URL", async () => {
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
    const formattedPublicScript = (
      await formatWithPrettier(
        buildNoterSyncPublicScript({
          packageScript: packageScript,
          sourceUrl: resolveNoterSyncPublicScriptSourceUrl(),
        }),
        {
          filepath: fileURLToPath(publicScriptUrl),
        },
      )
    ).trim();

    expect(publicScript).not.toBe(formattedPackageScript);
    expect(publicScript).toBe(formattedPublicScript);
  });

  it("prefers explicit dev or Pages origins when resolving the hosted script source URL", () => {
    expect(
      resolveNoterSyncPublicScriptSourceUrl({
        devOrigin: "http://127.0.0.1:5174",
        pagesUrl: "https://preview.noter-ax1.pages.dev",
      }),
    ).toBe("http://127.0.0.1:5174/noter.js");
    expect(
      resolveNoterSyncPublicScriptSourceUrl({
        devOrigin: null,
        pagesUrl: "https://preview.noter-ax1.pages.dev",
      }),
    ).toBe("https://preview.noter-ax1.pages.dev/noter.js");
  });
});
