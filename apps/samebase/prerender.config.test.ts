import { describe, expect, it } from "vite-plus/test";
import { prerenderPages } from "./prerender.config";

describe("prerenderPages", () => {
  it("prerenders the public pages without data, which route staticData marks", () => {
    expect(prerenderPages.map((page) => page.path)).toEqual([
      "/",
      "/changelog",
      "/docs",
      "/docs/cloudflare-previews-migration",
      "/docs/cloudflare-setup",
      "/docs/do-it-yourself",
      "/docs/receipts",
      "/docs/the-big-migration",
      "/docs/the-stack",
      "/pricing",
      "/privacy",
      "/terms",
    ]);
  });
});
