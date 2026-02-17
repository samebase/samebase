import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { finishConvexOAuth, startConvexOAuth } from "./convexOAuth";
import {
  finishCloudflareOAuth,
  startCloudflareOAuth,
} from "./cloudflareOAuth";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/oauth/convex/start",
  method: "GET",
  handler: startConvexOAuth,
});

http.route({
  path: "/oauth/convex/callback",
  method: "GET",
  handler: finishConvexOAuth,
});

http.route({
  path: "/oauth/cloudflare/start",
  method: "GET",
  handler: startCloudflareOAuth,
});

http.route({
  path: "/oauth/cloudflare/callback",
  method: "GET",
  handler: finishCloudflareOAuth,
});

export default http;
