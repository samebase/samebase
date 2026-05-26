import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { prerenderSpaIndex, renderSpaIndexHtml } from "./prerender-spa-index.js";

describe("prerender-spa-index", () => {
  it("writes full route HTML from the built server entry", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "noter-prerender-spa-index-"));
    const serverEntryPath = path.join(tempDir, "server.mjs");
    const clientIndexPath = path.join(tempDir, "index.html");
    const previousShellEnv = process.env.TSS_SHELL;
    const logs: string[] = [];

    try {
      process.env.TSS_SHELL = "true";
      await writeFile(
        serverEntryPath,
        `
const shellEnvAtImport = process.env.TSS_SHELL ?? "";

export default {
  fetch() {
    return new Response("<!doctype html><p>shell=" + shellEnvAtImport + "</p>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};
`,
        "utf8",
      );

      await prerenderSpaIndex({
        clientIndexPath,
        log: (message) => logs.push(message),
        requestUrl: "http://127.0.0.1/",
        serverEntryPath,
      });

      await expect(readFile(clientIndexPath, "utf8")).resolves.toBe("<!doctype html><p>shell=</p>");
      expect(logs).toEqual([
        `Importing server entry: ${serverEntryPath}`,
        "Rendering SPA index from http://127.0.0.1/",
        `Wrote ${clientIndexPath} (28 bytes)`,
      ]);
      expect(process.env.TSS_SHELL).toBe("true");
    } finally {
      if (previousShellEnv === undefined) {
        delete process.env.TSS_SHELL;
      } else {
        process.env.TSS_SHELL = previousShellEnv;
      }
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects non-html responses", async () => {
    await expect(
      renderSpaIndexHtml(
        {
          fetch: () =>
            new Response("{}", {
              headers: { "content-type": "application/json" },
            }),
        },
        new Request("http://127.0.0.1/"),
      ),
    ).rejects.toThrow("expected HTML");
  });
});
