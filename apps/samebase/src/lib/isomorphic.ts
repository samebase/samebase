import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export function readBrowserOrigin(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.origin;
}

/**
The origin of a server render: the forwarded host and protocol when a proxy or the build's prerender
(vite.config.ts) sends them, else the request's own. It reads the headers itself because
`getRequestUrl({ xForwardedHost: true })` assigns `url.host`, which Convex's URL does not implement.
*/
function readServerRequestOrigin(): string {
  const request = getRequest();
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProtocol === "https" || forwardedProtocol === "http"
      ? forwardedProtocol
      : url.protocol.slice(0, -1);
  return `${protocol}://${forwardedHost || url.host}`;
}

const readTanStackRequestOrigin = createIsomorphicFn()
  .client(() => window.location.origin)
  .server(readServerRequestOrigin);

/**
 * Returns the current origin in browser renders and server request renders.
 */
export function readIsomorphicOrigin(): string {
  const origin: unknown = readTanStackRequestOrigin();
  if (typeof origin === "string" && origin.length > 0) {
    return origin;
  }

  const browserOrigin = readBrowserOrigin();
  if (browserOrigin) {
    return browserOrigin;
  }

  throw new Error("Expected browser or request origin.");
}
