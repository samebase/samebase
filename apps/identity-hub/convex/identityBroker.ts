import { broker } from "./broker";

// Administration for `npx convex run identityBroker:<name>`:
//   listApps, listClients '{"appId":"..."}', deleteClient '{"clientId":"..."}', deleteApp '{"appId":"..."}'
// Every client comes from the broker's `POST /hub-clients`. Block repository and Block owner on
// samebase.com's admin page stop a tenant.
export const { deleteApp, listApps, listClients, deleteClient, cleanup } = broker.admin();
