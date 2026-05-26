import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Rewrites the SPA fallback with full `/` HTML from the built server entry.
 * Keep this filename stable: package scripts call it directly after `vp build`.
 */

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, "..");
const defaultClientIndexPath = path.resolve(appRoot, "dist/client/index.html");
const defaultServerEntryPath = path.resolve(appRoot, "dist/server/server.js");
const defaultRequestUrl = "http://127.0.0.1/";

export type FetchHandler = {
  fetch: (request: Request) => Promise<Response> | Response;
};

type PrerenderSpaIndexLog = (message: string) => void;

function hasUnknownProperty<Key extends string>(
  value: unknown,
  key: Key,
): value is { [Property in Key]: unknown } {
  return typeof value === "object" && value !== null && key in value;
}

function isFetchHandler(value: unknown): value is FetchHandler {
  return hasUnknownProperty(value, "fetch") && typeof value.fetch === "function";
}

export async function importServerFetchHandler(serverEntryPath: string): Promise<FetchHandler> {
  const serverModule: unknown = await import(pathToFileURL(serverEntryPath).href);
  if (!hasUnknownProperty(serverModule, "default") || !isFetchHandler(serverModule.default)) {
    throw new Error(`Built server entry does not export a fetch handler: ${serverEntryPath}`);
  }

  return serverModule.default;
}

export async function renderSpaIndexHtml(
  fetchHandler: FetchHandler,
  request: Request,
): Promise<string> {
  const response = await fetchHandler.fetch(request);
  if (!response.ok) {
    throw new Error(`Failed to prerender SPA index: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("text/html")) {
    throw new Error(`Failed to prerender SPA index: expected HTML, received ${contentType}`);
  }

  return await response.text();
}

export async function prerenderSpaIndex(args: {
  clientIndexPath: string;
  log: PrerenderSpaIndexLog;
  requestUrl: string;
  serverEntryPath: string;
}): Promise<void> {
  const previousShellEnv = process.env.TSS_SHELL;

  try {
    // TanStack Start reads this at module import time; clearing it makes the built server render
    // full route HTML instead of the minimal SPA shell artifact.
    delete process.env.TSS_SHELL;
    args.log(`Importing server entry: ${args.serverEntryPath}`);
    const fetchHandler = await importServerFetchHandler(args.serverEntryPath);
    args.log(`Rendering SPA index from ${args.requestUrl}`);
    const html = await renderSpaIndexHtml(fetchHandler, new Request(args.requestUrl));
    await writeFile(args.clientIndexPath, html, "utf8");
    args.log(`Wrote ${args.clientIndexPath} (${html.length} bytes)`);
  } finally {
    if (previousShellEnv === undefined) {
      delete process.env.TSS_SHELL;
    } else {
      process.env.TSS_SHELL = previousShellEnv;
    }
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await prerenderSpaIndex({
    clientIndexPath: defaultClientIndexPath,
    log: (message) => console.log(`[prerender-spa-index] ${message}`),
    requestUrl: defaultRequestUrl,
    serverEntryPath: defaultServerEntryPath,
  });
}
