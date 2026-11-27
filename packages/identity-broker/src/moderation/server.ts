// The moderation API (./api.ts) as a part of the broker: `identityBroker({ moderation:
// moderation({ key }) })` mounts its routes under `/moderation/`. A broker without it has none.
// Each endpoint belongs to a registration layer, and answers 404 while the broker does not mount
// that layer. Each request is one command of its layer (src/layers/github/moderation.ts,
// src/layers/cimd/clients.ts); a command that fails is a defect here, which the mount hands back
// to the router as `CommandFailed`.
import { Config, Effect, Layer, Option, Redacted } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/http-api";
import { CommandFailed } from "../core/command.ts";
import type { Route } from "../core/router.ts";
import { BrokerConfig } from "../core/services.ts";
import { sha256HexEffect } from "../core/subject.ts";
import { command, GithubSettings } from "../layers/github/settings.ts";
import { command as cimdCommand } from "../layers/cimd/commands.ts";
import {
  InvalidRequest,
  InvalidToken,
  MissingToken,
  Moderation,
  ModerationApi,
  ModerationKey,
  MountedLayers,
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

/** What a registration layer gives the moderation API: its name, and the GitHub layer's settings. */
export type ModerationPart =
  | { readonly layer: "github"; readonly settings: Layer.Layer<GithubSettings> }
  | { readonly layer: "cimd" };

/** The moderation routes over the parts of the layers that the broker mounts. */
export type ModerationRoutes = (parts: ReadonlyArray<ModerationPart>) => ReadonlyArray<Route>;

/** The layers of each endpoint: it is served while the broker mounts one of them. */
const owners = {
  counts: ["github"],
  blocks: ["github"],
  changeBlock: ["github"],
  signInPage: ["github"],
  changeSignInPage: ["github"],
  connectorGrants: ["github"],
  changeConnectorGrant: ["github"],
  clients: ["github", "cimd"],
  deleteClient: ["github"],
  hostBlocks: ["cimd"],
  changeHostBlock: ["cimd"],
} satisfies Record<keyof typeof Moderation.endpoints, ReadonlyArray<ModerationPart["layer"]>>;

/** A change of a grant or an exemption: `owner_changed` while the broker records another owner. */
const ownerChecked = (result: { ok: true; changed: boolean } | { ok: false }) =>
  result.ok
    ? Effect.succeed({ changed: result.changed })
    : Effect.fail(
        new OwnerChanged({
          error_description: "The broker records another owner of the repository.",
        }),
      );

const handlers = (parts: ReadonlyArray<ModerationPart>) => {
  const github = parts.find((part) => part.layer === "github");
  const cimd = parts.some((part) => part.layer === "cimd");
  // Without the GitHub layer, `MountedLayers` answers 404 before a GitHub handler runs.
  const githubSettings =
    github === undefined
      ? Effect.die(new Error("The broker mounts no GitHub layer"))
      : Effect.provide(
          Effect.gen(function* () {
            return yield* GithubSettings;
          }),
          github.settings,
        );
  /** What a command that rewrites cards reads of the broker's settings and the layer's. */
  const cardSettings = Effect.gen(function* () {
    const { allowList } = yield* githubSettings;
    return { allowList, configured: (yield* BrokerConfig).configured };
  });

  return HttpApiBuilder.group(ModerationApi, "moderation", (endpoints) =>
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
          const listed =
            github === undefined
              ? { ...query, clients: [], limitReached: false }
              : yield* Effect.orDie(
                  command("github.clients", { ...query, ...(yield* cardSettings) }),
                );
          return cimd && query.owner === undefined
            ? { ...listed, cimd: yield* Effect.orDie(cimdCommand("cimd.clients", {})) }
            : listed;
        }),
      )
      .handle("deleteClient", ({ params, query }) =>
        Effect.orDie(command("github.deleteClient", { clientId: params.clientId, ...query })),
      )
      .handle("hostBlocks", () => Effect.orDie(cimdCommand("cimd.hostBlocks", {})))
      .handle("changeHostBlock", ({ payload }) =>
        Effect.orDie(
          payload.action === "block"
            ? cimdCommand("cimd.blockHost", { host: payload.host })
            : cimdCommand("cimd.unblockHost", { host: payload.host }),
        ),
      ),
  );
};

/** The endpoints of a layer that the broker does not mount answer 404, before decoding. */
const mountedLayers = (parts: ReadonlyArray<ModerationPart>) => {
  const served = new Set<string>(
    Object.entries(owners)
      .filter(([, layers]) => layers.some((layer) => parts.some((part) => part.layer === layer)))
      .map(([name]) => name),
  );
  return Layer.succeed(MountedLayers)((effect, { endpoint }) =>
    served.has(endpoint.identifier)
      ? effect
      : Effect.succeed(HttpServerResponse.empty({ status: 404 })),
  );
};

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
export const moderation =
  (settings: ModerationSettings): ModerationRoutes =>
  (parts) => {
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
      Layer.provide(handlers(parts).pipe(Layer.provide([key, requestCheck, mountedLayers(parts)]))),
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
