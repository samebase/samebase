import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

export function readBrowserOrigin(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.origin;
}

const readTanStackRequestOrigin = createIsomorphicFn()
  .client(() => window.location.origin)
  .server(() => getRequestUrl({ xForwardedHost: true, xForwardedProto: true }).origin);

/**
 * Returns the current origin in browser renders and server request renders.
 */
export function readIsomorphicOrigin(): string {
  const browserOrigin = readBrowserOrigin();
  if (browserOrigin) {
    return browserOrigin;
  }

  const origin: unknown = readTanStackRequestOrigin();
  if (typeof origin === "string" && origin.length > 0) {
    return origin;
  }

  throw new Error("Expected browser or request origin.");
}
