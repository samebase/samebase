import type { Route } from "../../core/router.ts";
import { deleteClient, readClient, updateClient } from "./manage.ts";
import { registerClient } from "./register.ts";
import type { GithubSettings } from "./settings.ts";

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
