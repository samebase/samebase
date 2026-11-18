// Client registration rows: the insert with its caps and eviction, the RFC 7592 read that renews a
// client, and the self-delete of a non-production client.
import { Effect } from "effect";
import type { Doc } from "../store/tables.ts";
import { Tx, type Row } from "../store/Tx.ts";
import { appRow, isStopped, isSuspended, tenantRow } from "./apps.ts";
import { clientRow } from "./clients.ts";
import type { RemoveArgs, RenewArgs } from "./schemas.ts";

/**
 * How long a client with a removal date lives after its last deploy, dev start, or sign-in. Only
 * preview and development clients get a removal date.
 */
export const LEASE_MS = 14 * 24 * 60 * 60 * 1000;

/** The clients of one app in each of its two budgets: production, and previews with development servers. */
export const MAX_CLIENTS_PER_APP = 30;

/** The apps of one tenant: ten names. */
export const MAX_APPS_PER_TENANT = 10;

/** What a sign-in writes on the client it used: a client with a removal date then lives `LEASE_MS` from now. */
export const used = (client: Doc<"clients">, now: number): Doc<"clients"> => ({
  ...client,
  lastSignInAt: now,
  ...(client.removeAt === undefined ? {} : { removeAt: now + LEASE_MS }),
});

/**
 * The one row of the new client's budget that makes way for it at the cap: null below the cap, and
 * undefined when no row can go. For a preview or development client any row of that budget can go.
 * For a production client a production row goes only if it never signed anyone in. Equal
 * `renewedAt` keeps the first row in index order (a stable sort).
 */
const evicted = (
  rows: ReadonlyArray<Row<"clients">>,
  deploymentType: Doc<"clients">["deploymentType"],
) => {
  if (rows.length < MAX_CLIENTS_PER_APP) {
    return null;
  }
  const candidates =
    deploymentType === "production"
      ? rows.filter((row) => row.doc.lastSignInAt === undefined)
      : rows;
  return [...candidates].sort((a, b) => a.doc.renewedAt - b.doc.renewedAt).at(0);
};

const clientAt = (clientId: string, registrationTokenHash: string) =>
  Effect.gen(function* () {
    const client = yield* clientRow(clientId);
    return client !== undefined && client.doc.registrationTokenHash === registrationTokenHash
      ? client
      : undefined;
  });

/** The enrollment as stored: sorted and unique. An empty enrollment is a host bug, never a client. */
const enrollment = (connectors: ReadonlyArray<string>) => {
  const unique = [...new Set(connectors)].sort();
  return unique.length === 0
    ? Effect.die(new Error("A client enrolls in at least one connector"))
    : Effect.succeed(unique);
};

/** The return addresses as stored: sorted and unique. An empty list is a host bug, never a client. */
const redirectUriSet = (redirectUris: ReadonlyArray<string>) => {
  const unique = [...new Set(redirectUris)].sort();
  return unique.length === 0
    ? Effect.die(new Error("A client has at least one redirect URI"))
    : Effect.succeed(unique);
};

export interface RegisterArgs {
  readonly tenantId: string;
  /**
   * The owner of the tenant as of this registration, checked against the owner switch and then
   * recorded on the tenant. Absent: the recorded owner is checked and kept.
   */
  readonly ownerId?: string;
  readonly appId: string;
  readonly connectors: ReadonlyArray<string>;
  readonly deploymentType: Doc<"clients">["deploymentType"];
  readonly clientId: string;
  readonly secretHash: string;
  readonly registrationTokenHash: string;
  readonly tokenEndpointAuthMethod: Doc<"clients">["tokenEndpointAuthMethod"];
  readonly redirectUris: ReadonlyArray<string>;
  readonly clientName: string;
  readonly softwareVersion: string;
  readonly app: string;
  readonly registeredBy: Doc<"clients">["registeredBy"];
  readonly now: number;
}

/**
 * Registers one deployment as a client of an app, creating the app with its first client. The
 * caller's step also records the registration, so a block or a cap cannot be raced. A client is
 * never replaced: a deployment that lost its client gets a new one.
 */
export const registerClient = (args: RegisterArgs) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const connectors = yield* enrollment(args.connectors);
    const tenant = yield* tenantRow(args.tenantId);
    if (yield* isStopped(args.tenantId, args.ownerId ?? tenant?.doc.ownerId)) {
      return { ok: false as const, error: "suspended" as const };
    }
    const app = yield* appRow(args.appId);
    if (app !== undefined && app.doc.tenantId !== args.tenantId) {
      return { ok: false as const, error: "app_taken" as const };
    }
    if (app === undefined) {
      const apps = yield* tx.query("apps", "by_tenant_id", {
        eq: [args.tenantId],
        order: "asc",
        limit: MAX_APPS_PER_TENANT,
      });
      if (apps.length >= MAX_APPS_PER_TENANT) {
        return { ok: false as const, error: "too_many_apps" as const };
      }
    }
    // The budget of the new client: `development` and `preview` sort before `production`.
    const rows =
      app === undefined
        ? []
        : yield* tx.query(
            "clients",
            "by_app_id_and_deployment_type",
            args.deploymentType === "production"
              ? { eq: [args.appId, "production"], order: "asc", limit: MAX_CLIENTS_PER_APP }
              : {
                  eq: [args.appId],
                  range: [{ op: "lt", value: "production" }],
                  order: "asc",
                  limit: MAX_CLIENTS_PER_APP,
                },
          );
    const evictedRow = evicted(rows, args.deploymentType);
    if (evictedRow === undefined) {
      return { ok: false as const, error: "too_many_clients" as const };
    }
    const redirectUris = yield* redirectUriSet(args.redirectUris);
    // Every refusal is above this line: a refused registration writes nothing.
    if (app === undefined) {
      yield* tx.insert("apps", {
        appId: args.appId,
        name: args.appId,
        tenantId: args.tenantId,
        createdAt: args.now,
      });
    }
    // A transferred repository gets its new owner here, at its next new client.
    if (tenant === undefined) {
      yield* tx.insert("tenants", {
        tenantId: args.tenantId,
        ...(args.ownerId === undefined ? {} : { ownerId: args.ownerId }),
      });
    } else if (args.ownerId !== undefined && args.ownerId !== tenant.doc.ownerId) {
      yield* tx.replace("tenants", tenant.id, { ...tenant.doc, ownerId: args.ownerId });
    }
    if (evictedRow !== null) {
      yield* tx.delete("clients", evictedRow.id);
    }
    yield* tx.insert("clients", {
      clientId: args.clientId,
      appId: args.appId,
      secretHash: args.secretHash,
      registrationTokenHash: args.registrationTokenHash,
      tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
      redirectUris,
      deploymentType: args.deploymentType,
      clientName: args.clientName,
      softwareVersion: args.softwareVersion,
      createdAt: args.now,
      renewedAt: args.now,
      ...(args.deploymentType === "production" ? {} : { removeAt: args.now + LEASE_MS }),
      app: args.app,
      registeredBy: args.registeredBy,
      connectors,
    });
    return { ok: true as const };
  });

/**
 * A deploy of a client reads it (RFC 7592 section 2.1), which also renews it. A preview or
 * development client gets a new removal date. A production client has none and never gets one.
 */
export const renew = (args: typeof RenewArgs.Type) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const client = yield* clientAt(args.clientId, args.registrationTokenHash);
    if (client === undefined) {
      return { ok: false as const, error: "invalid_token" as const };
    }
    const app = yield* appRow(client.doc.appId);
    if (app === undefined) {
      return { ok: false as const, error: "invalid_token" as const };
    }
    if (yield* isSuspended(app.doc.tenantId)) {
      return { ok: false as const, error: "suspended" as const };
    }
    yield* tx.replace("clients", client.id, {
      ...client.doc,
      renewedAt: args.now,
      ...(client.doc.removeAt === undefined ? {} : { removeAt: args.now + LEASE_MS }),
    });
    return {
      ok: true as const,
      redirectUris: client.doc.redirectUris,
      clientName: client.doc.clientName,
      softwareVersion: client.doc.softwareVersion,
      tokenEndpointAuthMethod: client.doc.tokenEndpointAuthMethod,
      app: client.doc.app,
      tenantId: app.doc.tenantId,
      createdAt: client.doc.createdAt,
      connectors: client.doc.connectors,
    };
  });

/**
 * A preview or development client deletes itself (RFC 7592 section 2.3). A production client
 * cannot: a stack destroy can leave a production deployment running.
 */
export const remove = (args: typeof RemoveArgs.Type) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const client = yield* clientAt(args.clientId, args.registrationTokenHash);
    if (client === undefined) {
      return { ok: false as const, error: "invalid_token" as const };
    }
    if (client.doc.deploymentType === "production") {
      return { ok: false as const, error: "production" as const };
    }
    yield* tx.delete("clients", client.id);
    return { ok: true as const };
  });
