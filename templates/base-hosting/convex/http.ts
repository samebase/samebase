import { httpRouter } from "convex/server";
import { routeAll } from "@samebase/convex-hosting";
import { components } from "./_generated/api";
import { versionId } from "../.convex-hosting/version.js";
// Type only, nothing is bundled: the server build imported below.
import type {} from "@samebase/convex-hosting-tanstack-start/server-build";
import server from "../dist/server/server.js";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

// Every method, every path that the Convex Auth routes above do not answer, as a Cloudflare Worker
// with static assets: a file of the build, else the page that src/server.ts renders. Convex Auth
// keeps the session in the browser, so the server renders signed out. `pnpm run deploy` writes the
// build and .convex-hosting/version.js.
routeAll(http, components.hosting, versionId, server);

export default http;
