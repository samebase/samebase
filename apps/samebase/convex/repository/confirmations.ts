import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type DatabaseReader, type MutationCtx } from "../_generated/server";
import { isRecord } from "../jsonUtils";
import { createActionConfirmationTokenValue, sha256Hex } from "../mcp/tokens";
import { requireRepositoryForUser } from "../organizationAccess";
import type { ConfirmationSurface, ConfirmedResource } from "./confirmationModel";
import type { ActionConfirmation, ActionConfirmationRequest } from "./contracts/actionConfirmation";
import type { retryInfrastructureProvisioningContract } from "./contracts/retryInfrastructureProvisioning";

/*
The confirmation check of the retry (rfcs/125), shared by the dashboard and MCP. The first call gets
a challenge and performs nothing. The second call sends the token and the exact acknowledgement
sentence; the check accepts them only for the same user, action, and normalized request, consumes
the token, and writes the audit row.
*/

const { id } = v;

const ACTION_CONFIRMATION_TTL_MS = 10 * 60 * 1000;
/** What a rejected caller does next, in the words of its surface. */
const START_AGAIN = {
  dashboard: "Nothing changed. Start the action again to get a new confirmation.",
  mcp: "Nothing changed. Call the action again without confirmation to get a new confirmation request.",
} as const satisfies Record<ConfirmationSurface["kind"], string>;

/** A token approves exactly this request. */
export type ConfirmedActionRequest = {
  action: typeof retryInfrastructureProvisioningContract.id;
  repositoryId: Id<"repositories">;
};

type ActionConfirmationCheck = ActionConfirmationRequest | { state: "confirmed" };

type ConfirmationSubject = {
  organizationId: Id<"organizations">;
  resource: ConfirmedResource;
  effect: string;
  /** The approved change, which the acknowledgement names after its surface prefix. */
  approval: string;
};

/** JSON with sorted object keys, so equal requests have equal digests in any key order. */
function toCanonicalJson(request: ConfirmedActionRequest): string {
  return JSON.stringify(request, (_key, value: unknown) =>
    isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((name) => [name, value[name]]),
        )
      : value,
  );
}

function isSameSurface(issued: ConfirmationSurface, current: ConfirmationSurface): boolean {
  switch (issued.kind) {
    case "dashboard":
      return current.kind === "dashboard";
    case "mcp":
      return (
        current.kind === "mcp" &&
        current.grantId === issued.grantId &&
        current.clientId === issued.clientId
      );
    default:
      issued satisfies never;
      throw new Error("Unsupported confirmation surface.");
  }
}

/** Re-reads the repository that the request names, from local rows only. */
async function readConfirmationSubject(
  db: DatabaseReader,
  args: { userId: Id<"users">; request: ConfirmedActionRequest },
): Promise<ConfirmationSubject> {
  const { request } = args;
  const repository = await requireRepositoryForUser(db, {
    userId: args.userId,
    repositoryId: request.repositoryId,
  });
  if (repository.state !== "connected") {
    throw new ConvexError("This repository has no connected GitHub repository yet.");
  }
  const organization = await db.get(repository.organizationId);
  if (!organization) {
    throw new Error("Repository organization not found.");
  }
  const repositoryName = `${organization.githubOwnerLogin}/${repository.githubRepositoryName}`;

  return {
    organizationId: repository.organizationId,
    resource: { kind: "repository", githubRepositoryFullName: repositoryName },
    effect: `Samebase starts a new setup run for ${repositoryName}. It writes the credential of the organization's Convex connection into the repository's GitHub Actions secret CONVEX_ACCESS_TOKEN and the Convex team id into its variable CONVEX_TEAM_ID, replacing their values. If the starter is not seeded yet, it seeds the starter, which starts a deployment in the repository's GitHub Actions. Then it syncs the default branch tree.`,
    approval: `a new setup run for ${repositoryName}, which replaces its GitHub Actions secret and variable with the organization's Convex connection credential and team id`,
  };
}

/**
Without `confirmation`, stores a token hash bound to the user, the surface, the action, and the
digest of the normalized request, and returns the challenge; the caller performs nothing. With
`confirmation`, it requires that token, unused and unexpired, issued to this user on this surface
for this action and an identical request, plus the exact acknowledgement. It then consumes the token and writes the audit row in the
same transaction, and the caller performs the request.
*/
export async function checkActionConfirmation(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    surface: ConfirmationSurface;
    request: ConfirmedActionRequest;
    confirmation: ActionConfirmation | undefined;
  },
): Promise<ActionConfirmationCheck> {
  const subject = await readConfirmationSubject(ctx.db, args);
  const requestDigest = await sha256Hex(toCanonicalJson(args.request));
  const now = Date.now();

  if (!args.confirmation) {
    const token = createActionConfirmationTokenValue();
    const expiresAt = now + ACTION_CONFIRMATION_TTL_MS;
    // A person ticks the dashboard sentence; an agent states the user's approval over MCP.
    const acknowledgement =
      args.surface.kind === "dashboard"
        ? `I approve ${subject.approval}`
        : `I confirm that the user approved ${subject.approval}`;
    const tokenId = await ctx.db.insert("actionConfirmationTokens", {
      tokenHash: await sha256Hex(token),
      userId: args.userId,
      surface: args.surface,
      action: args.request.action,
      requestDigest,
      effect: subject.effect,
      acknowledgement,
      createdAt: now,
      expiresAt,
    });
    await ctx.scheduler.runAfter(
      ACTION_CONFIRMATION_TTL_MS,
      internal.repository.confirmations.deleteToken,
      { tokenId },
    );
    return {
      state: "needs_confirmation",
      effect: subject.effect,
      acknowledgement,
      token,
      expiresAt,
    };
  }

  const tokenHash = await sha256Hex(args.confirmation.token);
  const issued = await ctx.db
    .query("actionConfirmationTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  const startAgain = START_AGAIN[args.surface.kind];
  if (!issued || issued.userId !== args.userId) {
    throw new ConvexError(`This confirmation token is not valid. ${startAgain}`);
  }
  // The sentence names its surface, and the audit row records the confirming surface, so a token
  // works only where it was issued: the dashboard, or the same MCP grant and client.
  if (!isSameSurface(issued.surface, args.surface)) {
    throw new ConvexError(`This confirmation token was issued to another client. ${startAgain}`);
  }
  if (issued.consumedAt) {
    throw new ConvexError(`This confirmation token was already used. ${startAgain}`);
  }
  if (issued.expiresAt <= now) {
    throw new ConvexError(`This confirmation token expired. ${startAgain}`);
  }
  if (issued.action !== args.request.action) {
    throw new ConvexError(`This confirmation token belongs to another action. ${startAgain}`);
  }
  if (issued.requestDigest !== requestDigest) {
    throw new ConvexError(
      args.surface.kind === "dashboard"
        ? `The request changed after it was approved. ${startAgain}`
        : "The arguments differ from the request that the user approved, so nothing changed. Send the approved arguments, or call again without confirmation to get a new confirmation request.",
    );
  }
  if (args.confirmation.acknowledgement.trim() !== issued.acknowledgement) {
    throw new ConvexError(
      `The acknowledgement does not match, so nothing changed. Send exactly: ${issued.acknowledgement}`,
    );
  }

  await ctx.db.patch(issued._id, { consumedAt: now });
  await ctx.db.insert("audit_confirmedActions_events", {
    userId: args.userId,
    organizationId: subject.organizationId,
    repositoryId: args.request.repositoryId,
    action: args.request.action,
    resource: subject.resource,
    requestDigest,
    effect: issued.effect,
    acknowledgement: issued.acknowledgement,
    surface: args.surface,
    issuedAt: issued.createdAt,
    confirmedAt: now,
  });
  return { state: "confirmed" };
}

/** Scheduled at a token's expiry. A used or unused token is no longer valid then. */
export const deleteToken = internalMutation({
  args: {
    tokenId: id("actionConfirmationTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const token = await ctx.db.get(args.tokenId);
    if (token) {
      await ctx.db.delete(token._id);
    }
    return null;
  },
});
