import type { Route } from "../router.ts";
import { registerClient } from "./hubClients.ts";
import { deleteClient, readClient, updateClient } from "./registration.ts";

/**
 * The routes of the hub mode: `POST /register` (RFC 7591) and the client configuration endpoint
 * `/register/<client>` (RFC 7592). The router mounts them only when `HubConfig.registration` is set.
 * The client id is the final segment of the path, as it is.
 */
export const registrationRoutes: ReadonlyArray<Route> = [
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
