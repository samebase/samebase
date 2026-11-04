import { broker } from "./broker";

// Administration for `npx convex run identityBroker:<name>`:
//   createApp '{"name":"Bristol","firstParty":false}', for an app that is not the team's own
//   registerClient and renewClient, which Convex.HubClient of @samebase/alchemy-convex runs at
//   deploy time and `alchemy-convex hub-client` at each dev start
//   listApps, listClients '{"appId":"..."}', deleteClient '{"clientId":"..."}', deleteApp '{"appId":"..."}'
//   setTenantSuspended '{"tenantId":"...","suspended":true}', the switch of one third-party tenant
export const {
  createApp,
  registerClient,
  renewClient,
  deleteApp,
  listApps,
  listClients,
  deleteClient,
  setTenantSuspended,
  cleanup,
} = broker.admin();
