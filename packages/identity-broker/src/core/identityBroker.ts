import { Cause, Config, ConfigProvider, Context, Effect, Exit, Layer, Logger } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { checkProviders, type IntegrationSpec } from "../integrations/providers.ts";
import { makeIntegrations } from "../integrations/routes.ts";
import { defaultKeys, brokerSettings, type BrokerSettings } from "../hosts/settings.ts";
import { Store } from "../store/Store.ts";
import type { ConnectorSpec, Secret, SecretServices } from "./connectors/types.ts";
import {
  brokerLogger,
  makeHandle,
  serverError,
  type CoreServices,
  type PublicRegistration,
  type Registration,
} from "./router.ts";
import {
  checkConnectors,
  Fetch,
  BrokerConfig,
  BrokerConfigError,
  Keys,
  parseIssuer,
  Random,
  SignInPage,
  type ServiceSettings,
} from "./services.ts";

type Broker<R = never> = {
  readonly fetch: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    HttpServerRequest.HttpServerRequest | R
  >;
};

type BrokerOptions<R> = BrokerSettings<R> & {
  /** Without it the broker mounts no integration route. */
  readonly integrations?: ReadonlyArray<IntegrationSpec<R>>;
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
      `The broker cannot start: ${Cause.prettyErrors(cause)
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
  if (values.some((value) => value instanceof BrokerConfigError)) {
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

const buildRuntime = <E, R, Integration extends IntegrationSpec<unknown> = never>(
  settings: Layer.Layer<BrokerConfig | SignInPage | Keys, E, R>,
  registration: Registration,
  integrations?: ReadonlyArray<Integration>,
): Effect.Effect<Broker, unknown, Store | R | SecretServices<Integration>> =>
  Effect.gen(function* () {
    const part = integrations === undefined ? undefined : yield* makeIntegrations(integrations);
    const handle = makeHandle(registration, part);
    // Only the broker's own services: a lazy build runs in request 1, whose request and scope must
    // not reach a later request.
    const services = Context.pick(
      Store,
      BrokerConfig,
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
  }).pipe(Effect.provide(Layer.mergeAll(settings, Random.layer, Fetch.layer, brokerLogger)));

/**
 * The broker over its settings, built when this runs. The scope of `settings` closes when the build
 * ends, so `settings` must hold no finalizer that a request needs.
 */
export const brokerRuntime = <E, R, Integration extends IntegrationSpec<unknown> = never>(
  settings: Layer.Layer<BrokerConfig | SignInPage | Keys, E, R>,
  registration: Registration,
  integrations?: ReadonlyArray<Integration>,
): Effect.Effect<Broker, never, Store | R | SecretServices<Integration>> =>
  buildRuntime(settings, registration, integrations).pipe(cannotStart);

/** Reads each `Config` secret now; with another kind of secret the broker builds at the first request. */
export const identityBroker = <
  // Each spec infers its own services: one `R` in `ReadonlyArray<ConnectorSpec<R>>` would make
  // TypeScript pick the services of one spec and refuse the others.
  Connector extends ConnectorSpec<unknown>,
  Integration extends IntegrationSpec<unknown> = never,
  Keys extends Secret<unknown> = never,
  R = SecretServices<Connector | Integration> | Effect.Services<Keys>,
>(
  options: {
    readonly connectors: ReadonlyArray<Connector>;
    readonly integrations?: ReadonlyArray<Integration>;
    readonly keys?: Keys;
  } & BrokerOptions<NoInfer<R>>,
): Effect.Effect<Broker<R>, never, Store> =>
  Effect.gen(function* () {
    yield* Effect.gen(function* () {
      yield* parseIssuer(options.issuer);
      yield* checkConnectors(options.connectors);
      if (options.integrations !== undefined) {
        yield* checkProviders(options.integrations);
      }
    }).pipe(cannotStart);
    const build = buildRuntime(
      brokerSettings({
        issuer: options.issuer,
        connectors: options.connectors,
        ...(options.keys === undefined ? {} : { keys: options.keys }),
        ...(options.service === undefined ? {} : { service: options.service }),
        ...(options.signInPage === undefined ? {} : { signInPage: options.signInPage }),
      }),
      options.registration,
      options.integrations,
    );
    const specs = [...options.connectors, ...(options.integrations ?? [])];
    const secrets = [
      options.keys ?? defaultKeys,
      ...specs.flatMap((spec) => [spec.clientId, spec.clientSecret]),
    ];
    if (secrets.every((secret) => Config.isConfig(secret))) {
      // @ts-expect-error Each secret is a `Config` here, and a `Config` needs no service.
      const now: Effect.Effect<Broker, never, Store> = build.pipe(cannotStart);
      return yield* now;
    }
    for (const secret of secrets) {
      if (Config.isConfig(secret)) {
        const config: Config.Config<unknown> = secret;
        yield* config.pipe(cannotStart);
      }
    }
    // Also carries the start's configuration provider, which each build reads.
    const start = yield* Effect.context<Store>();
    let built: Broker | undefined;
    const fetch: Broker<R>["fetch"] = Effect.gen(function* () {
      if (built === undefined) {
        const exit = yield* Effect.exit(Effect.provideContext(build, start));
        if (Exit.isFailure(exit)) {
          return HttpServerResponse.raw(
            yield* serverError({
              category: "start_failed",
              reason: startFailureReason(exit.cause),
            }).pipe(Effect.provide(brokerLogger)),
          );
        }
        built = exit.value;
      }
      return yield* built.fetch;
    });
    return { fetch };
  });
