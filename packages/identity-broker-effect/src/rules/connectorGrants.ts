// The connector grants that the hub's administrator sets. A grant adds one connector to what the
// host's policy gives every client of one repository while one owner owns it. Every step of a
// sign-in reads the grants again, so a revoked grant stops the next step.
import { Effect } from "effect";
import type { Doc } from "../store/tables.ts";
import { allBelow } from "../store/Tx.ts";
import { appRow, tenantIdOf, tenantRow } from "./apps.ts";
import type { ForRegistrationArgs } from "./schemas.ts";

/** The grants of one owner on one repository stay below this: one row per configured connector. */
export const MAX_GRANTS_PER_OWNER = 64;

/**
 * The connectors granted to a client of the repository `tenantId`, in connector order. A row counts
 * only while the tenant's recorded owner and the owner that registered the client are the row's
 * owner. A client of no repository has none.
 */
export const grantedTo = Effect.fnUntraced(function* (args: {
  readonly tenantId: string | undefined;
  readonly tenantOwnerId: string | undefined;
  readonly clientOwnerId: string;
}) {
  const { tenantId, clientOwnerId } = args;
  if (tenantId === undefined || args.tenantOwnerId !== clientOwnerId) {
    return [];
  }
  const rows = yield* allBelow(
    "connectorGrants",
    "by_tenant_id_and_owner_id_and_connector",
    [tenantId, clientOwnerId],
    MAX_GRANTS_PER_OWNER + 1,
  );
  return rows.map((row) => row.doc.connector);
});

/** The connectors granted to `client` now, read in the caller's step. */
export const grantedToClient = Effect.fnUntraced(function* (client: Doc<"clients">) {
  const app = yield* appRow(client.appId);
  const tenant = app === undefined ? undefined : yield* tenantRow(app.doc.tenantId);
  return yield* grantedTo({
    tenantId: app?.doc.tenantId,
    tenantOwnerId: tenant?.doc.ownerId,
    clientOwnerId: client.registeredBy.githubOwnerId,
  });
});

/**
 * The connectors granted to the repository that a registration joins, for the owner of its proof.
 * The registering command reads them again in its own step.
 */
export const forRegistration = (args: typeof ForRegistrationArgs.Type) =>
  grantedTo({
    tenantId: tenantIdOf(args.githubRepositoryDatabaseId),
    tenantOwnerId: args.githubOwnerId,
    clientOwnerId: args.githubOwnerId,
  });
