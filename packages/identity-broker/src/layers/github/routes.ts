import { Config, Effect, Layer } from "effect";
import type { PublicRegistration, Route } from "../../core/router.ts";
import { updateClient } from "../clientRegistration.ts";
import { GATE_PREFIX } from "./clients.ts";
import { deleteClient, readClient } from "./manage.ts";
import { registerClient } from "./register.ts";
import { GithubSettings } from "./settings.ts";
import type { AllowList } from "./schemas.ts";

/**
 * The routes of the GitHub layer: `POST /register` (RFC 7591) and the client configuration
 * endpoint `/register/<client>` (RFC 7592). The client id is the final segment of the path, as it
 * is.
 */
export const githubRoutes: ReadonlyArray<Route<GithubSettings>> = [
  {
    method: "POST",
    path: "/register",
    match: "exact",
    template: "/register",
    handler: registerClient,
  },
  {
    method: "GET",
    path: "/register/",
    match: "prefix",
    template: "/register/{client}",
    handler: readClient,
  },
  {
    method: "DELETE",
    path: "/register/",
    match: "prefix",
    template: "/register/{client}",
    handler: deleteClient,
  },
  {
    method: "PUT",
    path: "/register/",
    match: "prefix",
    template: "/register/{client}",
    handler: updateClient,
  },
];

export type GithubOptions = {
  /**
   * `true` refuses every registration and every sign-in step of the layer's clients, such as
   * `Config.boolean("APPS_PAUSED").pipe(Config.withDefault(false))`. Read in each request.
   */
  readonly paused?: Config.Config<boolean>;
  /** The moderation API (`moderation` of `@samebase/identity-broker/moderation`). */
  readonly moderation?: ReadonlyArray<Route<GithubSettings>>;
};

/**
 * The GitHub layer as a broker's one registration layer: its routes with the allow-list, the
 * repositories whose cards get every configured connector while the named owner owns them. While
 * the broker is paused, its gates refuse every card of the layer.
 */
export const github = (
  allowList: typeof AllowList.Type,
  options: GithubOptions = {},
): PublicRegistration => {
  const paused = Effect.gen(function* () {
    return options.paused === undefined ? false : yield* options.paused;
  }).pipe(Effect.orDie);
  const settings = Layer.effect(
    GithubSettings,
    Effect.map(paused, (value) => GithubSettings.of({ allowList, paused: value })),
  );
  return {
    routes: [...githubRoutes, ...(options.moderation ?? [])].map((route) => ({
      ...route,
      handler: (request: Request) => route.handler(request).pipe(Effect.provide(settings)),
    })),
    liveGates: Effect.map(paused, (value) => (value ? [{ prefix: GATE_PREFIX, live: [] }] : [])),
    public: true,
  };
};
