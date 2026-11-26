import { Cause, Config, ConfigProvider, Context, Effect, Exit, Layer, Logger } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { checkProviders, type ConnectionSpec } from "../connections/providers.ts";
import { makeConnections } from "../connections/routes.ts";
import { defaultKeys, hubSettings, type HubSettings } from "../hosts/settings.ts";
import { Store } from "../store/Store.ts";
import type { ConnectorSpec, Secret, SecretServices } from "./connectors/types.ts";
import {
  hubLogger,
  makeHandle,
  serverError,
  type CoreServices,
  type PublicRegistration,
  type Registration,
} from "./router.ts";
import {
  checkConnectors,
  Fetch,
  HubConfig,
  HubConfigError,
  Keys,
  parseIssuer,
  Random,
  SignInPage,
  type ServiceSettings,
} from "./services.ts";

type Hub<R = never> = {
  readonly fetch: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest | R
  >;
};

type HubOptions<R> = HubSettings<R> & {
  /** Without it the hub mounts no connection route. */
  readonly connections?: ReadonlyArray<ConnectionSpec<R>>;
} & (
    | { readonly registration: Registration & { readonly public?: never } }
    | {
        readonly registration: PublicRegistration;
        readonly service: ServiceSettings;
      }
  );

// workerd logs a thrown value that is no Error, such as Effect's ConfigError, as "[object Object]".
const cannotStart = Effect.catchCause((cause: Cause.Cause<unknown>) =>
  Effect.die(
    new Error(
      `The hub cannot start: ${Cause.prettyErrors(cause)
        .map((error) => `${error.name}: ${error.message}`)
        .join("; ")}`,
    ),
  ),
);

const startFailureReason = (
  cause: Cause.Cause<unknown>,
): "invalid_config" | "missing_config" | "secret_failed" | "defect" => {
  const values = cause.reasons.map((reason) =>
    Cause.isFailReason(reason)
      ? reason.error
      : Cause.isDieReason(reason)
        ? reason.defect
        : undefined,
  );
  if (values.some((value) => value instanceof HubConfigError)) {
    return "invalid_config";
  }
  if (values.some((value) => value instanceof Config.ConfigError)) {
    return "missing_config";
  }
  if (cause.reasons.some(Cause.isFailReason)) {
    return "secret_failed";
  }
  return "defect";
};

const buildRuntime = <E, R, RC = never>(
  settings: Layer.Layer<HubConfig | SignInPage | Keys, E, R>,
  registration: Registration,
  connections?: ReadonlyArray<ConnectionSpec<RC>>,
): Effect.Effect<Hub, unknown, Store | R | RC> =>
  Effect.gen(function* () {
    const part = connections === undefined ? undefined : yield* makeConnections(connections);
    const handle = makeHandle(registration, part);
    // Only the hub's own services: a lazy build runs in request 1, whose request and scope must
    // not reach a later request.
    const services = Context.pick(
      Store,
      HubConfig,
      SignInPage,
      Keys,
      Random,
      Fetch,
      ConfigProvider.ConfigProvider,
      Logger.CurrentLoggers,
    )(yield* Effect.context<CoreServices>());
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const web = yield* HttpServerRequest.toWeb(request).pipe(Effect.orDie);
        // `raw` hands the core's `Response` on unchanged, each `Set-Cookie` field too.
        return HttpServerResponse.raw(yield* handle(web).pipe(Effect.provideContext(services)));
      }),
    };
  }).pipe(Effect.provide(Layer.mergeAll(settings, Random.layer, Fetch.layer, hubLogger)));

/**
 * The hub over its settings, built when this runs. The scope of `settings` closes when the build
 * ends, so `settings` must hold no finalizer that a request needs.
 */
export const hubRuntime = <E, R, RC = never>(
  settings: Layer.Layer<HubConfig | SignInPage | Keys, E, R>,
  registration: Registration,
  connections?: ReadonlyArray<ConnectionSpec<RC>>,
): Effect.Effect<Hub, never, Store | R | RC> =>
  buildRuntime(settings, registration, connections).pipe(cannotStart);

/** Reads each `Config` secret now; with another kind of secret the hub builds at the first request. */
export const hub = <
  // Each spec infers its own services: one `R` in `ReadonlyArray<ConnectorSpec<R>>` would make
  // TypeScript pick the services of one spec and refuse the others.
  Connector extends ConnectorSpec<unknown>,
  Connection extends ConnectionSpec<unknown> = never,
  Keys extends Secret<unknown> = never,
  R = SecretServices<Connector | Connection> | Effect.Services<Keys>,
>(
  options: {
    readonly connectors: ReadonlyArray<Connector>;
    readonly connections?: ReadonlyArray<Connection>;
    readonly keys?: Keys;
  } & HubOptions<NoInfer<R>>,
): Effect.Effect<Hub<R>, never, Store> =>
  Effect.gen(function* () {
    const build = buildRuntime(hubSettings(options), options.registration, options.connections);
    const specs = [...options.connectors, ...(options.connections ?? [])];
    const secrets = [
      options.keys ?? defaultKeys,
      ...specs.flatMap((spec) => [spec.clientId, spec.clientSecret]),
    ];
    if (secrets.every((secret) => Config.isConfig(secret))) {
      // @ts-expect-error Each secret is a `Config` here, and a `Config` needs no service.
      const now: Effect.Effect<Hub, never, Store> = build.pipe(cannotStart);
      return yield* now;
    }
    for (const secret of secrets) {
      if (Config.isConfig(secret)) {
        const config: Config.Config<unknown> = secret;
        yield* config.pipe(cannotStart);
      }
    }
    yield* Effect.gen(function* () {
      yield* parseIssuer(options.issuer);
      yield* checkConnectors(options.connectors);
      if (options.connections !== undefined) {
        yield* checkProviders(options.connections);
      }
    }).pipe(cannotStart);
    // Also carries the start's configuration provider, which each build reads.
    const start = yield* Effect.context<Store>();
    let built: Hub | undefined;
    const fetch: Hub<R>["fetch"] = Effect.gen(function* () {
      if (built === undefined) {
        const exit = yield* Effect.exit(Effect.provideContext(build, start));
        if (Exit.isFailure(exit)) {
          return HttpServerResponse.raw(
            yield* serverError({
              category: "start_failed",
              reason: startFailureReason(exit.cause),
            }).pipe(Effect.provide(hubLogger)),
          );
        }
        built = exit.value;
      }
      return yield* built.fetch;
    });
    return { fetch };
  });
