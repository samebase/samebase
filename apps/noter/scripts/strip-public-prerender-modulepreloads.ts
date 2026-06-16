import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  loadPublicPrerenderPages,
  readCloudflarePrerenderHtmlOutputPath,
  type PublicPrerenderPage,
} from "./generate-cloudflare-redirects.ts";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const clientDistDir = path.resolve(appDir, "dist/client");
const linkTagPattern = /<link\b[^>]*>/gi;
const relAttributePattern = /\srel\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/i;
const modulePreloadTextPattern = /\bmodulepreload\b/i;

function readRelAttributeValue(linkTag: string) {
  const match = relAttributePattern.exec(linkTag);
  if (!match) {
    return null;
  }

  const rawValue = match[1];
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return rawValue.slice(1, -1);
  }
  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}

function isModulePreloadLink(linkTag: string) {
  const relValue = readRelAttributeValue(linkTag);
  if (relValue === null) {
    return false;
  }

  return relValue
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .includes("modulepreload");
}

export function stripModulePreloadLinks(html: string) {
  let strippedLinkCount = 0;
  const nextHtml = html.replace(linkTagPattern, (linkTag) => {
    if (!isModulePreloadLink(linkTag)) {
      return linkTag;
    }

    strippedLinkCount += 1;
    return "";
  });

  if (modulePreloadTextPattern.test(nextHtml)) {
    throw new Error("Failed to strip every modulepreload reference from public prerender HTML.");
  }

  return {
    html: nextHtml,
    strippedLinkCount,
  };
}

function readPrerenderHtmlFilePath(page: PublicPrerenderPage) {
  const htmlOutputPath = readCloudflarePrerenderHtmlOutputPath(page);
  const htmlFilePath = path.resolve(clientDistDir, htmlOutputPath.slice(1));
  const relativePath = path.relative(clientDistDir, htmlFilePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Prerender output path escapes dist/client: ${htmlOutputPath}`);
  }

  return htmlFilePath;
}

function stripModulePreloads(filePath: string) {
  const currentHtml = readFileSync(filePath, "utf8");
  const result = stripModulePreloadLinks(currentHtml);

  if (result.html !== currentHtml) {
    writeFileSync(filePath, result.html, "utf8");
  }

  return result.strippedLinkCount;
}

export async function stripPublicPrerenderModulePreloads() {
  let strippedLinkCount = 0;

  for (const page of await loadPublicPrerenderPages()) {
    strippedLinkCount += stripModulePreloads(readPrerenderHtmlFilePath(page));
  }

  console.log(`Stripped ${strippedLinkCount} public prerender modulepreload links.`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await stripPublicPrerenderModulePreloads();
}
