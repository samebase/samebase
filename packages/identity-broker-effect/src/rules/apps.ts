// Tenants, blocks and the app view: what every sign-in and registration step reads about an app's
// repository and its owner.
import { Effect } from "effect";
import type { Doc } from "../store/tables.ts";
import { unique, type Row } from "../store/Tx.ts";

export const tenantRow = (tenantId: string) => unique("tenants", "by_tenant_id", [tenantId]);

/** The tenant of a GitHub repository. */
export const tenantIdOf = (githubRepositoryDatabaseId: string) =>
  `gh-${githubRepositoryDatabaseId}`;

/** The GitHub repository id of a tenant, or undefined for a tenant that is not a repository's. */
export const repositoryIdOf = (tenantId: string | undefined) =>
  /^gh-([1-9][0-9]*)$/.exec(tenantId ?? "")?.[1];

export const readBlock = (kind: Doc<"blocks">["kind"], githubId: string) =>
  unique("blocks", "by_kind_and_github_id", [kind, githubId]);

/**
 * Whether no client of the tenant may register, renew, or sign in: its repository is blocked, or
 * `ownerId` is. A tenant that is not a repository's (`gh-<id>`) has no repository block.
 */
export const isStopped = (tenantId: string, ownerId: string | undefined) =>
  Effect.gen(function* () {
    const repositoryId = repositoryIdOf(tenantId);
    if (
      repositoryId !== undefined &&
      (yield* readBlock("repository", repositoryId)) !== undefined
    ) {
      return true;
    }
    return ownerId !== undefined && (yield* readBlock("owner", ownerId)) !== undefined;
  });

export const isSuspended = (tenantId: string) =>
  Effect.gen(function* () {
    const tenant = yield* tenantRow(tenantId);
    return yield* isStopped(tenantId, tenant?.doc.ownerId);
  });

export const appRow = (appId: string) => unique("apps", "by_app_id", [appId]);

/** An app row with what `/authorize` and `/continue` need to know about its tenant. */
export const appView = (app: Row<"apps">) =>
  Effect.gen(function* () {
    return {
      appId: app.doc.appId,
      name: app.doc.name,
      tenantId: app.doc.tenantId,
      suspended: yield* isSuspended(app.doc.tenantId),
      createdAt: app.doc.createdAt,
    };
  });
