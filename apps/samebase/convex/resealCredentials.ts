import { notEmpty } from "@samebase/dependent/main";
import { v, type Infer } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { githubUserAuthorizationAad } from "./githubUserAuthorizationModel";
import {
  organizationCiCredentialAad,
  organizationProviderCredentialAad,
} from "./organization/providerCredentialModel";
import {
  openSecret,
  readCurrentCredentialKeyId,
  sameSealedSecret,
  sealSecret,
  vSealedSecret,
  type SealedSecret,
} from "./sealedSecret";

const { array, id, number, object, optional } = v;

/** The sealed credential fields of each row, with the ids that their AAD needs. */
const vResealRows = object({
  providerCredentials: array(
    object({
      id: id("organizationProviderCredentials"),
      organizationId: id("organizations"),
      convexCredential: optional(vSealedSecret),
      cloudflareCredential: optional(vSealedSecret),
      cloudflareRefreshCredential: optional(vSealedSecret),
    }),
  ),
  ciCredentials: array(
    object({
      id: id("organizationCiCredentials"),
      organizationId: id("organizations"),
      cloudflareApiToken: optional(vSealedSecret),
      convexAccessToken: optional(vSealedSecret),
    }),
  ),
  githubUserAuthorizations: array(
    object({
      id: id("githubUserAuthorizations"),
      userId: id("users"),
      accessToken: vSealedSecret,
      refreshToken: vSealedSecret,
    }),
  ),
});

/** A field to replace: the value that the action read, and its seal under the current key. */
const vResealChange = object({ expected: vSealedSecret, sealed: vSealedSecret });
type ResealChange = Infer<typeof vResealChange>;

/**
The fields that one write sealed again under the current key, or left as they were because the row
changed after the read.
*/
const vResealWrite = object({ resealed: number(), skippedChanged: number() });
type ResealWrite = Infer<typeof vResealWrite>;

const vResealSummary = object({
  resealed: number(),
  unchanged: number(),
  skippedChanged: number(),
});
type ResealSummary = Infer<typeof vResealSummary>;

export const readRows = internalQuery({
  args: {},
  returns: vResealRows,
  handler: async (ctx) => {
    const [providerCredentials, ciCredentials, githubUserAuthorizations] = await Promise.all([
      ctx.db.query("organizationProviderCredentials").collect(),
      ctx.db.query("organizationCiCredentials").collect(),
      ctx.db.query("githubUserAuthorizations").collect(),
    ]);
    return {
      providerCredentials: providerCredentials.map(
        ({ _id, organizationId, convex, cloudflare }) => ({
          id: _id,
          organizationId,
          convexCredential: convex?.auth.credential,
          cloudflareCredential: cloudflare?.auth.credential,
          cloudflareRefreshCredential:
            cloudflare && cloudflare.auth.method !== "api_key"
              ? cloudflare.auth.refreshCredential
              : undefined,
        }),
      ),
      ciCredentials: ciCredentials.map(({ _id, organizationId, cloudflare, convex }) => ({
        id: _id,
        organizationId,
        cloudflareApiToken: cloudflare?.apiToken,
        convexAccessToken: convex?.accessToken,
      })),
      githubUserAuthorizations: githubUserAuthorizations.map(
        ({ _id, userId, accessToken, refreshToken }) => ({
          id: _id,
          userId,
          accessToken,
          refreshToken,
        }),
      ),
    };
  },
});

type AppliedChanges = { resealed: number };

/**
Applies `change` when the field still holds the value that the action read, so a refresh or a
reconnect between the read and the write keeps its new value.
*/
function applyChange(
  stored: SealedSecret,
  change: ResealChange | undefined,
  applied: AppliedChanges,
): SealedSecret {
  if (change === undefined || !sameSealedSecret(stored, change.expected)) {
    return stored;
  }
  applied.resealed += 1;
  return change.sealed;
}

/** The requested changes that the write did not apply count as skipped: the row changed. */
function readWrite(changes: Array<ResealChange | undefined>, applied: AppliedChanges): ResealWrite {
  return {
    resealed: applied.resealed,
    skippedChanged: changes.filter(notEmpty).length - applied.resealed,
  };
}

export const writeProviderCredentials = internalMutation({
  args: {
    id: id("organizationProviderCredentials"),
    convexCredential: optional(vResealChange),
    cloudflareCredential: optional(vResealChange),
    cloudflareRefreshCredential: optional(vResealChange),
  },
  returns: vResealWrite,
  handler: async (ctx, args) => {
    const applied = { resealed: 0 };
    const row = await ctx.db.get(args.id);
    if (row !== null) {
      const { convex, cloudflare } = row;
      const patch = {
        convex: convex && {
          ...convex,
          auth: {
            ...convex.auth,
            credential: applyChange(convex.auth.credential, args.convexCredential, applied),
          },
        },
        cloudflare: cloudflare && {
          ...cloudflare,
          auth:
            cloudflare.auth.method === "api_key"
              ? {
                  ...cloudflare.auth,
                  credential: applyChange(
                    cloudflare.auth.credential,
                    args.cloudflareCredential,
                    applied,
                  ),
                }
              : {
                  ...cloudflare.auth,
                  credential: applyChange(
                    cloudflare.auth.credential,
                    args.cloudflareCredential,
                    applied,
                  ),
                  refreshCredential: applyChange(
                    cloudflare.auth.refreshCredential,
                    args.cloudflareRefreshCredential,
                    applied,
                  ),
                },
        },
      };
      if (applied.resealed > 0) {
        await ctx.db.patch(row._id, patch);
      }
    }
    return readWrite(
      [args.convexCredential, args.cloudflareCredential, args.cloudflareRefreshCredential],
      applied,
    );
  },
});

export const writeCiCredentials = internalMutation({
  args: {
    id: id("organizationCiCredentials"),
    cloudflareApiToken: optional(vResealChange),
    convexAccessToken: optional(vResealChange),
  },
  returns: vResealWrite,
  handler: async (ctx, args) => {
    const applied = { resealed: 0 };
    const row = await ctx.db.get(args.id);
    if (row !== null) {
      const { cloudflare, convex } = row;
      const patch = {
        cloudflare: cloudflare && {
          ...cloudflare,
          apiToken: applyChange(cloudflare.apiToken, args.cloudflareApiToken, applied),
        },
        convex: convex && {
          ...convex,
          accessToken: applyChange(convex.accessToken, args.convexAccessToken, applied),
        },
      };
      if (applied.resealed > 0) {
        await ctx.db.patch(row._id, patch);
      }
    }
    return readWrite([args.cloudflareApiToken, args.convexAccessToken], applied);
  },
});

export const writeGitHubUserAuthorization = internalMutation({
  args: {
    id: id("githubUserAuthorizations"),
    accessToken: optional(vResealChange),
    refreshToken: optional(vResealChange),
  },
  returns: vResealWrite,
  handler: async (ctx, args) => {
    const applied = { resealed: 0 };
    const row = await ctx.db.get(args.id);
    if (row !== null) {
      const patch = {
        accessToken: applyChange(row.accessToken, args.accessToken, applied),
        refreshToken: applyChange(row.refreshToken, args.refreshToken, applied),
      };
      if (applied.resealed > 0) {
        await ctx.db.patch(row._id, patch);
      }
    }
    return readWrite([args.accessToken, args.refreshToken], applied);
  },
});

/**
The key rotation step: add the new key to CREDENTIAL_KEYS, set `current` to it, run this action on
the deployment, then remove the old key from the ring. Each stored provider credential sealed under
another key is opened with that key and sealed again under `current`, with the AAD of its row and
field; a value under `current` stays. The writes compare and set: a field that a refresh or a
reconnect changed after the read keeps its new value and counts as `skippedChanged`, and the next run
handles it. A second run reports every field unchanged. It returns counts only, never a credential.
*/
export const run = internalAction({
  args: {},
  returns: vResealSummary,
  handler: async (ctx): Promise<ResealSummary> => {
    const currentKeyId = readCurrentCredentialKeyId();
    const rows: Infer<typeof vResealRows> = await ctx.runQuery(
      internal.resealCredentials.readRows,
      {},
    );
    const summary = { resealed: 0, unchanged: 0, skippedChanged: 0 };
    const plan = async (
      stored: SealedSecret | undefined,
      aad: string,
    ): Promise<ResealChange | undefined> => {
      if (stored === undefined) {
        return undefined;
      }
      if (stored.keyId === currentKeyId) {
        summary.unchanged += 1;
        return undefined;
      }
      const plaintext = await openSecret({ sealed: stored, aad });
      return { expected: stored, sealed: await sealSecret(ctx, { plaintext, aad }) };
    };
    const add = (write: ResealWrite) => {
      summary.resealed += write.resealed;
      summary.skippedChanged += write.skippedChanged;
    };

    for (const row of rows.providerCredentials) {
      const aad = (field: Parameters<typeof organizationProviderCredentialAad>[1]) =>
        organizationProviderCredentialAad(row.organizationId, field);
      add(
        await ctx.runMutation(internal.resealCredentials.writeProviderCredentials, {
          id: row.id,
          convexCredential: await plan(row.convexCredential, aad("convex.auth.credential")),
          cloudflareCredential: await plan(
            row.cloudflareCredential,
            aad("cloudflare.auth.credential"),
          ),
          cloudflareRefreshCredential: await plan(
            row.cloudflareRefreshCredential,
            aad("cloudflare.auth.refreshCredential"),
          ),
        }),
      );
    }
    for (const row of rows.ciCredentials) {
      add(
        await ctx.runMutation(internal.resealCredentials.writeCiCredentials, {
          id: row.id,
          cloudflareApiToken: await plan(
            row.cloudflareApiToken,
            organizationCiCredentialAad(row.organizationId, "cloudflare.apiToken"),
          ),
          convexAccessToken: await plan(
            row.convexAccessToken,
            organizationCiCredentialAad(row.organizationId, "convex.accessToken"),
          ),
        }),
      );
    }
    for (const row of rows.githubUserAuthorizations) {
      add(
        await ctx.runMutation(internal.resealCredentials.writeGitHubUserAuthorization, {
          id: row.id,
          accessToken: await plan(
            row.accessToken,
            githubUserAuthorizationAad(row.userId, "accessToken"),
          ),
          refreshToken: await plan(
            row.refreshToken,
            githubUserAuthorizationAad(row.userId, "refreshToken"),
          ),
        }),
      );
    }
    return summary;
  },
});
