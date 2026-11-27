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
  BrokerConfig,
  BrokerConfigError,
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

export type CoreServices = Store | BrokerConfig | SignInPage | Keys | Random | Fetch;

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

/**
 * Why a layer's resolver refuses a client at `/authorize`. The broker answers with its own error
 * page and never sends the user to the app: `invalid` (400, naming `invalid_client`), `unavailable`
 * (503, with `Retry-After` in seconds when given) and `rate_limited` (429).
 */
export type ClientRefusal =
  | { readonly reason: "invalid"; readonly description: string }
  | { readonly reason: "unavailable"; readonly retryAfter?: number }
  | { readonly reason: "rate_limited" };

/**
 * A layer's resolver of a client id that is an https address, called at `/authorize` after the
 * checks of the request and before the card is read. It gives undefined when the card of
 * `clientId` is stored and may be read, or a refusal. `clientId` is as the client sent it.
 */
export type ClientResolver = (request: {
  readonly clientId: string;
  readonly redirectUri: string;
}) => Effect.Effect<ClientRefusal | undefined, RouteError, CoreServices>;

/** What a registration layer gives the broker, from that layer's module. */
export type Registration<R = never> = {
  readonly routes: ReadonlyArray<Route<R>>;
  /** The gate namespaces that the layer owns, read in each request. Absent: it owns none. */
  readonly liveGates?: Effect.Effect<ReadonlyArray<GateNamespace>>;
  /** The layer's clients whose id is an https address. Absent: the broker has no such client. */
  readonly resolveClient?: ClientResolver;
  /** Strangers use the layer, so the broker needs its `service` settings. */
  readonly public?: true;
};

/** A registration layer where strangers register, so `identityBroker(options)` needs the broker's `service`. */
export type PublicRegistration<R = never> = Registration<R> & { readonly public: true };

/** A registration layer that no stranger uses: a broker with only such layers needs no `service`. */
export type PrivateRegistration<R = never> = Registration<R> & { readonly public?: never };

/** What a handler of a part needs: the core's services and the live gates of the request. */
type PartEffect<A> = Effect.Effect<A, RouteError, CoreServices | LiveGates>;

/**
 * An optional part of the broker beside sign-in, such as integrations (src/integrations/). The router
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
 * The broker's logger: one JSON object per line, on the console method of the entry's level, which is
 * what Workers Logs indexes. An entry holds its message, level, time, fiber, log spans and
 * annotations, and its cause only when one is logged; the broker logs no cause.
 */
export const brokerLogger = Logger.layer([Logger.withLeveledConsole(Logger.formatJson)]);

/**
 * The one log line of a request that failed, then the bare 500: the route template, the command
 * that failed if a command did, and the category, as annotations. Never a URL, a query, a header
 * value, an error's text or a cause: a callback URL carries the provider's code and state, and a
 * command's error can echo its input. `reason` is a fixed code for `start_failed`, never error text.
 */
export const serverError = (annotations: {
  readonly route?: string;
  readonly command?: string;
  readonly category: "command_failed" | "provider_unavailable" | "defect" | "start_failed";
  readonly reason?: "invalid_config" | "missing_config" | "secret_failed" | "defect";
}) =>
  Effect.logError("broker_error").pipe(
    Effect.annotateLogs(annotations),
    Effect.map(() => json({ error: "server_error" }, 500)),
  );

/**
 * The broker's request handler, made once at start from the broker's configuration.
 * `registration` is the layer, or the layers, that the broker mounts: their routes, such as the
 * client registration endpoint, beside the core's sign-in routes, their live gates, and at most one
 * resolver. `part` is an optional part of the broker, such as integrations; without it the broker
 * has none of its routes. It fails when two routes have the same method, path and match, when two
 * layers have a resolver, and when a layer is public and the broker has no `service`.
 */
export const makeHandle = Effect.fnUntraced(function* <R = never>(
  registration: Registration<R> | ReadonlyArray<Registration<R>>,
  part?: Part,
) {
  const broker = yield* BrokerConfig;
  const layers: ReadonlyArray<Registration<R>> = Array.isArray(registration)
    ? registration
    : [registration];
  const resolvers = layers.flatMap((layer) =>
    layer.resolveClient === undefined ? [] : [layer.resolveClient],
  );
  const [resolveClient, ...otherResolvers] = resolvers;
  if (otherResolvers.length > 0) {
    return yield* new BrokerConfigError({ message: "Only one registration layer may resolve" });
  }
  if (broker.service === undefined && layers.some((layer) => layer.public === true)) {
    return yield* new BrokerConfigError({
      message: "A public registration layer needs the broker's service settings",
    });
  }
  const layerRoutes = layers.flatMap((layer) => layer.routes);
  const metadata = discovery({
    // RFC 7591: a mounted `POST /register` is the registration endpoint that discovery names.
    registration: layerRoutes.some(
      (route) => route.method === "POST" && route.path === "/register" && route.match === "exact",
    ),
    publicClients: resolveClient !== undefined,
    extend: part?.metadata ?? ((document) => document),
  });
  const liveGates = LiveGates.of({
    read: Effect.map(
      Effect.forEach(layers, (layer) => layer.liveGates ?? Effect.succeed([])),
      (each) => each.flat(),
    ),
  });
  const authorizeCore = (request: Request) => authorize(request, resolveClient);
  const tokenCore = (request: Request) => token(request, resolveClient !== undefined);
  /**
   * `/authorize`: a HEAD stores nothing and calls no resolver. A request with `resource` goes to
   * the part, when the broker has one.
   */
  const authorizeRoute = (request: Request) =>
    Effect.gen(function* () {
      if (request.method === "HEAD") {
        return new Response(null, {
          status: 405,
          headers: { Allow: "GET, POST", "Cache-Control": "no-store" },
        });
      }
      if (part === undefined) {
        return yield* authorizeCore(request);
      }
      const params = yield* peekParameters(request);
      return params !== null && params.has("resource")
        ? yield* part.authorize(request, params)
        : yield* authorizeCore(request);
    });
  /** `/token`: the part answers its own grants first, when the broker has one. */
  const tokenRoute =
    part === undefined
      ? tokenCore
      : (request: Request) =>
          Effect.gen(function* () {
            const params = yield* peekParameters(request);
            const answer = params === null ? undefined : yield* part.token(request, params);
            return answer ?? (yield* tokenCore(request));
          });
  const at = (route: Route<R | LiveGates>): Mounted<R> => ({
    ...route,
    fullPath: `${broker.prefix}${route.path}`,
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
      fullPath: `/.well-known/oauth-authorization-server${broker.prefix}`,
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
    ...broker.connectors.map((connector) =>
      at({
        method: "GET",
        path: `/connectors/${connector.name}/callback`,
        match: "exact",
        template: `/connectors/${connector.name}/callback`,
        handler: upstreamCallback(connector),
      }),
    ),
    ...(part?.routes ?? []).map(at),
    ...layerRoutes.map(at),
  ];
  const mounted = new Set<string>();
  for (const route of routes) {
    const key = `${route.method} ${route.match} ${route.fullPath}`;
    if (mounted.has(key)) {
      return yield* new BrokerConfigError({
        message: `Two routes are ${route.method} ${route.template} (${route.match})`,
      });
    }
    mounted.add(key);
  }
  return handleOver(routes, liveGates);
});

/** The handler over the mounted `routes`. */
const handleOver = <R>(routes: ReadonlyArray<Mounted<R>>, liveGates: LiveGates["Service"]) =>
  Effect.fn("handle")(function* (request: Request) {
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
