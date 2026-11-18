// A client with its app and the facts the host's policy decides on, read in one step.
import { Effect } from "effect";
import { unique, type Row } from "../store/Tx.ts";
import { appRow, appView } from "./apps.ts";
import { grantedToClient } from "./connectorGrants.ts";
import { registrationOf } from "./policy.ts";
import type { ClientIdArgs } from "./schemas.ts";
import { exemptionOf } from "./signInPage.ts";

export const clientRow = (clientId: string) => unique("clients", "by_client_id", [clientId]);

/**
 * A client with its app and its policy facts. `registration` is null when the app is gone or the
 * client is not a repository's. `granted` is what the hub's administrator granted the client's
 * repository; every step that moves a sign-in on reads it again.
 */
export const clientWithApp = (row: Row<"clients">) =>
  Effect.gen(function* () {
    const client = row.doc;
    const app = yield* appRow(client.appId);
    return {
      client,
      app: app === undefined ? null : yield* appView(app),
      registration: app === undefined ? null : yield* registrationOf(client, app.doc),
      granted: yield* grantedToClient(client),
    };
  });

export const get = (args: typeof ClientIdArgs.Type) =>
  Effect.gen(function* () {
    return (yield* clientRow(args.clientId))?.doc ?? null;
  });

/** A client with its app and its policy facts, in one call, for the start of each use of it. */
export const withApp = (args: typeof ClientIdArgs.Type) =>
  Effect.gen(function* () {
    const row = yield* clientRow(args.clientId);
    return row === undefined ? null : yield* clientWithApp(row);
  });

/**
 * `withApp` for `/authorize`, with the exemptions from the sign-in page that cover the client, read
 * in the same step as its facts.
 */
export const forAuthorize = (args: typeof ClientIdArgs.Type) =>
  Effect.gen(function* () {
    const row = yield* clientRow(args.clientId);
    if (row === undefined) {
      return null;
    }
    const found = yield* clientWithApp(row);
    return {
      ...found,
      exemption: yield* exemptionOf({
        tenantId: found.app?.tenantId,
        // The tenant's recorded owner, which the facts carry; no facts, no exemption.
        tenantOwnerId: found.registration?.ownerId,
        clientOwnerId: row.doc.registeredBy.githubOwnerId,
      }),
    };
  });
