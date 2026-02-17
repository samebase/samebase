import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { finishConvexOAuth, startConvexOAuth } from "./convexOAuth";

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

export default http;
