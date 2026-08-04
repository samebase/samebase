import { ConvexReactClient } from "convex/react";
import { readBrowserOrigin } from "@/lib/isomorphic";
import { appBuildConfig } from "@/lib/appBuildConfig";

const browserConvexProxyPath = appBuildConfig.browserConvexProxyPath;
const fallbackConvexUrl = import.meta.env.MODE === "test" ? "http://127.0.0.1:3210" : null;

function readBrowserConvexProxyUrl(proxyPath: string): string | null {
  const browserOrigin = readBrowserOrigin();
  if (!browserOrigin) {
    return null;
  }

  return new URL(proxyPath, browserOrigin).toString();
}

// Prefer the browser proxy when Vite exposes one for public dev origins, then
// the normal app env var, then the local Vitest fallback for route imports.
const convexUrl = browserConvexProxyPath
  ? (readBrowserConvexProxyUrl(browserConvexProxyPath) ??
    import.meta.env["VITE_CONVEX_URL"] ??
    fallbackConvexUrl)
  : (import.meta.env["VITE_CONVEX_URL"] ?? fallbackConvexUrl);

if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL in environment");
}

export const client = new ConvexReactClient(convexUrl, {
  // Convex mutations sync continuously; a broad pending-request unload prompt
  // makes ordinary tab closes feel unsafe even when app state is recoverable.
  unsavedChangesWarning: false,
});
