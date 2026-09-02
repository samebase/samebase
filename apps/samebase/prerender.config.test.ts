import { describe, expect, it } from "vite-plus/test";
import { prerenderPages } from "./prerender.config";

describe("prerenderPages", () => {
  it("derives production prerender pages from route staticData", () => {
    const paths = prerenderPages.map((page) => page.path);

    expect(paths).toContain("/");
    expect(paths).toContain("/docs");
    expect(paths).toContain("/docs/cloudflare-setup");
    expect(paths).toContain("/docs/do-it-yourself");
    expect(paths).toContain("/docs/receipts");
    expect(paths).toContain("/docs/the-stack");
    expect(paths).not.toContain("/landing-preview");
    expect(paths).toContain("/logo/hover/menger");
    expect(paths).toContain("/logo/iso");
    expect(paths).toContain("/logo/raster");
    expect(paths).toContain("/logo/raster-seams");
    expect(paths).toContain("/logo/single-cube");
    expect(paths).toContain("/logo/svg");
    expect(paths).toContain("/logo/transition");
    expect(paths).toContain("/logo/transition/menger");
    expect(paths).toContain("/logo/transition/transforms");
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/privacy");
    expect(paths).toContain("/terms");
    expect(paths).not.toContain("/add");
    expect(paths).not.toContain("/indexDB");
    expect(paths).not.toContain("/landing");
    expect(paths).not.toContain("/localStorage");
    expect(paths).not.toContain("/youtube");
    expect(paths).not.toContain("/discord");
    expect(paths).not.toContain("/visual-fixture");
    expect(paths).not.toContain("/repo/$");
  });

  it("keeps the public landing route at the non-shell landing output path", () => {
    const rootPage = prerenderPages.find((page) => page.path === "/");

    expect(rootPage?.prerender).toEqual({
      enabled: true,
      outputPath: "/_landing.html",
    });
  });
});
