// The moderation API (./api.ts) as a part of the GitHub layer: `githubActions(allowList, {
// moderation: moderation({ key }) })` mounts its routes under `/moderation/`. A broker without it has none.
// Each request is one command of the layer (src/layers/github/moderation.ts); a command that
// fails is a defect here, which the mount hands back to the router as `CommandFailed`.
import { Config, Effect, Layer, Option, Redacted } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/http-api";
import { CommandFailed } from "../core/command.ts";
import type { Route } from "../core/router.ts";
import { BrokerConfig } from "../core/services.ts";
import { sha256HexEffect } from "../core/subject.ts";
import { command, GithubSettings } from "../layers/github/settings.ts";
import {
  InvalidRequest,
  InvalidToken,
  MissingToken,
  ModerationApi,
  ModerationKey,
  OwnerChanged,
  RequestCheck,
  UnknownConnector,
} from "./api.ts";

export type ModerationSettings = {
  /**
   * The moderation key, a secret of the broker's host, such as
   * `Config.Redacted("IDENTITY_BROKER_MODERATION_KEY")`. Read in each request: while it is missing
   * or empty, every request is refused.
   */
  readonly key: Config.Config<Redacted.Redacted<string>>;
};

/** What a command that rewrites cards reads of the broker's settings and the layer's. */
const cardSettings = Effect.gen(function* () {
  const { allowList } = yield* GithubSettings;
  return { allowList, configured: (yield* BrokerConfig).configured };
});

/** A change of a grant or an exemption: `owner_changed` while the broker records another owner. */
const ownerChecked = (result: { ok: true; changed: boolean } | { ok: false }) =>
  result.ok
    ? Effect.succeed({ changed: result.changed })
    : Effect.fail(
        new OwnerChanged({
          error_description: "The broker records another owner of the repository.",
        }),
      );

const handlers = HttpApiBuilder.group(ModerationApi, "moderation", (endpoints) =>
  endpoints
    .handle("counts", () => Effect.orDie(command("github.counts", {})))
    .handle("blocks", () => Effect.orDie(command("github.blocks", {})))
    .handle("changeBlock", ({ payload }) => Effect.orDie(command("github.changeBlock", payload)))
    .handle("signInPage", () => Effect.orDie(command("github.signInPage", {})))
    .handle("changeSignInPage", ({ payload }) =>
      Effect.gen(function* () {
        const args = { ...payload, ...(yield* cardSettings) };
        return yield* ownerChecked(yield* Effect.orDie(command("github.changeSignInPage", args)));
      }),
    )
    .handle("connectorGrants", () =>
      Effect.gen(function* () {
        const { configured } = yield* BrokerConfig;
        return yield* Effect.orDie(command("github.connectorGrants", { configured }));
      }),
    )
    .handle("changeConnectorGrant", ({ payload }) =>
      Effect.gen(function* () {
        const broker = yield* cardSettings;
        // A revoke can remove a row of a connector that the broker no longer has.
        if (payload.grant && !broker.configured.includes(payload.connector)) {
          return yield* new UnknownConnector({
            error_description: "The broker has no connector of this name.",
          });
        }
        const args = { ...payload, ...broker };
        return yield* ownerChecked(
          yield* Effect.orDie(command("github.changeConnectorGrant", args)),
        );
      }),
    )
    .handle("clients", ({ query }) =>
      Effect.gen(function* () {
        const args = { ...query, ...(yield* cardSettings) };
        return yield* Effect.orDie(command("github.clients", args));
      }),
    )
    .handle("deleteClient", ({ params, query }) =>
      Effect.orDie(command("github.deleteClient", { clientId: params.clientId, ...query })),
    ),
);

/** Only a path, query or body that does not decode is the client's fault; any other is a defect. */
const requestCheck = HttpApiMiddleware.layerSchemaErrorTransform(RequestCheck, (error) =>
  error.kind === "Params" || error.kind === "Query" || error.kind === "Payload"
    ? Effect.fail(
        new InvalidRequest({
          error_description: `The ${error.kind === "Params" ? "path" : error.kind.toLowerCase()} is not valid.`,
        }),
      )
    : Effect.fail(error),
);

/** The part's routes. The key is compared by hash, so the time it takes says nothing about it. */
export const moderation = (settings: ModerationSettings): ReadonlyArray<Route<GithubSettings>> => {
  const key = Layer.succeed(ModerationKey)({
    bearer: (effect, { credential }) =>
      Effect.gen(function* () {
        const presented = Redacted.value(credential);
        if (presented === "") {
          return yield* new MissingToken();
        }
        const expected = yield* Config.option(settings.key).pipe(Effect.orDie);
        const value = Option.isSome(expected) ? Redacted.value(expected.value).trim() : "";
        if (
          value === "" ||
          (yield* sha256HexEffect(presented)) !== (yield* sha256HexEffect(value))
        ) {
          return yield* new InvalidToken({ error_description: "The token is invalid." });
        }
        return yield* effect;
      }),
  });
  const api = HttpApiBuilder.layer(ModerationApi).pipe(
    Layer.provide(handlers.pipe(Layer.provide([key, requestCheck]))),
    Layer.provide(HttpServer.layerServices),
  );

  /**
   * One request, with the issuer's path prefix taken off, as the API's paths have none. A path of
   * no endpoint answers 404; a defect, or a command that failed, reaches the router.
   */
  const handler = (request: Request) =>
    Effect.scoped(
      Effect.gen(function* () {
        const broker = yield* BrokerConfig;
        const serve = yield* HttpRouter.toHttpEffect(api);
        const incoming = HttpServerRequest.fromWeb(request);
        const response = yield* serve.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            incoming.modify({ url: incoming.url.slice(broker.prefix.length) }),
          ),
          Effect.catchTag("HttpServerError", (error) =>
            error.reason._tag === "RouteNotFound"
              ? Effect.succeed(HttpServerResponse.empty({ status: 404 }))
              : Effect.die(error),
          ),
        );
        return HttpServerResponse.toWeb(
          HttpServerResponse.setHeader(response, "cache-control", "no-store"),
        );
      }),
    ).pipe(
      Effect.catchDefect((defect) =>
        defect instanceof CommandFailed ? Effect.fail(defect) : Effect.die(defect),
      ),
    );

  return (["GET", "POST", "DELETE"] as const).map((method) => ({
    method,
    path: "/moderation/",
    match: "prefix",
    template: "/moderation/{endpoint}",
    handler,
  }));
};
