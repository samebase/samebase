import { describe, expect, it } from "vite-plus/test";

import { stripModulePreloadLinks } from "./strip-public-prerender-modulepreloads.js";

describe("strip-public-prerender-modulepreloads", () => {
  it("strips current Vite modulepreload links without removing stylesheet or module entry tags", () => {
    expect(
      stripModulePreloadLinks(
        [
          '<link rel="stylesheet" href="/assets/index.css"/>',
          '<link rel="modulepreload" href="/assets/index.js"/>',
          '<script type="module">import("/assets/index.js");</script>',
        ].join(""),
      ),
    ).toEqual({
      html: [
        '<link rel="stylesheet" href="/assets/index.css"/>',
        '<script type="module">import("/assets/index.js");</script>',
      ].join(""),
      strippedLinkCount: 1,
    });
  });

  it("strips modulepreload links across common link attribute variations", () => {
    expect(
      stripModulePreloadLinks(
        [
          '<link href="/assets/one.js" rel="modulepreload" crossorigin>',
          "<link crossorigin rel='modulepreload' href=\"/assets/two.js\">",
          '<link rel="preload modulepreload" href="/assets/three.js"/>',
          '<link rel=modulepreload href="/assets/four.js">',
          '<link rel="stylesheet" href="/assets/index.css"/>',
        ].join(""),
      ),
    ).toEqual({
      html: '<link rel="stylesheet" href="/assets/index.css"/>',
      strippedLinkCount: 4,
    });
  });

  it("fails when modulepreload references remain after stripping link tags", () => {
    expect(() =>
      stripModulePreloadLinks(
        [
          '<link rel="modulepreload" href="/assets/index.js"/>',
          '<script>window.__noterPreload = "modulepreload";</script>',
        ].join(""),
      ),
    ).toThrow("Failed to strip every modulepreload reference");
  });
});
