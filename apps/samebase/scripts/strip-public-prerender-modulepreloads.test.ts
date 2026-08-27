import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

import type { PublicPrerenderPage } from "../prerenderPaths.js";
import {
  stripModulePreloadLinks,
  verifyPublicPrerenderMetadata,
  writePublicPrerenderWithoutModulePreloads,
} from "./strip-public-prerender-modulepreloads.js";

const rootPage = {
  path: "/",
  expectedMetadata: {
    title: "Samebase | The correct way to build web apps",
    description:
      "The correct way to build web apps. Convex + Cloudflare is all you need. You own 100% of your code and data.",
    robots: "index,follow",
  },
  prerender: {
    enabled: true,
    outputPath: "/_landing.html",
  },
} satisfies PublicPrerenderPage;

const landingHead = [
  "<head>",
  "<title>Samebase | The correct way to build web apps</title>",
  '<meta name="description" content="The correct way to build web apps. Convex + Cloudflare is all you need. You own 100% of your code and data."/>',
  '<meta name="robots" content="index,follow"/>',
  '<link rel="canonical" href="https://samebase.com/"/>',
  "</head>",
].join("");

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
          '<script>window.__appPreload = "modulepreload";</script>',
        ].join(""),
      ),
    ).toThrow("Failed to strip every modulepreload reference");
  });

  it("verifies exact first-response metadata for configured public routes", () => {
    expect(() => verifyPublicPrerenderMetadata(rootPage, landingHead)).not.toThrow();

    for (const missingMarkup of [
      "<title>",
      '<meta name="description"',
      '<meta name="robots"',
      '<link rel="canonical"',
    ]) {
      expect(() =>
        verifyPublicPrerenderMetadata(rootPage, landingHead.replace(missingMarkup, "<removed")),
      ).toThrow("Public prerender / must contain one exact head element");
    }

    expect(() =>
      verifyPublicPrerenderMetadata(
        rootPage,
        landingHead.replace("</head>", '<meta name="robots" content="noindex,nofollow"/></head>'),
      ),
    ).toThrow("Public prerender / must contain one exact head element");
  });

  it("overwrites the configured public prerender output", () => {
    const clientDistDir = mkdtempSync(path.join(tmpdir(), "samebase-public-prerender-"));
    const landingFilePath = path.join(clientDistDir, "_landing.html");
    writeFileSync(landingFilePath, "original", "utf8");

    try {
      writePublicPrerenderWithoutModulePreloads({
        clientDistDir,
        html:
          landingHead +
          '<link rel="modulepreload" href="/assets/index.js"/>' +
          '<script type="module">import("/assets/index.js");</script>',
        page: rootPage,
      });

      expect(readFileSync(landingFilePath, "utf8")).toBe(
        landingHead + '<script type="module">import("/assets/index.js");</script>',
      );
    } finally {
      rmSync(clientDistDir, { force: true, recursive: true });
    }
  });
});
