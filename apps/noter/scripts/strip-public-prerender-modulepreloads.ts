import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPublicPrerenderPages,
  readCloudflarePrerenderHtmlOutputPath,
  type PublicPrerenderPage,
} from "./generate-cloudflare-redirects.ts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const clientDistDir = path.resolve(appDir, "dist/client");
const modulePreloadLinkPattern = /<link\s+rel="modulepreload"\s+href="[^"]+"\/>/g;

function readPrerenderHtmlFilePath(page: PublicPrerenderPage) {
  const htmlOutputPath = readCloudflarePrerenderHtmlOutputPath(page);
  if (!htmlOutputPath.startsWith("/")) {
    throw new Error(`Prerender output path must be root-relative: ${htmlOutputPath}`);
  }
  if (htmlOutputPath === "/index.html") {
    throw new Error("Public prerender pages must not rewrite the SPA fallback /index.html.");
  }

  const htmlFilePath = path.resolve(clientDistDir, htmlOutputPath.slice(1));
  const relativePath = path.relative(clientDistDir, htmlFilePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Prerender output path escapes dist/client: ${htmlOutputPath}`);
  }

  return htmlFilePath;
}

function stripModulePreloads(filePath: string) {
  const currentHtml = readFileSync(filePath, "utf8");
  const nextHtml = currentHtml.replace(modulePreloadLinkPattern, "");

  if (nextHtml === currentHtml) {
    return 0;
  }

  writeFileSync(filePath, nextHtml, "utf8");
  return [...currentHtml.matchAll(modulePreloadLinkPattern)].length;
}

let strippedLinkCount = 0;

for (const page of await loadPublicPrerenderPages()) {
  strippedLinkCount += stripModulePreloads(readPrerenderHtmlFilePath(page));
}

console.log(`Stripped ${strippedLinkCount} public prerender modulepreload links.`);
