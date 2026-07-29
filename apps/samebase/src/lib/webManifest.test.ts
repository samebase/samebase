import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

describe("web manifest", () => {
  it("commits a parseable thin install manifest with explicit install icons", () => {
    const manifestText = readFileSync(
      new URL("../../public/manifest.webmanifest", import.meta.url),
      "utf8",
    );
    const manifest = JSON.parse(manifestText);

    expect(manifest).toMatchObject({
      id: "/",
      name: "Samebase",
      short_name: "Samebase",
      start_url: "/vault",
      scope: "/",
      display: "standalone",
      theme_color: "#ffffff",
      background_color: "#ffffff",
    });
    expect(manifest.icons).toEqual([
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });
});
