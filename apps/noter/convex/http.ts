import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { finishConvexOAuth, startConvexOAuth } from "./convexOAuth";
import { finishNetlifyOAuthCallback, startNetlifyOAuth } from "./netlifyOAuth";

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
  path: "/oauth/netlify/start",
  method: "GET",
  handler: startNetlifyOAuth,
});

http.route({
  path: "/oauth/netlify/callback",
  method: "GET",
  handler: finishNetlifyOAuthCallback,
});

export default http;
