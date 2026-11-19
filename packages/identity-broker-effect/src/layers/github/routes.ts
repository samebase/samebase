import { Effect } from "effect";
import type { Route } from "../../core/router.ts";
import { updateClient } from "../clientRegistration.ts";
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

/**
 * The GitHub layer as a hub's one registration layer: its routes with the allow-list, the
 * repositories whose cards get every configured connector while the named owner owns them.
 */
export const github = (allowList: typeof AllowList.Type): ReadonlyArray<Route> =>
  githubRoutes.map((route) => ({
    ...route,
    handler: (request: Request) =>
      route.handler(request).pipe(Effect.provide(GithubSettings.layer(allowList))),
  }));
