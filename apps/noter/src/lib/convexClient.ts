import { ConvexReactClient } from "convex/react";

const daytonaConvexProxyPath =
  typeof __DAYTONA_CONVEX_PROXY_PATH__ === "undefined"
    ? null
    : __DAYTONA_CONVEX_PROXY_PATH__;
const fallbackConvexUrl =
  import.meta.env.MODE === "test" ? "http://127.0.0.1:3210" : null;

const convexUrl = daytonaConvexProxyPath
  ? new URL(daytonaConvexProxyPath, window.location.origin).toString()
  : import.meta.env.VITE_CONVEX_URL ?? fallbackConvexUrl;

if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL in environment");
}

export const client = new ConvexReactClient(convexUrl);
