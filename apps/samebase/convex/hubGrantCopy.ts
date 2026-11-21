import { object as sureObject, string as sureString } from "@samebase/sure";
import { v, type Infer } from "convex/values";

import { createUrlSearchParams } from "../shared/urlSearchParams";
import { internal } from "./_generated/api";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { githubUserAuthorizationAad } from "./githubUserAuthorizationModel";
import { HUB_GRANT_IDLE_MS, resources } from "./hubResourceOAuth";
import { deriveMcpTokenStatusFromExpiry } from "./mcpTokenHealth";
import { organizationProviderCredentialAad } from "./organization/providerCredentialModel";
import { openSecret, sameSealedSecret, sealSecret, vSealedSecret } from "./sealedSecret";

const { array, boolean, id, literal, object, union } = v;

// The one-time copy of the provider refresh tokens behind the hub refresh tokens that
// auth.samebase.com issued, before production moves to auth2.samebase.com, which keeps no grant and
// forwards the provider's own refresh token
// (reports/identity-broker-effect/production-move-design-2026-11-21.md, "Version 2"). It runs after
// the old hub froze this deployment's client: that hub then refuses every refresh and revoke of the
// client and never changes its grants again, so each export answers the same, and the copy calls no
// provider.

/** A stored hub refresh token: Cloudflare `oauth` connections and GitHub user authorizations. */
const vLegacyGrant = union(
  object({
    provider: literal("cloudflare"),
    rowId: id("organizationProviderCredentials"),
    organizationId: id("organizations"),
    refreshToken: vSealedSecret,
  }),
  object({
    provider: literal("github"),
    rowId: id("githubUserAuthorizations"),
    userId: id("users"),
    refreshToken: vSealedSecret,
  }),
);
type LegacyGrant = Infer<typeof vLegacyGrant>;

/**
`copied`: the row now holds the provider's refresh token. `not_found`: the old hub has no unexpired
grant for the stored token, as for a row that an earlier run copied. `busy`: the old hub was still
refreshing the grant; run again. `failed`: any other answer or error, or the row changed after the
read.
*/
const vCopyStatus = union(
  literal("copied"),
  literal("not_found"),
  literal("busy"),
  literal("failed"),
);
type CopyStatus = Infer<typeof vCopyStatus>;

/** One row of the result. It names the row by id only. */
const vCopyResult = union(
  object({
    provider: literal("cloudflare"),
    rowId: id("organizationProviderCredentials"),
    status: vCopyStatus,
  }),
  object({
    provider: literal("github"),
    rowId: id("githubUserAuthorizations"),
    status: vCopyStatus,
  }),
);
type CopyResult = Infer<typeof vCopyResult>;

/** The old hub waits for no provider in an export; a hung hub must not hold the run. */
const EXPORT_TIMEOUT_MS = 30_000;

const sureExport = sureObject({ refresh_token: sureString, resource: sureString });
const sureError = sureObject({ error: sureString });

/** In creation order: the Cloudflare `oauth` connections, then the GitHub user authorizations. */
export const readLegacyGrants = internalQuery({
  args: {},
  returns: array(vLegacyGrant),
  handler: async (ctx): Promise<LegacyGrant[]> => {
    const grants: LegacyGrant[] = [];
    for (const row of await ctx.db.query("organizationProviderCredentials").collect()) {
      if (row.cloudflare?.auth.method === "oauth") {
        grants.push({
          provider: "cloudflare",
          rowId: row._id,
          organizationId: row.organizationId,
          refreshToken: row.cloudflare.auth.refreshCredential,
        });
      }
    }
    for (const row of await ctx.db.query("githubUserAuthorizations").collect()) {
      grants.push({
        provider: "github",
        rowId: row._id,
        userId: row.userId,
        refreshToken: row.refreshToken,
      });
    }
    return grants;
  },
});

/**
Stores the copied token when the row still holds `expected`, the sealed hub token that the run read:
a reconnect or a disconnect after the read keeps its own value. A refresh that the old hub refused
marked the token invalid; the copy gives it the health that a successful refresh gives.
*/
export const writeCloudflareGrant = internalMutation({
  args: {
    rowId: id("organizationProviderCredentials"),
    expected: vSealedSecret,
    refreshCredential: vSealedSecret,
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    const cloudflare = row?.cloudflare;
    if (row === null || cloudflare === undefined) return false;
    const { auth } = cloudflare;
    if (auth.method !== "oauth" || !sameSealedSecret(auth.refreshCredential, args.expected)) {
      return false;
    }
    const now = Date.now();
    await ctx.db.patch(row._id, {
      cloudflare: {
        ...cloudflare,
        auth: { ...auth, refreshCredential: args.refreshCredential },
        tokenHealth:
          cloudflare.tokenHealth?.status === "invalid"
            ? {
                status: deriveMcpTokenStatusFromExpiry(auth.credentialExpiresAt, now),
                checkedAt: now,
                expiresAt: auth.credentialExpiresAt,
                source: "refresh_attempt",
              }
            : cloudflare.tokenHealth,
        updatedAt: now,
      },
    });
    return true;
  },
});

/**
Stores the copied token when the row still holds `expected`. `refreshTokenExpiresAt` is samebase.com's
own 90-day deadline, as after a refresh: neither hub reports the provider's expiry. It also undoes the
deadline of `now` that a refused refresh set.
*/
export const writeGitHubGrant = internalMutation({
  args: {
    rowId: id("githubUserAuthorizations"),
    expected: vSealedSecret,
    refreshToken: vSealedSecret,
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (row === null || !sameSealedSecret(row.refreshToken, args.expected)) return false;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      refreshToken: args.refreshToken,
      refreshTokenExpiresAt: now + HUB_GRANT_IDLE_MS,
      updatedAt: now,
    });
    return true;
  },
});

/**
`POST /migration/export` of the old hub with this deployment's client (client_secret_post): the
provider's refresh token behind `refreshToken`, when the grant is the client's, unexpired, and for
the provider's resource. No log line or result holds a token.
*/
async function exportGrant(
  provider: LegacyGrant["provider"],
  refreshToken: string,
): Promise<{ status: "copied"; refreshToken: string } | { status: Exclude<CopyStatus, "copied"> }> {
  const response = await fetch(`${env.IDENTITY_HUB_ISSUER}/migration/export`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: createUrlSearchParams({
      client_id: env.IDENTITY_HUB_CLIENT_ID,
      client_secret: env.IDENTITY_HUB_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
  });
  if (response.status === 200) {
    const [valid, answer] = sureExport(await response.json());
    return valid && answer.resource === resources[provider]
      ? { status: "copied", refreshToken: answer.refresh_token }
      : { status: "failed" };
  }
  if (response.status === 400) {
    const [valid, answer] = sureError(await response.json());
    return { status: valid && answer.error === "invalid_grant" ? "not_found" : "failed" };
  }
  return { status: response.status === 409 ? "busy" : "failed" };
}

async function copyGrant(
  ctx: Pick<ActionCtx, "runAction" | "runMutation">,
  grant: LegacyGrant,
): Promise<CopyStatus> {
  const aad =
    grant.provider === "cloudflare"
      ? organizationProviderCredentialAad(grant.organizationId, "cloudflare.auth.refreshCredential")
      : githubUserAuthorizationAad(grant.userId, "refreshToken");
  const exported = await exportGrant(
    grant.provider,
    await openSecret({ sealed: grant.refreshToken, aad }),
  );
  if (exported.status !== "copied") return exported.status;
  const sealed = await sealSecret(ctx, { plaintext: exported.refreshToken, aad });
  const written =
    grant.provider === "cloudflare"
      ? await ctx.runMutation(internal.hubGrantCopy.writeCloudflareGrant, {
          rowId: grant.rowId,
          expected: grant.refreshToken,
          refreshCredential: sealed,
        })
      : await ctx.runMutation(internal.hubGrantCopy.writeGitHubGrant, {
          rowId: grant.rowId,
          expected: grant.refreshToken,
          refreshToken: sealed,
        });
  return written ? "copied" : "failed";
}

/**
Copies every stored hub refresh token: `npx convex run --prod hubGrantCopy:copyLegacyGrants`, with
IDENTITY_HUB_* still naming the old hub and its client. It returns each row's status in the read's
order. A second run reports a copied row `not_found` and changes nothing, so it is safe to run again
after a `busy` or a `failed`.
*/
export const copyLegacyGrants = internalAction({
  args: {},
  returns: array(vCopyResult),
  handler: async (ctx): Promise<CopyResult[]> => {
    const grants: LegacyGrant[] = await ctx.runQuery(internal.hubGrantCopy.readLegacyGrants, {});
    // In parallel: about 20 rows, each up to EXPORT_TIMEOUT_MS, must fit in one action.
    return await Promise.all(
      grants.map(async (grant): Promise<CopyResult> => {
        let status: CopyStatus;
        try {
          status = await copyGrant(ctx, grant);
        } catch (error) {
          // The error name only: a message can quote an answer.
          console.warn("hub_grant_copy:failed", {
            provider: grant.provider,
            rowId: grant.rowId,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          status = "failed";
        }
        return grant.provider === "cloudflare"
          ? { provider: "cloudflare", rowId: grant.rowId, status }
          : { provider: "github", rowId: grant.rowId, status };
      }),
    );
  },
});
