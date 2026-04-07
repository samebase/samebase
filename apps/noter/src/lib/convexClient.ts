import { ConvexReactClient } from "convex/react";

const convexUrl = __DAYTONA_CONVEX_PROXY_PATH__
  ? new URL(__DAYTONA_CONVEX_PROXY_PATH__, window.location.origin).toString()
  : import.meta.env.VITE_CONVEX_URL;

if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL in environment");
}

export const client = new ConvexReactClient(convexUrl);
