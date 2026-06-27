import { describe, expect, it } from "vite-plus/test";
import { readPublicPrerenderPages } from "./publicPrerenderPages";

describe("readPublicPrerenderPages", () => {
  it("derives production prerender pages from route staticData", () => {
    const pages = readPublicPrerenderPages();
    const paths = pages.map((page) => page.path);

    expect(paths).toContain("/");
    expect(paths).toContain("/landing/do-it-yourself");
    expect(paths).toContain("/landing-preview");
    expect(paths).toContain("/privacy");
    expect(paths).toContain("/terms");
    expect(paths).not.toContain("/add");
    expect(paths).not.toContain("/indexDB");
    expect(paths).not.toContain("/landing");
    expect(paths).not.toContain("/localStorage");
    expect(paths).not.toContain("/visual-fixture");
    expect(paths).not.toContain("/vault/$");
  });

  it("keeps the public landing route at the non-shell landing output path", () => {
    const pages = readPublicPrerenderPages();
    const rootPage = pages.find((page) => page.path === "/");

    expect(rootPage?.prerender).toEqual({
      enabled: true,
      outputPath: "/_landing.html",
    });
  });
});
