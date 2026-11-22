// Generated from src/store/commands.ts by src/hosts/convex/functions.test.ts.
import type { api } from "./component/_generated/api.ts";
import type { ComponentApi } from "./component/_generated/component.ts";
import type { CommandFunctions } from "./functions.ts";

/** Each command's function, in an app's `components.<name>` or in the component's own `api`. */
export const commandFunctions = (component: ComponentApi | typeof api): CommandFunctions => ({
  "authRequests.create": {
    kind: "mutation",
    reference: component.authRequests.create,
  },
  "authRequests.get": {
    kind: "query",
    reference: component.authRequests.get,
  },
  "authRequests.startUpstream": {
    kind: "mutation",
    reference: component.authRequests.startUpstream,
  },
  "authRequests.claimUpstream": {
    kind: "mutation",
    reference: component.authRequests.claimUpstream,
  },
  "authRequests.complete": {
    kind: "mutation",
    reference: component.authRequests.complete,
  },
  "authRequests.abandon": {
    kind: "mutation",
    reference: component.authRequests.abandon,
  },
  "authRequests.exchangeCode": {
    kind: "mutation",
    reference: component.authRequests.exchangeCode,
  },
  "clients.get": {
    kind: "query",
    reference: component.clients.get,
  },
  "signIns.record": {
    kind: "mutation",
    reference: component.signIns.record,
  },
  "lifecycle.cleanup": {
    kind: "mutation",
    reference: component.lifecycle.cleanup,
  },
  "github.admit": {
    kind: "mutation",
    reference: component.github.admit,
  },
  "github.createClient": {
    kind: "mutation",
    reference: component.github.createClient,
  },
  "github.readInitialAccessToken": {
    kind: "query",
    reference: component.github.readInitialAccessToken,
  },
  "github.createDevelopmentClient": {
    kind: "mutation",
    reference: component.github.createDevelopmentClient,
  },
  "github.renew": {
    kind: "mutation",
    reference: component.github.renew,
  },
  "github.remove": {
    kind: "mutation",
    reference: component.github.remove,
  },
  "github.counts": {
    kind: "query",
    reference: component.github.counts,
  },
  "github.blocks": {
    kind: "query",
    reference: component.github.blocks,
  },
  "github.changeBlock": {
    kind: "mutation",
    reference: component.github.changeBlock,
  },
  "github.signInPage": {
    kind: "query",
    reference: component.github.signInPage,
  },
  "github.changeSignInPage": {
    kind: "mutation",
    reference: component.github.changeSignInPage,
  },
  "github.connectorGrants": {
    kind: "query",
    reference: component.github.connectorGrants,
  },
  "github.changeConnectorGrant": {
    kind: "mutation",
    reference: component.github.changeConnectorGrant,
  },
  "github.clients": {
    kind: "query",
    reference: component.github.clients,
  },
  "github.deleteClient": {
    kind: "mutation",
    reference: component.github.deleteClient,
  },
  "stack.createClient": {
    kind: "mutation",
    reference: component.stack.createClient,
  },
  "stack.renew": {
    kind: "mutation",
    reference: component.stack.renew,
  },
  "stack.remove": {
    kind: "mutation",
    reference: component.stack.remove,
  },
  "connections.create": {
    kind: "mutation",
    reference: component.connections.create,
  },
  "connections.claim": {
    kind: "mutation",
    reference: component.connections.claim,
  },
  "connections.complete": {
    kind: "mutation",
    reference: component.connections.complete,
  },
  "connections.abandon": {
    kind: "mutation",
    reference: component.connections.abandon,
  },
  "connections.exchangeCode": {
    kind: "mutation",
    reference: component.connections.exchangeCode,
  },
  "connections.admitRefresh": {
    kind: "mutation",
    reference: component.connections.admitRefresh,
  },
  "connections.authenticate": {
    kind: "query",
    reference: component.connections.authenticate,
  },
  "connections.cleanup": {
    kind: "mutation",
    reference: component.connections.cleanup,
  },
});
