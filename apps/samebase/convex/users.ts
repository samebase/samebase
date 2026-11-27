import type { DatabaseReader } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ConvexError, Infer, v } from "convex/values";
import { vViewerAccess, vViewerRoleResult } from "./identity/accessValidators";
import { requireOrganizationMembershipRecord } from "./organizationAccess";
import { action, mutation, query } from "./functions";
import { fetchConvexTeamTokenDetails } from "./convexManagementApi/client";
import { ConvexManagementApiError } from "./convexManagementApi/errors";
import type { CloudflareAccount } from "./cloudflareAccountDiscovery";
import {
  getOrganizationCiCredentials,
  getOrganizationProviderConfiguration,
  removeCiCredential,
  type OrganizationProviderConfiguration,
} from "./organizationProviderCredentials";
import {
  requireCloudflareCiTokenPermissions,
  requireConvexCiTeamAccess,
} from "./organization/ciCredentials";
import { hashOrganizationProviderSnapshot } from "./providerAuthFingerprint";
import {
  organizationCiCredentialAad,
  organizationProviderCredentialAad,
} from "./organization/providerCredentialModel";
import { sealSecret } from "./sealedSecret";
import {
  type AccountPresentation,
  normalizeAccountEmail,
  normalizeDisplayName,
  resolveAccountPresentation,
  vAccountPresentation,
} from "../shared/accountPresentation";
const { id, literal, number, object, optional, string, union } = v;
export const CURRENT_TERMS_VERSION = "2026-08-12";
const CURRENT_PRODUCT_UPDATE_EMAIL_CONSENT_VERSION = "2026-08-30";
const CURRENT_SESSION_RECORDING_CONSENT_VERSION = "2026-08-20";

const vProductUpdateEmailConsentDecision = union(literal("granted"), literal("denied"));
const vProductUpdateEmailConsentSource = union(
  literal("account_settings"),
  literal("right_sidebar"),
);
const vProductUpdateEmailConsentStatus = union(
  object({ state: literal("not_decided") }),
  object({ state: literal("granted") }),
  object({ state: literal("denied") }),
);
const vSessionRecordingConsentDecision = union(literal("granted"), literal("denied"));
const vSessionRecordingConsentStatus = union(
  object({ state: literal("not_decided") }),
  object({ state: literal("granted") }),
  object({ state: literal("denied") }),
);

const vSignInMethod = object({ email: string() });
const vGitHubSignInMethod = object({ email: string(), login: optional(string()) });
const vSignInMethods = object({
  google: union(vSignInMethod, v.null()),
  github: union(vGitHubSignInMethod, v.null()),
  password: union(vSignInMethod, v.null()),
});

const vConvexProviderAuthMethod = union(literal("oauth"), literal("api_key"));
const vCloudflareProviderAuthMethod = union(literal("oauth"), literal("api_key"));
const vConvexConnectionStatus = union(
  object({ state: literal("not_configured") }),
  object({
    state: literal("disconnected"),
    teamId: string(),
    teamSlug: optional(string()),
  }),
  object({
    state: literal("connected"),
    teamId: string(),
    teamSlug: optional(string()),
    authMethod: vConvexProviderAuthMethod,
    connectedBy: optional(vAccountPresentation),
  }),
);
const vCloudflareNotConfiguredConnectionStatus = object({
  state: literal("not_configured"),
});
const vCloudflareDisconnectedConnectionStatus = object({
  state: literal("disconnected"),
  accountId: string(),
  accountName: string(),
});
const vCloudflareConnectedConnectionStatus = object({
  state: literal("connected"),
  accountId: string(),
  accountName: string(),
  authMethod: vCloudflareProviderAuthMethod,
  connectedBy: optional(vAccountPresentation),
});
const vCloudflareConnectionStatus = union(
  vCloudflareNotConfiguredConnectionStatus,
  vCloudflareDisconnectedConnectionStatus,
  vCloudflareConnectedConnectionStatus,
);
type CloudflareConnectionStatus = Infer<typeof vCloudflareConnectionStatus>;

async function readProviderConnectorPresentation(
  db: DatabaseReader,
  connectedByUserId: Id<"users">,
  viewerUserId: Id<"users">,
): Promise<AccountPresentation | undefined> {
  const user = await db.get(connectedByUserId);
  if (user === null) {
    throw new Error("Provider connector user reference is invalid.");
  }
  if (user.state === "deleted") {
    throw new Error("Provider connector user reference is invalid.");
  }
  if (user.state !== "active") {
    return undefined;
  }
  const accountPresentation = resolveAccountPresentation(user);
  if (connectedByUserId !== viewerUserId && accountPresentation.kind === "email") {
    return undefined;
  }
  return accountPresentation;
}

function normalizeApiToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new ConvexError("API key is required");
  }
  return normalized;
}

function buildCloudflareConnectionStatus(
  configuration: Pick<
    OrganizationProviderConfiguration,
    "cloudflareAccount" | "cloudflareCredential"
  >,
): CloudflareConnectionStatus {
  const account = configuration.cloudflareAccount;
  const credential = configuration.cloudflareCredential;
  if (credential === undefined) {
    return account === undefined
      ? { state: "not_configured" }
      : {
          state: "disconnected",
          accountId: account.accountId,
          accountName: account.accountName,
        };
  }
  if (account === undefined) {
    throw new Error("Cloudflare credential has no configured account.");
  }

  return {
    state: "connected",
    accountId: account.accountId,
    accountName: account.accountName,
    authMethod: credential.auth.method,
  };
}

async function fetchConvexApiKeyTeamDetails(token: string): Promise<{
  teamId: string;
}> {
  try {
    return await fetchConvexTeamTokenDetails(token);
  } catch (error) {
    if (
      error instanceof ConvexManagementApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      throw new ConvexError("Invalid Convex API key");
    }
    if (error instanceof ConvexManagementApiError) {
      throw new ConvexError(`Convex API key check failed (${error.status}).`);
    }
    throw new ConvexError("Convex API key check failed.");
  }
}

// Public

export const viewer = query({
  access: "access_public",
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      accountPresentation: vAccountPresentation,
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = ctx.viewer.userId;
    const user = ctx.viewer.user;
    if (userId === null || !user) {
      return null;
    }

    return {
      _id: user._id,
      accountPresentation: resolveAccountPresentation(user),
    };
  },
});

export const getUserSettings = query({
  access: "access_user_preferences",
  args: {},
  returns: object({
    displayName: optional(string()),
    accountEmail: string(),
    signInMethods: vSignInMethods,
  }),
  handler: async (ctx) => {
    const user = ctx.viewer.user;
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (query) => query.eq("userId", user._id))
      .collect();
    let google: { email: string } | null = null;
    let github: Infer<typeof vGitHubSignInMethod> | null = null;
    let password: { email: string } | null = null;
    for (const account of accounts) {
      switch (account.provider) {
        case "google":
          if (google !== null || account.emailVerified === undefined) {
            throw new Error("Google sign-in identity is inconsistent.");
          }
          google = { email: normalizeAccountEmail(account.emailVerified) };
          break;
        case "github":
          if (github !== null || account.emailVerified === undefined) {
            throw new Error("GitHub sign-in identity is inconsistent.");
          }
          // The broker reports no GitHub login: only an identity that the GitHub method before the
          // broker signed in has one.
          github = {
            email: normalizeAccountEmail(account.emailVerified),
            ...(account.githubLogin === undefined ? {} : { login: account.githubLogin }),
          };
          break;
        case "password":
          if (password !== null) {
            throw new Error("Password sign-in identity is inconsistent.");
          }
          password = { email: normalizeAccountEmail(account.providerAccountId) };
          break;
        default:
          break;
      }
    }
    return {
      displayName:
        user.displayName === undefined ? undefined : normalizeDisplayName(user.displayName),
      accountEmail: normalizeAccountEmail(user.email),
      signInMethods: { google, github, password },
    };
  },
});

export const getSessionRecordingConsent = query({
  access: "access_dashboard",
  args: {},
  returns: vSessionRecordingConsentStatus,
  handler: async (ctx) => {
    const consent = ctx.viewer.user.sessionRecordingConsent;
    if (
      consent === undefined ||
      consent.policyVersion !== CURRENT_SESSION_RECORDING_CONSENT_VERSION
    ) {
      return { state: "not_decided" } as const;
    }

    return { state: consent.decision } as const;
  },
});

export const getProductUpdateEmailConsent = query({
  access: "access_user_preferences",
  args: {},
  returns: vProductUpdateEmailConsentStatus,
  handler: async (ctx) => {
    const consent = ctx.viewer.user.productUpdateEmailConsent;
    if (
      consent === undefined ||
      consent.email !== normalizeAccountEmail(ctx.viewer.user.email) ||
      consent.policyVersion !== CURRENT_PRODUCT_UPDATE_EMAIL_CONSENT_VERSION
    ) {
      return { state: "not_decided" } as const;
    }

    return { state: consent.decision } as const;
  },
});

export const setDisplayName = mutation({
  access: "access_user_preferences",
  args: {
    displayName: union(string(), v.null()),
  },
  returns: vAccountPresentation,
  handler: async (ctx, args) => {
    const displayName =
      args.displayName === null ? undefined : normalizeDisplayName(args.displayName);
    const accountPresentation = resolveAccountPresentation({
      email: ctx.viewer.user.email,
      ...(displayName === undefined ? {} : { displayName }),
    });
    await ctx.db.patch("users", ctx.viewer.userId, {
      displayName,
    });
    return accountPresentation;
  },
});

export const setSessionRecordingConsent = mutation({
  access: "access_dashboard",
  args: {
    decision: vSessionRecordingConsentDecision,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = ctx.viewer.user.sessionRecordingConsent;
    if (
      current?.decision === args.decision &&
      current.policyVersion === CURRENT_SESSION_RECORDING_CONSENT_VERSION
    ) {
      return null;
    }

    await ctx.db.patch("users", ctx.viewer.userId, {
      sessionRecordingConsent: {
        decision: args.decision,
        policyVersion: CURRENT_SESSION_RECORDING_CONSENT_VERSION,
        decidedAt: Date.now(),
      },
    });
    return null;
  },
});

export const setProductUpdateEmailConsent = mutation({
  access: "access_user_preferences",
  args: {
    decision: vProductUpdateEmailConsentDecision,
    source: vProductUpdateEmailConsentSource,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = ctx.viewer.user.productUpdateEmailConsent;
    const email = normalizeAccountEmail(ctx.viewer.user.email);
    if (
      current?.decision === args.decision &&
      current.email === email &&
      current.policyVersion === CURRENT_PRODUCT_UPDATE_EMAIL_CONSENT_VERSION
    ) {
      return null;
    }

    await ctx.db.patch("users", ctx.viewer.userId, {
      productUpdateEmailConsent: {
        decision: args.decision,
        email,
        policyVersion: CURRENT_PRODUCT_UPDATE_EMAIL_CONSENT_VERSION,
        decidedAt: Date.now(),
        source: args.source,
      },
    });
    return null;
  },
});

export const acceptCurrentTerms = mutation({
  access: "access_account_settings",
  args: {
    termsAccepted: literal(true),
    productUpdateEmailConsent: vProductUpdateEmailConsentDecision,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = ctx.viewer.user;
    if (user.state !== "active") {
      throw new Error("An active Samebase account is required.");
    }
    if (user.termsAcceptedAt !== undefined) {
      return null;
    }
    if (ctx.viewer.role !== "role_terms_pending") {
      throw new Error("An approved Samebase account is required.");
    }

    const decidedAt = Date.now();
    await ctx.db.patch("users", ctx.viewer.userId, {
      termsVersion: CURRENT_TERMS_VERSION,
      termsAcceptedAt: decidedAt,
      productUpdateEmailConsent: {
        decision: args.productUpdateEmailConsent,
        email: normalizeAccountEmail(user.email),
        policyVersion: CURRENT_PRODUCT_UPDATE_EMAIL_CONSENT_VERSION,
        decidedAt,
        source: "terms_acceptance",
      },
    });
    return null;
  },
});

export const currentViewerAccess = query({
  access: "access_public",
  args: {},
  returns: vViewerAccess,
  handler: async (ctx) => {
    return {
      role: ctx.viewer.role,
      accessKeys: [...ctx.viewer.accessKeys],
      termsAccepted: ctx.viewer.user === null || ctx.viewer.user.termsAcceptedAt !== undefined,
    };
  },
});

export const currentViewerRole = query({
  access: "access_public",
  args: {},
  returns: vViewerRoleResult,
  handler: async (ctx) => {
    return { role: ctx.viewer.role };
  },
});

export const getConvexConnectionStatus = query({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vConvexConnectionStatus,
  handler: async (ctx, args): Promise<Infer<typeof vConvexConnectionStatus>> => {
    const membership = await requireOrganizationMembershipRecord(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const configuration = await getOrganizationProviderConfiguration(
      ctx.db,
      membership.organizationId,
    );
    if (configuration.convexTeam === undefined) {
      if (configuration.convexCredential !== undefined) {
        throw new Error("Convex credential has no configured team.");
      }
      return { state: "not_configured" };
    }
    if (configuration.convexCredential === undefined) {
      return { state: "disconnected", ...configuration.convexTeam };
    }
    const connectedBy =
      membership.role === "owner" && configuration.convexCredential.auth.method === "oauth"
        ? await readProviderConnectorPresentation(
            ctx.db,
            configuration.convexCredential.connectedByUserId,
            ctx.viewer.userId,
          )
        : undefined;
    return {
      state: "connected",
      ...configuration.convexTeam,
      authMethod: configuration.convexCredential.auth.method,
      ...(connectedBy ? { connectedBy } : {}),
    };
  },
});

export const disconnectConvex = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: ctx.viewer.userId },
    );
    if (configuration.convexCredential === undefined) {
      return null;
    }
    await ctx.runMutation(internal.organizationProviderCredentials.disconnectConvex, {
      organizationId,
      disconnectedByUserId: ctx.viewer.userId,
      expectedAuth: configuration.convexCredential.auth,
    });
    return null;
  },
});

export const getCloudflareConnectionStatus = query({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vCloudflareConnectionStatus,
  handler: async (ctx, args) => {
    const membership = await requireOrganizationMembershipRecord(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const configuration = await getOrganizationProviderConfiguration(
      ctx.db,
      membership.organizationId,
    );
    const status = buildCloudflareConnectionStatus(configuration);
    const credential = configuration.cloudflareCredential;
    if (
      membership.role !== "owner" ||
      status.state !== "connected" ||
      credential === undefined ||
      credential.auth.method === "api_key"
    ) {
      return status;
    }
    const connectedBy = await readProviderConnectorPresentation(
      ctx.db,
      credential.connectedByUserId,
      ctx.viewer.userId,
    );
    return connectedBy ? { ...status, connectedBy } : status;
  },
});

export const disconnectCloudflare = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: ctx.viewer.userId },
    );
    if (configuration.cloudflareCredential === undefined) {
      return null;
    }
    await ctx.runMutation(internal.organizationProviderCredentials.disconnectCloudflare, {
      organizationId,
      disconnectedByUserId: ctx.viewer.userId,
      expectedAuth: configuration.cloudflareCredential.auth,
    });
    return null;
  },
});

export const connectCloudflareWithApiToken = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    token: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const token = args.token.trim();
    if (!token) {
      throw new ConvexError("Cloudflare API token is required.");
    }

    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: ctx.viewer.userId },
    );
    const expectedProviderSnapshotHash = await hashOrganizationProviderSnapshot({
      provider: "cloudflare",
      accountId: configuration.cloudflareAccount?.accountId,
      credential: configuration.cloudflareCredential,
    });

    let accounts: CloudflareAccount[];
    try {
      accounts = await ctx.runAction(
        internal.cloudflareAccountDiscovery.listAccountsForUserApiToken,
        { token },
      );
    } catch {
      throw new ConvexError("Cloudflare API token check failed.");
    }
    if (accounts.length === 0) {
      throw new ConvexError("Cloudflare API token cannot access an account.");
    }
    if (accounts.length > 1) {
      throw new ConvexError("Use a Cloudflare API token that can access ONLY ONE account.");
    }

    const configuredAccount = configuration.cloudflareAccount;
    const [account] = accounts;
    if (configuredAccount !== undefined && account.accountId !== configuredAccount.accountId) {
      throw new ConvexError(
        `Use a Cloudflare API token that can access ONLY ${configuredAccount.accountName}.`,
      );
    }

    await ctx.runMutation(internal.organizationProviderCredentials.connectCloudflare, {
      organizationId,
      connectedByUserId: ctx.viewer.userId,
      expectedProviderSnapshotHash,
      auth: {
        method: "api_key",
        credential: await sealSecret(ctx, {
          plaintext: token,
          aad: organizationProviderCredentialAad(organizationId, "cloudflare.auth.credential"),
        }),
      },
      account,
    });
    return null;
  },
});

const vConvexApiKeyConnectionResult = v.object({
  teamId: v.string(),
});

export const connectConvexWithApiKey = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    token: v.string(),
  },
  returns: vConvexApiKeyConnectionResult,
  handler: async (ctx, args): Promise<Infer<typeof vConvexApiKeyConnectionResult>> => {
    const organizationId: Id<"organizations"> = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const token = normalizeApiToken(args.token);
    const details = await fetchConvexApiKeyTeamDetails(token);
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      {
        organizationId,
        userId: ctx.viewer.userId,
      },
    );
    const configuredTeam = configuration.convexTeam;
    if (configuredTeam !== undefined && configuredTeam.teamId !== details.teamId) {
      throw new ConvexError("Convex API key cannot access the configured Convex team.");
    }

    const expectedProviderSnapshotHash = await hashOrganizationProviderSnapshot({
      provider: "convex",
      teamId: configuredTeam?.teamId,
      credential: configuration.convexCredential,
    });
    await ctx.runMutation(internal.organizationProviderCredentials.connectConvex, {
      organizationId,
      connectedByUserId: ctx.viewer.userId,
      expectedProviderSnapshotHash,
      auth: {
        method: "api_key" as const,
        credential: await sealSecret(ctx, {
          plaintext: token,
          aad: organizationProviderCredentialAad(organizationId, "convex.auth.credential"),
        }),
      },
      teamId: details.teamId,
    });

    return { teamId: details.teamId };
  },
});

const ciCredentialConnectorFields = {
  updatedAt: number(),
  connectedBy: optional(vAccountPresentation),
};
const vCiCredentialsStatus = object({
  cloudflare: union(object({ accountId: string(), ...ciCredentialConnectorFields }), v.null()),
  convex: union(object({ teamId: string(), ...ciCredentialConnectorFields }), v.null()),
});

/**
Whether the organization's CI tokens are saved, and by whom. The tokens never leave the backend.
Owners see who saved a token, like the provider connections above.
*/
export const getCiCredentialsStatus = query({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: vCiCredentialsStatus,
  handler: async (ctx, args): Promise<Infer<typeof vCiCredentialsStatus>> => {
    const membership = await requireOrganizationMembershipRecord(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const ci = await getOrganizationCiCredentials(ctx.db, membership.organizationId);
    // Account deletion removes the entries of the deleted member before the user row goes.
    const readConnectedBy = async (connectedByUserId: Id<"users">) =>
      membership.role === "owner"
        ? await readProviderConnectorPresentation(ctx.db, connectedByUserId, ctx.viewer.userId)
        : undefined;
    const [cloudflareConnectedBy, convexConnectedBy] = await Promise.all([
      ci?.cloudflare ? readConnectedBy(ci.cloudflare.connectedByUserId) : undefined,
      ci?.convex ? readConnectedBy(ci.convex.connectedByUserId) : undefined,
    ]);
    return {
      cloudflare: ci?.cloudflare
        ? {
            accountId: ci.cloudflare.accountId,
            updatedAt: ci.cloudflare.updatedAt,
            ...(cloudflareConnectedBy ? { connectedBy: cloudflareConnectedBy } : {}),
          }
        : null,
      convex: ci?.convex
        ? {
            teamId: ci.convex.teamId,
            updatedAt: ci.convex.updatedAt,
            ...(convexConnectedBy ? { connectedBy: convexConnectedBy } : {}),
          }
        : null,
    };
  },
});

/**
Saves the organization's Cloudflare CI token, after requireCloudflareCiTokenPermissions confirmed
that it is active and reaches the organization's connected account with every permission group that
a setup stack needs.
*/
export const setCloudflareCiToken = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    token: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const token = args.token.trim();
    if (!token) {
      throw new ConvexError("Cloudflare API token is required.");
    }
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: ctx.viewer.userId },
    );
    const account = configuration.cloudflareAccount;
    if (account === undefined || configuration.cloudflareCredential === undefined) {
      throw new ConvexError("Connect Cloudflare before you save its CI token.");
    }
    await requireCloudflareCiTokenPermissions({ token, account });

    await ctx.runMutation(internal.organizationProviderCredentials.setCloudflareCiCredential, {
      organizationId,
      userId: ctx.viewer.userId,
      apiToken: await sealSecret(ctx, {
        plaintext: token,
        aad: organizationCiCredentialAad(organizationId, "cloudflare.apiToken"),
      }),
      accountId: account.accountId,
    });
    return null;
  },
});

/**
Saves the organization's Convex CI token, a team access token that must read the organization's
connected team.
*/
export const setConvexCiToken = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    token: string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      { userId: ctx.viewer.userId, organizationId: args.organizationId },
    );
    const token = args.token.trim();
    if (!token) {
      throw new ConvexError("Convex team access token is required.");
    }
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      { organizationId, userId: ctx.viewer.userId },
    );
    const team = configuration.convexTeam;
    if (team === undefined || configuration.convexCredential === undefined) {
      throw new ConvexError("Connect Convex before you save its CI token.");
    }
    await requireConvexCiTeamAccess({
      token,
      teamId: team.teamId,
      teamLabel: team.teamSlug ?? team.teamId,
    });

    await ctx.runMutation(internal.organizationProviderCredentials.setConvexCiCredential, {
      organizationId,
      userId: ctx.viewer.userId,
      accessToken: await sealSecret(ctx, {
        plaintext: token,
        aad: organizationCiCredentialAad(organizationId, "convex.accessToken"),
      }),
      teamId: team.teamId,
    });
    return null;
  },
});

/** Removes one CI token. Repositories that already hold it keep their Actions secrets. */
export const removeCiToken = mutation({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    provider: union(literal("cloudflare"), literal("convex")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await removeCiCredential(ctx, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
      provider: args.provider,
    });
    return null;
  },
});
