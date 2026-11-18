// `handle(request)`: the core of the broker as one function from a Web `Request` to a `Response`.
// A table routes method and path; the issuer's path prefix comes first in every path but the RFC
// 8414 metadata path, which carries the prefix after its well-known part.
import { Effect, Logger } from "effect";
import type { Store } from "../store/Store.ts";
import type { CommandFailed } from "./command.ts";
import type { ProviderUnavailable } from "./connectors/upstream.ts";
import { json } from "./responses.ts";
import { HubConfig, type Fetch, type Keys, type Random } from "./services.ts";
import {
  authorize,
  continueSignIn,
  discovery,
  jwks,
  token,
  upstreamCallback,
  userinfo,
} from "./signIn.ts";

export type CoreServices = Store | HubConfig | Keys | Random | Fetch;

/** The failures a route leaves to the router: each answers 500 and writes one log line. */
export type RouteError = CommandFailed | ProviderUnavailable;

export type Route = {
  readonly method: "GET" | "POST" | "DELETE" | "PUT";
  /** After the issuer's path prefix: "/register" (exact) or "/register/" (prefix). */
  readonly path: string;
  readonly match: "exact" | "prefix";
  /** The route's name in a log line, such as "/register/{client}". Never the request's path. */
  readonly template: string;
  readonly handler: (request: Request) => Effect.Effect<Response, RouteError, CoreServices>;
};

/** A route of the table, with its full path. */
type Mounted = Route & { readonly fullPath: string };

/**
 * The hub's logger: one JSON object per line, on the console method of the entry's level, which is
 * what Workers Logs indexes. An entry holds its message, level, time, fiber, log spans and
 * annotations, and its cause only when one is logged; the hub logs no cause.
 */
export const hubLogger = Logger.layer([Logger.withLeveledConsole(Logger.formatJson)]);

/**
 * The one log line of a request that failed, then the bare 500: the route template, the command
 * that failed if a command did, and the category, as annotations. Never a URL, a query, a header
 * value, an error's text or a cause: a callback URL carries the provider's code and state, and a
 * command's error can echo its input.
 */
const serverError = (annotations: {
  readonly route: string;
  readonly command?: string;
  readonly category: "command_failed" | "provider_unavailable" | "defect";
}) =>
  Effect.logError("hub_error").pipe(
    Effect.annotateLogs(annotations),
    Effect.map(() => json({ error: "server_error" }, 500)),
  );

/**
 * The broker's request handler. `registerRoutes` are the hub mode's routes (src/core/hub), mounted
 * only when `HubConfig.registration` is set.
 */
export function makeHandle(options: { readonly registerRoutes: ReadonlyArray<Route> }) {
  return Effect.fn("handle")(function* (request: Request) {
    const hub = yield* HubConfig;
    const at = (route: Route): Mounted => ({ ...route, fullPath: `${hub.prefix}${route.path}` });
    const routes: Mounted[] = [
      at({
        method: "GET",
        path: "/.well-known/openid-configuration",
        match: "exact",
        template: "/.well-known/openid-configuration",
        handler: discovery,
      }),
      {
        method: "GET",
        path: "/.well-known/oauth-authorization-server",
        fullPath: `/.well-known/oauth-authorization-server${hub.prefix}`,
        match: "exact",
        template: "/.well-known/oauth-authorization-server",
        handler: discovery,
      },
      at({
        method: "GET",
        path: "/.well-known/jwks.json",
        match: "exact",
        template: "/.well-known/jwks.json",
        handler: jwks,
      }),
      at({
        method: "GET",
        path: "/authorize",
        match: "exact",
        template: "/authorize",
        handler: authorize,
      }),
      at({
        method: "POST",
        path: "/authorize",
        match: "exact",
        template: "/authorize",
        handler: authorize,
      }),
      at({
        method: "GET",
        path: "/continue",
        match: "exact",
        template: "/continue",
        handler: continueSignIn,
      }),
      at({ method: "POST", path: "/token", match: "exact", template: "/token", handler: token }),
      at({
        method: "GET",
        path: "/userinfo",
        match: "exact",
        template: "/userinfo",
        handler: userinfo,
      }),
      at({
        method: "POST",
        path: "/userinfo",
        match: "exact",
        template: "/userinfo",
        handler: userinfo,
      }),
      ...hub.connectors.map((connector) =>
        at({
          method: "GET",
          path: `/connectors/${connector.name}/callback`,
          match: "exact",
          template: `/connectors/${connector.name}/callback`,
          handler: upstreamCallback(connector),
        }),
      ),
      ...(hub.registration === undefined ? [] : options.registerRoutes.map(at)),
    ];
    const { pathname } = new URL(request.url);
    // An exact path wins over a prefix, and a longer prefix over a shorter one, as in Convex's
    // HTTP router.
    const route =
      routes.find(
        (candidate) =>
          candidate.match === "exact" &&
          candidate.method === request.method &&
          candidate.fullPath === pathname,
      ) ??
      routes
        .filter(
          (candidate) =>
            candidate.match === "prefix" &&
            candidate.method === request.method &&
            pathname.startsWith(candidate.fullPath),
        )
        .sort((a, b) => b.fullPath.length - a.fullPath.length)[0];
    if (route === undefined) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return yield* route.handler(request).pipe(
      Effect.catchTags({
        CommandFailed: (error) =>
          serverError({
            route: route.template,
            command: error.command,
            category: "command_failed",
          }),
        ProviderUnavailable: () =>
          serverError({ route: route.template, category: "provider_unavailable" }),
      }),
      Effect.catchCause(() => serverError({ route: route.template, category: "defect" })),
    );
  });
}
