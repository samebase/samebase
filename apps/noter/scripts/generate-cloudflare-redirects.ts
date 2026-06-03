import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

export const GENERATED_REDIRECTS_START_TAG = "# @noter-md/cloudflare-prerender-redirects:start";
export const GENERATED_REDIRECTS_END_TAG = "# @noter-md/cloudflare-prerender-redirects:end";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const defaultRedirectsFilePath = path.resolve(currentDir, "../public/_redirects");
const CLOUDFLARE_STATIC_REDIRECT_RULE_LIMIT = 2_000;
const CLOUDFLARE_STATIC_REDIRECT_RULE_LENGTH_LIMIT = 1_000;
const unsupportedRedirectPathCharacterPattern = /[\s*:#?$]/;

export type PublicPrerenderPage = {
  path: string;
  prerender: {
    enabled: true;
    outputPath?: string;
  };
};

type CloudflareRedirectRule = {
  destination: string;
  source: string;
  status: 200;
};

type ParsedRedirectRule = {
  destination: string;
  line: string;
  lineNumber: number;
  source: string;
  status: string | undefined;
};

type PublicPrerenderPagesModule = {
  readPublicPrerenderPages: () => PublicPrerenderPage[];
};

function isPublicPrerenderPage(value: unknown): value is PublicPrerenderPage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const pathValue = Reflect.get(value, "path");
  const prerender = Reflect.get(value, "prerender");
  if (typeof pathValue !== "string" || typeof prerender !== "object" || prerender === null) {
    return false;
  }

  const outputPath = Reflect.get(prerender, "outputPath");
  return (
    Reflect.get(prerender, "enabled") === true &&
    (outputPath === undefined || typeof outputPath === "string")
  );
}

function isPublicPrerenderPagesModule(value: unknown): value is PublicPrerenderPagesModule {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return typeof Reflect.get(value, "readPublicPrerenderPages") === "function";
}

async function loadPublicPrerenderPages() {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "error",
    root: appDir,
    server: {
      middlewareMode: true,
    },
  });

  try {
    const module = await server.ssrLoadModule("/dev/publicPrerenderPages.ts");
    if (!isPublicPrerenderPagesModule(module)) {
      throw new Error("Expected dev/publicPrerenderPages.ts to export readPublicPrerenderPages.");
    }

    const pages = module.readPublicPrerenderPages();
    for (const page of pages) {
      if (!isPublicPrerenderPage(page)) {
        throw new Error("Expected readPublicPrerenderPages to return public prerender pages.");
      }
    }

    return pages;
  } finally {
    await server.close();
  }
}

function assertRedirectPath(label: string, value: string) {
  if (!value.startsWith("/")) {
    throw new Error(`${label} must be root-relative: ${value}`);
  }
  if (unsupportedRedirectPathCharacterPattern.test(value)) {
    throw new Error(`${label} cannot include whitespace, wildcards, params, queries, or hashes.`);
  }
}

function assertRoutePath(routePath: string) {
  assertRedirectPath("Prerender route path", routePath);
  if (routePath !== "/" && routePath.endsWith("/")) {
    throw new Error(`Prerender route path must not include a trailing slash: ${routePath}`);
  }
}

function readHtmlOutputPath(page: PublicPrerenderPage) {
  if (page.path === "/" && !page.prerender.outputPath) {
    throw new Error(
      "The root prerender page must set outputPath because Cloudflare SPA mode owns /index.html.",
    );
  }

  const outputPath = page.prerender.outputPath ?? `${page.path}/index.html`;
  const htmlOutputPath = outputPath.endsWith(".html") ? outputPath : `${outputPath}.html`;

  assertRedirectPath("Prerender output path", htmlOutputPath);
  if (htmlOutputPath === "/index.html") {
    throw new Error(
      "Prerender pages must not output /index.html because Cloudflare SPA mode serves that file for unknown app routes.",
    );
  }

  return htmlOutputPath;
}

function createRedirectAliases(routePath: string) {
  assertRoutePath(routePath);
  if (routePath === "/") {
    return ["/"];
  }

  return [routePath, `${routePath}/`, `${routePath}/index.html`];
}

export function createCloudflarePrerenderRedirectRules(
  pages: readonly PublicPrerenderPage[],
): CloudflareRedirectRule[] {
  const rules: CloudflareRedirectRule[] = [];
  const sources = new Set<string>();

  for (const page of pages) {
    const destination = readHtmlOutputPath(page);

    for (const source of createRedirectAliases(page.path)) {
      if (sources.has(source)) {
        throw new Error(`Duplicate Cloudflare prerender redirect source: ${source}`);
      }

      sources.add(source);
      rules.push({ destination, source, status: 200 });
    }
  }

  if (rules.length > CLOUDFLARE_STATIC_REDIRECT_RULE_LIMIT) {
    throw new Error(
      `Generated ${rules.length} Cloudflare redirects, above the static rule limit of ${CLOUDFLARE_STATIC_REDIRECT_RULE_LIMIT}.`,
    );
  }

  return rules;
}

function formatRedirectRule(rule: CloudflareRedirectRule) {
  assertRedirectPath("Cloudflare redirect source", rule.source);
  assertRedirectPath("Cloudflare redirect destination", rule.destination);

  const line = `${rule.source} ${rule.destination} ${rule.status}`;
  if (line.length > CLOUDFLARE_STATIC_REDIRECT_RULE_LENGTH_LIMIT) {
    throw new Error(
      `Cloudflare redirect rule is ${line.length} characters, above the ${CLOUDFLARE_STATIC_REDIRECT_RULE_LENGTH_LIMIT} character limit: ${line}`,
    );
  }

  return line;
}

function readRedirectRules(contents: string) {
  const rules: ParsedRedirectRule[] = [];
  const lines = contents.replace(/\r\n/g, "\n").split("\n");

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return;
    }

    const parts = trimmedLine.split(/\s+/);
    const source = parts[0];
    const destination = parts[1];
    const status = parts[2];
    if (!source || !destination || parts.length > 3) {
      throw new Error(`Invalid Cloudflare redirect rule on line ${index + 1}: ${line}`);
    }

    rules.push({
      destination,
      line,
      lineNumber: index + 1,
      source,
      status,
    });
  });

  return rules;
}

function validateCloudflareRedirectsFile(contents: string) {
  const rules = readRedirectRules(contents);
  const sources = new Set<string>();

  if (rules.length > CLOUDFLARE_STATIC_REDIRECT_RULE_LIMIT) {
    throw new Error(
      `Found ${rules.length} Cloudflare redirects, above the static rule limit of ${CLOUDFLARE_STATIC_REDIRECT_RULE_LIMIT}.`,
    );
  }

  for (const rule of rules) {
    assertRedirectPath(`Cloudflare redirect source on line ${rule.lineNumber}`, rule.source);

    if (rule.line.length > CLOUDFLARE_STATIC_REDIRECT_RULE_LENGTH_LIMIT) {
      throw new Error(
        `Cloudflare redirect rule on line ${rule.lineNumber} is ${rule.line.length} characters, above the ${CLOUDFLARE_STATIC_REDIRECT_RULE_LENGTH_LIMIT} character limit.`,
      );
    }

    if (sources.has(rule.source)) {
      throw new Error(
        `Duplicate Cloudflare redirect source on line ${rule.lineNumber}: ${rule.source}`,
      );
    }
    sources.add(rule.source);

    if (rule.status === "200" && rule.destination === "/index.html") {
      throw new Error(
        `Cloudflare redirect rule on line ${rule.lineNumber} must not proxy to /index.html because Cloudflare SPA mode owns that shell.`,
      );
    }
  }
}

export function createCloudflarePrerenderRedirectsBlock(pages: readonly PublicPrerenderPage[]) {
  const rules = createCloudflarePrerenderRedirectRules(pages);

  return [
    "# Generated by pnpm run generate:cloudflare-redirects.",
    "# Cloudflare SPA mode serves /index.html for unknown app routes, so",
    "# the SPA shell owns that file. These exact aliases expose prerendered",
    "# public pages without catching hashed assets.",
    "",
    ...rules.map(formatRedirectRule),
  ].join("\n");
}

function findMarkerLine(args: { lines: readonly string[]; marker: string }) {
  let markerLine: number | null = null;

  for (const [index, line] of args.lines.entries()) {
    if (line.trim() !== args.marker) {
      continue;
    }
    if (markerLine !== null) {
      throw new Error(`Expected exactly one ${args.marker} marker in public/_redirects.`);
    }

    markerLine = index;
  }

  if (markerLine === null) {
    throw new Error(`Missing ${args.marker} marker in public/_redirects.`);
  }

  return markerLine;
}

export function replaceGeneratedCloudflareRedirectsBlock(args: {
  contents: string;
  generatedBlock: string;
}) {
  const normalizedContents = args.contents.replace(/\r\n/g, "\n");
  const lines = normalizedContents.split("\n");
  const startLine = findMarkerLine({ lines, marker: GENERATED_REDIRECTS_START_TAG });
  const endLine = findMarkerLine({ lines, marker: GENERATED_REDIRECTS_END_TAG });

  if (startLine >= endLine) {
    throw new Error("The Cloudflare redirects start marker must come before the end marker.");
  }

  const nextContents = [
    ...lines.slice(0, startLine + 1),
    ...args.generatedBlock.split("\n"),
    ...lines.slice(endLine),
  ].join("\n");
  validateCloudflareRedirectsFile(nextContents);

  return nextContents.endsWith("\n") ? nextContents : `${nextContents}\n`;
}

export function generateCloudflareRedirectsFile(args: {
  pages: readonly PublicPrerenderPage[];
  redirectsFilePath: string;
}) {
  const currentContents = readFileSync(args.redirectsFilePath, "utf8");
  const generatedBlock = createCloudflarePrerenderRedirectsBlock(args.pages);
  const nextContents = replaceGeneratedCloudflareRedirectsBlock({
    contents: currentContents,
    generatedBlock,
  });

  if (currentContents === nextContents) {
    return;
  }

  writeFileSync(args.redirectsFilePath, nextContents, "utf8");
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  generateCloudflareRedirectsFile({
    pages: await loadPublicPrerenderPages(),
    redirectsFilePath: defaultRedirectsFilePath,
  });
}
