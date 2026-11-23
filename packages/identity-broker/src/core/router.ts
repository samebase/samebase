// `handle(request)`: the core of the broker as one function from a Web `Request` to a `Response`.
// A table routes method and path; the issuer's path prefix comes first in every path but the RFC
// 8414 metadata path, which carries the prefix after its well-known part.
import { Effect, Logger } from "effect";
import type { Store } from "../store/Store.ts";
import type { CommandFailed } from "./command.ts";
import type { ProviderUnavailable } from "./connectors/upstream.ts";
import { json, readParameters } from "./responses.ts";
import type { GateNamespace } from "../rules/schemas.ts";
import {
  HubConfig,
  LiveGates,
  type Fetch,
  type Keys,
  type Random,
  type SignInPage,
} from "./services.ts";
import {
  authorize,
  continueSignIn,
  discovery,
  jwks,
  token,
  upstreamCallback,
  userinfo,
  type Metadata,
} from "./signIn.ts";

export type CoreServices = Store | HubConfig | SignInPage | Keys | Random | Fetch;

/** The failures a route leaves to the router: each answers 500 and writes one log line. */
export type RouteError = CommandFailed | ProviderUnavailable;

/** A route of the core, or of a layer whose handlers also need its own services `R`. */
export type Route<R = never> = {
  readonly method: "GET" | "POST" | "DELETE" | "PUT";
  /** After the issuer's path prefix: "/register" (exact) or "/register/" (prefix). */
  readonly path: string;
  readonly match: "exact" | "prefix";
  /** The route's name in a log line, such as "/register/{client}". Never the request's path. */
  readonly template: string;
  readonly handler: (request: Request) => Effect.Effect<Response, RouteError, CoreServices | R>;
};

/** What the one registration layer of a hub gives it, from that layer's module. */
export type Registration<R = never> = {
  readonly routes: ReadonlyArray<Route<R>>;
  /** The gate namespaces that the layer owns, read in each request. Absent: it owns none. */
  readonly liveGates?: Effect.Effect<ReadonlyArray<GateNamespace>>;
};

/** A registration layer where strangers register, so `hub(options)` needs the hub's `service`. */
export type PublicRegistration<R = never> = Registration<R> & { readonly public: true };

/** What a handler of a part needs: the core's services and the live gates of the request. */
type PartEffect<A> = Effect.Effect<A, RouteError, CoreServices | LiveGates>;

/**
 * An optional part of the hub beside sign-in, such as connections (src/connections/). The router
 * sends a request to it with one check at the top of `/authorize` and `/token`; the core's
 * sign-in code knows nothing of it.
 */
export type Part = {
  /** The part's own routes, such as its callbacks. */
  readonly routes: ReadonlyArray<Route<LiveGates>>;
  /** `/authorize` with a `resource` parameter (RFC 8707). */
  readonly authorize: (request: Request, params: URLSearchParams) => PartEffect<Response>;
  /** `/token`: the part's answer, or undefined when the request is the core's. */
  readonly token: (request: Request, params: URLSearchParams) => PartEffect<Response | undefined>;
  /** The discovery document with the part's fields. */
  readonly metadata: (document: Metadata) => object;
};

/** A route of the table, with its full path. The core's sign-in routes read `LiveGates`. */
type Mounted<R> = Route<R | LiveGates> & { readonly fullPath: string };

/**
 * The parameters of a request, read from a copy: the body of a request can be read once, and the
 * handler that answers reads it again.
 */
const peekParameters = (request: Request) => Effect.promise(() => readParameters(request.clone()));

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
export const serverError = (annotations: {
  readonly route?: string;
  readonly command?: string;
  readonly category: "command_failed" | "provider_unavailable" | "defect" | "start_failed";
}) =>
  Effect.logError("hub_error").pipe(
    Effect.annotateLogs(annotations),
    Effect.map(() => json({ error: "server_error" }, 500)),
  );

/**
 * The broker's request handler. `registration` is the layer that the hub mounts: its routes, such
 * as the client registration endpoint, beside the core's sign-in routes, and its live gates.
 * `part` is an optional part of the hub, such as connections; without it the hub has none of its
 * routes.
 */
export function makeHandle<R = never>(registration: Registration<R>, part?: Part) {
  // RFC 7591: a mounted `POST /register` is the registration endpoint that discovery names.
  const metadata = discovery({
    registration: registration.routes.some(
      (route) => route.method === "POST" && route.path === "/register" && route.match === "exact",
    ),
    extend: part?.metadata ?? ((document) => document),
  });
  const liveGates = LiveGates.of({ read: registration.liveGates ?? Effect.succeed([]) });
  /** `/authorize`: a request with `resource` goes to the part, when the hub has one. */
  const authorizeRoute =
    part === undefined
      ? authorize
      : (request: Request) =>
          Effect.gen(function* () {
            const params = yield* peekParameters(request);
            return params !== null && params.has("resource")
              ? yield* part.authorize(request, params)
              : yield* authorize(request);
          });
  /** `/token`: the part answers its own grants first, when the hub has one. */
  const tokenRoute =
    part === undefined
      ? token
      : (request: Request) =>
          Effect.gen(function* () {
            const params = yield* peekParameters(request);
            const answer = params === null ? undefined : yield* part.token(request, params);
            return answer ?? (yield* token(request));
          });
  return Effect.fn("handle")(function* (request: Request) {
    const hub = yield* HubConfig;
    const at = (route: Route<R | LiveGates>): Mounted<R> => ({
      ...route,
      fullPath: `${hub.prefix}${route.path}`,
    });
    const routes: Mounted<R>[] = [
      at({
        method: "GET",
        path: "/.well-known/openid-configuration",
        match: "exact",
        template: "/.well-known/openid-configuration",
        handler: metadata,
      }),
      {
        method: "GET",
        path: "/.well-known/oauth-authorization-server",
        fullPath: `/.well-known/oauth-authorization-server${hub.prefix}`,
        match: "exact",
        template: "/.well-known/oauth-authorization-server",
        handler: metadata,
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
        handler: authorizeRoute,
      }),
      at({
        method: "POST",
        path: "/authorize",
        match: "exact",
        template: "/authorize",
        handler: authorizeRoute,
      }),
      at({
        method: "GET",
        path: "/continue",
        match: "exact",
        template: "/continue",
        handler: continueSignIn,
      }),
      at({
        method: "POST",
        path: "/token",
        match: "exact",
        template: "/token",
        handler: tokenRoute,
      }),
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
      ...(part?.routes ?? []).map(at),
      ...registration.routes.map(at),
    ];
    const { pathname } = new URL(request.url);
    // HEAD runs the GET route and loses the body, as in Convex's HTTP router.
    const head = request.method === "HEAD";
    const method = head ? "GET" : request.method;
    // An exact path wins over a prefix, and a longer prefix over a shorter one, as in Convex's
    // HTTP router.
    const route =
      routes.find(
        (candidate) =>
          candidate.match === "exact" &&
          candidate.method === method &&
          candidate.fullPath === pathname,
      ) ??
      routes
        .filter(
          (candidate) =>
            candidate.match === "prefix" &&
            candidate.method === method &&
            pathname.startsWith(candidate.fullPath),
        )
        .sort((a, b) => b.fullPath.length - a.fullPath.length)[0];
    if (route === undefined) {
      return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const response = yield* route.handler(request).pipe(
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
      Effect.provideService(LiveGates, liveGates),
    );
    return head ? new Response(null, response) : response;
  });
}
