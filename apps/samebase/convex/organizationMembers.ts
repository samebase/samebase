import { RequestError } from "@octokit/request-error";
import { ConvexError, Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type DatabaseReader,
  type DatabaseWriter,
} from "./_generated/server";
import { action, mutation, query } from "./functions";
import { createGitHubInstallationOctokit } from "./githubApp";
import {
  requireAnotherActiveOrganizationOwner,
  requireOrganizationMembership,
  requireOrganizationMembershipUser,
  requireOrganizationOwnerAccessContext,
} from "./organizationAccess";
import { readGitHubSignInProviderAccountId } from "./githubUserAuthorizations";
import { vGitHubOwnerType, vOrganizationMembershipRole } from "./organizationModel";
import {
  readGitHubOrganizationRelationship,
  readGitHubUserByAccountId,
  readGitHubUserByLogin,
  readPublicGitHubUserByLogin,
  vGitHubRelationship,
  type GitHubInvitationTarget,
  type GitHubRelationship,
} from "./organizationMemberGitHub";
import {
  readActiveUser,
  resolveUserReferencePresentation,
  type NonDeletedUserLifecycleDoc,
} from "./userLifecycle";
import { vUserReferencePresentation } from "../shared/userReferencePresentation";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const vMember = object({
  membershipId: id("organizationMemberships"),
  userId: id("users"),
  label: string(),
  avatarUrl: optional(string()),
  githubLogin: optional(string()),
  role: vOrganizationMembershipRole,
  isViewer: boolean(),
  isDeleting: boolean(),
  isOnlyActiveOwner: boolean(),
  isPersonalGithubOwnerIdentity: boolean(),
});

const vPendingInvitation = object({
  invitationId: id("organizationInvitations"),
  githubLogin: string(),
  githubAvatarUrl: optional(string()),
  createdAt: number(),
  expiresAt: number(),
  code: string(),
  createdBy: vUserReferencePresentation,
});

const vGetPageResult = object({
  organization: object({
    organizationId: id("organizations"),
    githubOwnerLogin: string(),
    githubOwnerType: vGitHubOwnerType,
  }),
  viewerRole: vOrganizationMembershipRole,
  members: array(vMember),
  pendingInvitations: optional(array(vPendingInvitation)),
});
type GetPageResult = Infer<typeof vGetPageResult>;

const vInvitationViewerState = union(
  literal("signed_out"),
  literal("can_accept"),
  literal("wrong_github_account"),
  literal("already_member"),
);

const vGetInvitationResult = union(
  object({
    state: literal("available"),
    organizationOwnerLogin: string(),
    targetLogin: string(),
    targetAvatarUrl: optional(string()),
    viewerState: vInvitationViewerState,
  }),
  object({
    state: literal("accepted"),
    organizationOwnerLogin: string(),
    targetLogin: string(),
    isViewerMember: boolean(),
  }),
  object({ state: literal("unavailable") }),
);
type GetInvitationResult = Infer<typeof vGetInvitationResult>;

const vAcceptInvitationResult = object({
  state: union(literal("joined"), literal("already_member"), literal("already_accepted")),
  organizationOwnerLogin: string(),
});
type AcceptInvitationResult = Infer<typeof vAcceptInvitationResult>;

const vChangeRoleResult = object({
  state: union(literal("changed"), literal("unchanged")),
  role: vOrganizationMembershipRole,
});

const vRemoveMemberResult = object({
  state: union(literal("removed"), literal("already_removed")),
});

const vLeaveOrganizationResult = object({
  state: union(literal("left"), literal("already_left")),
});

const vResolveInvitationTargetResult = object({
  expectedGithubAccountId: string(),
  githubLogin: string(),
  githubAvatarUrl: optional(string()),
  relationship: vGitHubRelationship,
});
type ResolveInvitationTargetResult = Infer<typeof vResolveInvitationTargetResult>;

const vCreateInvitationResult = object({
  invitationId: id("organizationInvitations"),
  code: string(),
  githubLogin: string(),
  githubAvatarUrl: optional(string()),
  expiresAt: number(),
  state: union(literal("created"), literal("existing")),
});
type CreateInvitationResult = Infer<typeof vCreateInvitationResult>;

const vCancelInvitationResult = object({
  state: union(literal("canceled"), literal("already_canceled")),
});

const vGitHubRelationshipResult = object({
  userId: id("users"),
  status: vGitHubRelationship,
});

const vOwnerGitHubContext = object({
  organizationId: id("organizations"),
  githubInstallationId: string(),
  githubOwnerId: string(),
  githubOwnerType: vGitHubOwnerType,
  githubOwnerLogin: string(),
});
type OwnerGitHubContext = Infer<typeof vOwnerGitHubContext>;

const vMemberGitHubContext = object({
  userId: id("users"),
  githubAccountId: optional(string()),
});

const vGitHubRelationshipsContext = object({
  organization: vOwnerGitHubContext,
  members: array(vMemberGitHubContext),
});
type GitHubRelationshipsContext = Infer<typeof vGitHubRelationshipsContext>;

function requireInvitationCode(code: string): string {
  if (!/^[0-9a-f]{64}$/.test(code)) {
    throw new Error("Invitation code is invalid.");
  }
  return code;
}

function requireRoundedFiniteNow(now: number): number {
  if (!Number.isFinite(now) || now < 0 || now % 60_000 !== 0) {
    throw new Error("Current time is invalid.");
  }
  return now;
}

function createInvitationCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readGitHubSignInAccount(
  db: DatabaseReader,
  userId: Id<"users">,
): Promise<Doc<"authAccounts"> | null> {
  const accounts = await db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (builder) =>
      builder.eq("userId", userId).eq("provider", "github"),
    )
    .take(2);
  if (accounts.length > 1) {
    throw new Error("This Samebase account has conflicting GitHub sign-in identities.");
  }
  return accounts.at(0) ?? null;
}

function readMemberLabel(args: {
  user: NonDeletedUserLifecycleDoc;
  githubLogin: string | undefined;
}): string {
  const displayName = args.user.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  if (args.githubLogin) {
    return args.githubLogin;
  }
  return "Samebase member";
}

function normalizeMemberLabelSortKey(label: string): string {
  return label.trim().normalize("NFKC").toLowerCase();
}

async function hasTargetOwnedActiveWork(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<boolean> {
  for (const state of ["queued", "running"] as const) {
    const deletion = await db
      .query("workflow_vaultDeletion_runs")
      .withIndex("by_organization_and_user_and_state_and_updated_at", (builder) =>
        builder
          .eq("organizationId", args.organizationId)
          .eq("userId", args.userId)
          .eq("state", state),
      )
      .first();
    if (deletion !== null) {
      return true;
    }

    const provisioning = await db
      .query("workflow_vaultProvisioning_runs")
      .withIndex("by_organization_and_user_and_state_and_updated_at", (builder) =>
        builder
          .eq("organizationId", args.organizationId)
          .eq("userId", args.userId)
          .eq("state", state),
      )
      .first();
    if (provisioning !== null) {
      return true;
    }
  }
  return false;
}

async function requireNoTargetOwnedActiveWork(
  db: DatabaseReader,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<void> {
  if (await hasTargetOwnedActiveWork(db, args)) {
    throw new ConvexError("Wait for this member's active vault work to finish.");
  }
}

async function deletePendingInvitationForUser(
  db: DatabaseWriter,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
): Promise<void> {
  const githubAccount = await readGitHubSignInAccount(db, args.userId);
  if (githubAccount === null) {
    return;
  }
  const invitation = await db
    .query("organizationInvitations")
    .withIndex("by_organization_and_state_and_github_account_id", (builder) =>
      builder
        .eq("organizationId", args.organizationId)
        .eq("state", "pending")
        .eq("githubAccountId", githubAccount.providerAccountId),
    )
    .unique();
  if (invitation !== null) {
    await db.delete(invitation._id);
  }
}

function readTargetRelationship(
  context: OwnerGitHubContext,
  target: GitHubInvitationTarget,
  octokit: ReturnType<typeof createGitHubInstallationOctokit> | null,
): Promise<GitHubRelationship> | GitHubRelationship {
  if (context.githubOwnerType === "user") {
    return target.expectedGithubAccountId === context.githubOwnerId
      ? "owner_account"
      : "different_account";
  }
  if (octokit === null) {
    return "unavailable";
  }
  return readGitHubOrganizationRelationship(octokit, {
    githubOrganizationId: context.githubOwnerId,
    githubOrganizationLogin: context.githubOwnerLogin,
    githubAccountId: target.expectedGithubAccountId,
    githubLogin: target.githubLogin,
  });
}

async function readPublicInvitationTarget(githubLogin: string): Promise<GitHubInvitationTarget> {
  try {
    return await readPublicGitHubUserByLogin(githubLogin);
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      throw new ConvexError("GitHub user not found.");
    }
    throw new ConvexError("GitHub user lookup is unavailable.");
  }
}

async function resolveInvitationTargetFromGitHub(
  context: OwnerGitHubContext,
  githubLogin: string,
): Promise<{
  target: GitHubInvitationTarget;
  installationOctokit: ReturnType<typeof createGitHubInstallationOctokit> | null;
}> {
  let installationOctokit: ReturnType<typeof createGitHubInstallationOctokit>;
  try {
    installationOctokit = createGitHubInstallationOctokit(context.githubInstallationId);
  } catch {
    return {
      target: await readPublicInvitationTarget(githubLogin),
      installationOctokit: null,
    };
  }

  try {
    const target = await readGitHubUserByLogin(installationOctokit, githubLogin);
    return { target, installationOctokit };
  } catch (error) {
    if (error instanceof RequestError && error.status === 404) {
      throw new ConvexError("GitHub user not found.");
    }
    if (
      error instanceof RequestError &&
      (error.status === 401 || error.status === 403 || error.status === 429 || error.status >= 500)
    ) {
      return {
        target: await readPublicInvitationTarget(githubLogin),
        installationOctokit,
      };
    }
    throw error;
  }
}

export const loadOwnerGitHubContext = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: vOwnerGitHubContext,
  handler: async (ctx, args): Promise<OwnerGitHubContext> => {
    await requireOrganizationOwnerAccessContext(ctx.db, args);
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    return {
      organizationId: organization._id,
      githubInstallationId: organization.githubInstallationId,
      githubOwnerId: organization.githubOwnerId,
      githubOwnerType: organization.githubOwnerType,
      githubOwnerLogin: organization.githubOwnerLogin,
    };
  },
});

export const loadGitHubRelationshipsContext = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: vGitHubRelationshipsContext,
  handler: async (ctx, args): Promise<GitHubRelationshipsContext> => {
    await requireOrganizationOwnerAccessContext(ctx.db, args);
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    const members = [];
    for await (const membership of ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (builder) =>
        builder.eq("organizationId", args.organizationId),
      )) {
      requireOrganizationMembershipUser(await ctx.db.get(membership.userId));
      const githubAccount = await readGitHubSignInAccount(ctx.db, membership.userId);
      members.push({
        userId: membership.userId,
        ...(githubAccount ? { githubAccountId: githubAccount.providerAccountId } : {}),
      });
    }
    return {
      organization: {
        organizationId: organization._id,
        githubInstallationId: organization.githubInstallationId,
        githubOwnerId: organization.githubOwnerId,
        githubOwnerType: organization.githubOwnerType,
        githubOwnerLogin: organization.githubOwnerLogin,
      },
      members,
    };
  },
});

export const requireCurrentOwner = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOrganizationOwnerAccessContext(ctx.db, args);
    return null;
  },
});

export const commitInvitation = internalMutation({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
    expectedGithubAccountId: string(),
    githubLogin: string(),
    githubAvatarUrl: optional(string()),
    proposedCode: string(),
  },
  returns: vCreateInvitationResult,
  handler: async (ctx, args): Promise<CreateInvitationResult> => {
    await requireOrganizationOwnerAccessContext(ctx.db, args);
    const proposedCode = requireInvitationCode(args.proposedCode);
    const now = Date.now();
    const accountOwners = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (builder) =>
        builder.eq("provider", "github").eq("providerAccountId", args.expectedGithubAccountId),
      )
      .take(2);
    if (accountOwners.length > 1) {
      throw new Error("This GitHub account belongs to conflicting Samebase accounts.");
    }

    const pendingCandidate = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_organization_and_state_and_github_account_id", (builder) =>
        builder
          .eq("organizationId", args.organizationId)
          .eq("state", "pending")
          .eq("githubAccountId", args.expectedGithubAccountId),
      )
      .unique();
    // @ts-expect-error The compound index fixes state to pending, but Convex does not narrow it.
    const pending: Extract<Doc<"organizationInvitations">, { state: "pending" }> | null =
      pendingCandidate;
    if (pending !== null && pending.expiresAt > now) {
      if (
        pending.githubLogin !== args.githubLogin ||
        pending.githubAvatarUrl !== args.githubAvatarUrl
      ) {
        await ctx.db.patch(pending._id, {
          githubLogin: args.githubLogin,
          githubAvatarUrl: args.githubAvatarUrl,
        });
      }
      return {
        invitationId: pending._id,
        code: pending.code,
        githubLogin: args.githubLogin,
        ...(args.githubAvatarUrl ? { githubAvatarUrl: args.githubAvatarUrl } : {}),
        expiresAt: pending.expiresAt,
        state: "existing",
      };
    }

    const codeOwner = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_code", (builder) => builder.eq("code", proposedCode))
      .unique();
    if (codeOwner !== null) {
      throw new Error("Invitation code collision.");
    }
    const code = proposedCode;
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    const pendingInvitation = {
      organizationId: args.organizationId,
      githubAccountId: args.expectedGithubAccountId,
      githubLogin: args.githubLogin,
      ...(args.githubAvatarUrl ? { githubAvatarUrl: args.githubAvatarUrl } : {}),
      code,
      createdByUserId: args.userId,
      createdAt: now,
      expiresAt,
      state: "pending" as const,
    };
    let invitationId: Id<"organizationInvitations">;
    if (pending === null) {
      invitationId = await ctx.db.insert("organizationInvitations", pendingInvitation);
    } else {
      await ctx.db.replace(pending._id, pendingInvitation);
      invitationId = pending._id;
    }
    return {
      invitationId,
      code,
      githubLogin: args.githubLogin,
      ...(args.githubAvatarUrl ? { githubAvatarUrl: args.githubAvatarUrl } : {}),
      expiresAt,
      state: "created",
    };
  },
});

export const getPage = query({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
    now: number(),
  },
  returns: vGetPageResult,
  handler: async (ctx, args): Promise<GetPageResult> => {
    const now = requireRoundedFiniteNow(args.now);
    const viewerMembership = await requireOrganizationMembership(ctx.db, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
    });
    const organization = await ctx.db.get(args.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }

    const memberships: Doc<"organizationMemberships">[] = [];
    for await (const membership of ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (builder) =>
        builder.eq("organizationId", args.organizationId),
      )) {
      memberships.push(membership);
    }

    const memberSources = await Promise.all(
      memberships.map(async (membership) => {
        const user = requireOrganizationMembershipUser(await ctx.db.get(membership.userId));
        const githubAccount = await readGitHubSignInAccount(ctx.db, membership.userId);
        return { membership, user, githubAccount };
      }),
    );
    const activeOwnerUserIds = new Set(
      memberSources
        .filter(
          ({ membership, user }) => membership.role === "owner" && readActiveUser(user) !== null,
        )
        .map(({ membership }) => membership.userId),
    );

    const members = memberSources
      .map(({ membership, user, githubAccount }) => {
        const githubLogin = githubAccount?.githubLogin?.trim() || undefined;
        const avatarUrl = githubAccount
          ? `https://avatars.githubusercontent.com/u/${githubAccount.providerAccountId}?v=4`
          : undefined;
        const isViewer = membership.userId === ctx.viewer.userId;
        return {
          membershipId: membership._id,
          userId: membership.userId,
          label: readMemberLabel({ user, githubLogin }),
          ...(avatarUrl ? { avatarUrl } : {}),
          ...(githubLogin ? { githubLogin } : {}),
          role: membership.role,
          isViewer,
          isDeleting: user.state === "deleting",
          isOnlyActiveOwner:
            viewerMembership.role === "owner" &&
            membership.role === "owner" &&
            activeOwnerUserIds.size === 1 &&
            activeOwnerUserIds.has(membership.userId),
          isPersonalGithubOwnerIdentity:
            (viewerMembership.role === "owner" || isViewer) &&
            organization.githubOwnerType === "user" &&
            githubAccount?.providerAccountId === organization.githubOwnerId,
        };
      })
      .sort((left, right) => {
        if (left.role !== right.role) {
          return left.role === "owner" ? -1 : 1;
        }
        const leftLabel = normalizeMemberLabelSortKey(left.label);
        const rightLabel = normalizeMemberLabelSortKey(right.label);
        if (leftLabel !== rightLabel) {
          return leftLabel < rightLabel ? -1 : 1;
        }
        if (left.membershipId === right.membershipId) {
          return 0;
        }
        return left.membershipId < right.membershipId ? -1 : 1;
      });

    if (viewerMembership.role !== "owner") {
      return {
        organization: {
          organizationId: organization._id,
          githubOwnerLogin: organization.githubOwnerLogin,
          githubOwnerType: organization.githubOwnerType,
        },
        viewerRole: viewerMembership.role,
        members,
      };
    }

    const pendingInvitations = [];
    for await (const invitation of ctx.db
      .query("organizationInvitations")
      .withIndex("by_organization_and_state_and_expires_at", (builder) =>
        builder.eq("organizationId", organization._id).eq("state", "pending").gt("expiresAt", now),
      )) {
      // @ts-expect-error The compound index fixes state to pending, but Convex does not narrow it.
      const pendingInvitation: Extract<
        Doc<"organizationInvitations">,
        { state: "pending" }
      > = invitation;
      const createdBy = resolveUserReferencePresentation(
        await ctx.db.get(pendingInvitation.createdByUserId),
      );
      pendingInvitations.push({
        invitationId: pendingInvitation._id,
        githubLogin: pendingInvitation.githubLogin,
        ...(pendingInvitation.githubAvatarUrl
          ? { githubAvatarUrl: pendingInvitation.githubAvatarUrl }
          : {}),
        createdAt: pendingInvitation.createdAt,
        expiresAt: pendingInvitation.expiresAt,
        code: pendingInvitation.code,
        createdBy,
      });
    }
    pendingInvitations.sort((left, right) => {
      const leftLogin = normalizeMemberLabelSortKey(left.githubLogin);
      const rightLogin = normalizeMemberLabelSortKey(right.githubLogin);
      if (leftLogin !== rightLogin) {
        return leftLogin < rightLogin ? -1 : 1;
      }
      if (left.invitationId === right.invitationId) {
        return 0;
      }
      return left.invitationId < right.invitationId ? -1 : 1;
    });

    return {
      organization: {
        organizationId: organization._id,
        githubOwnerLogin: organization.githubOwnerLogin,
        githubOwnerType: organization.githubOwnerType,
      },
      viewerRole: viewerMembership.role,
      members,
      pendingInvitations,
    };
  },
});

export const getInvitationAtTime = internalQuery({
  args: {
    code: string(),
    now: number(),
    viewerUserId: union(id("users"), v.null()),
  },
  returns: vGetInvitationResult,
  handler: async (ctx, args): Promise<GetInvitationResult> => {
    if (!Number.isFinite(args.now) || args.now < 0) {
      throw new Error("Current time is invalid.");
    }
    if (args.viewerUserId !== null) {
      const viewerUser = await ctx.db.get(args.viewerUserId);
      if (viewerUser === null || readActiveUser(viewerUser) === null) {
        return { state: "unavailable" };
      }
    }
    if (!/^[0-9a-f]{64}$/.test(args.code)) {
      return { state: "unavailable" };
    }
    const code = args.code;
    const invitation = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_code", (builder) => builder.eq("code", code))
      .unique();
    if (
      invitation === null ||
      invitation.state === "accepted_recipient_deleted" ||
      (invitation.state === "pending" && invitation.expiresAt <= args.now)
    ) {
      return { state: "unavailable" };
    }
    if (invitation.state === "accepted") {
      const viewerUserId = args.viewerUserId;
      if (viewerUserId === null || invitation.acceptedByUserId !== viewerUserId) {
        return { state: "unavailable" };
      }
      const organization = await ctx.db.get(invitation.organizationId);
      if (organization === null) {
        return { state: "unavailable" };
      }
      const viewerMembership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (builder) =>
          builder.eq("organizationId", invitation.organizationId).eq("userId", viewerUserId),
        )
        .unique();
      return {
        state: "accepted",
        organizationOwnerLogin: organization.githubOwnerLogin,
        targetLogin: invitation.githubLogin,
        isViewerMember: viewerMembership !== null,
      };
    }
    const organization = await ctx.db.get(invitation.organizationId);
    if (organization === null) {
      return { state: "unavailable" };
    }
    const viewerUserId = args.viewerUserId;
    if (viewerUserId === null) {
      return {
        state: "available",
        organizationOwnerLogin: organization.githubOwnerLogin,
        targetLogin: invitation.githubLogin,
        ...(invitation.githubAvatarUrl ? { targetAvatarUrl: invitation.githubAvatarUrl } : {}),
        viewerState: "signed_out",
      };
    }

    const githubAccountId = await readGitHubSignInProviderAccountId(ctx.db, viewerUserId);
    let viewerState: Infer<typeof vInvitationViewerState>;
    if (githubAccountId !== invitation.githubAccountId) {
      viewerState = "wrong_github_account";
    } else {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (builder) =>
          builder.eq("organizationId", invitation.organizationId).eq("userId", viewerUserId),
        )
        .unique();
      viewerState = membership === null ? "can_accept" : "already_member";
    }

    return {
      state: "available",
      organizationOwnerLogin: organization.githubOwnerLogin,
      targetLogin: invitation.githubLogin,
      ...(invitation.githubAvatarUrl ? { targetAvatarUrl: invitation.githubAvatarUrl } : {}),
      viewerState,
    };
  },
});

export const getInvitation = action({
  access: "access_public",
  args: { code: string() },
  returns: vGetInvitationResult,
  handler: async (ctx, args): Promise<GetInvitationResult> => {
    return await ctx.runQuery(internal.organizationMembers.getInvitationAtTime, {
      code: args.code,
      now: Date.now(),
      viewerUserId: ctx.viewer.userId,
    });
  },
});

export const acceptInvitation = mutation({
  access: "access_user_preferences",
  args: { code: string() },
  returns: vAcceptInvitationResult,
  handler: async (ctx, args): Promise<AcceptInvitationResult> => {
    const code = requireInvitationCode(args.code);
    const invitation = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_code", (builder) => builder.eq("code", code))
      .unique();
    if (invitation === null) {
      throw new ConvexError("Invitation is unavailable.");
    }
    if (invitation.state === "accepted_recipient_deleted") {
      throw new ConvexError("Invitation is unavailable.");
    }
    const organization = await ctx.db.get(invitation.organizationId);
    if (organization === null) {
      throw new ConvexError("Invitation is unavailable.");
    }
    if (invitation.state === "accepted" && invitation.acceptedByUserId !== ctx.viewer.userId) {
      throw new ConvexError("Invitation is unavailable.");
    }
    const githubAccountId = await readGitHubSignInProviderAccountId(ctx.db, ctx.viewer.userId);
    if (githubAccountId !== invitation.githubAccountId) {
      throw new ConvexError("This invitation is for a different GitHub account.");
    }
    if (invitation.state === "accepted") {
      return {
        state: "already_accepted",
        organizationOwnerLogin: organization.githubOwnerLogin,
      };
    }
    if (invitation.expiresAt <= Date.now()) {
      throw new ConvexError("Invitation has expired.");
    }

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (builder) =>
        builder.eq("organizationId", invitation.organizationId).eq("userId", ctx.viewer.userId),
      )
      .unique();
    if (ctx.viewer.user.isApproved !== true) {
      await ctx.db.patch(ctx.viewer.userId, { isApproved: true });
    }
    await ctx.db.patch(invitation._id, {
      state: "accepted",
      acceptedByUserId: ctx.viewer.userId,
      acceptedAt: Date.now(),
    });
    if (membership !== null) {
      return {
        state: "already_member",
        organizationOwnerLogin: organization.githubOwnerLogin,
      };
    }

    await ctx.db.insert("organizationMemberships", {
      organizationId: invitation.organizationId,
      userId: ctx.viewer.userId,
      role: "member",
    });
    return {
      state: "joined",
      organizationOwnerLogin: organization.githubOwnerLogin,
    };
  },
});

export const changeRole = mutation({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
    membershipId: id("organizationMemberships"),
    role: vOrganizationMembershipRole,
  },
  returns: vChangeRoleResult,
  handler: async (ctx, args) => {
    await requireOrganizationOwnerAccessContext(ctx.db, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
    });
    const membership = await ctx.db.get(args.membershipId);
    if (membership === null || membership.organizationId !== args.organizationId) {
      throw new ConvexError("Organization member not found.");
    }
    const user = requireOrganizationMembershipUser(await ctx.db.get(membership.userId));
    if (membership.role === args.role) {
      return { state: "unchanged" as const, role: membership.role };
    }
    if (membership.role === "owner") {
      await requireAnotherActiveOrganizationOwner(ctx.db, {
        organizationId: args.organizationId,
        excludedUserId: membership.userId,
      });
    } else {
      if (readActiveUser(user) === null) {
        throw new ConvexError("Only an active Samebase user can become an Owner.");
      }
    }
    await ctx.db.patch(membership._id, { role: args.role });
    return { state: "changed" as const, role: args.role };
  },
});

export const removeMember = mutation({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
    membershipId: id("organizationMemberships"),
  },
  returns: vRemoveMemberResult,
  handler: async (ctx, args) => {
    await requireOrganizationOwnerAccessContext(ctx.db, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
    });
    const membership = await ctx.db.get(args.membershipId);
    if (membership === null || membership.organizationId !== args.organizationId) {
      return { state: "already_removed" as const };
    }
    if (membership.userId === ctx.viewer.userId) {
      throw new ConvexError("Use Leave organization to remove your own membership.");
    }
    requireOrganizationMembershipUser(await ctx.db.get(membership.userId));
    if (membership.role === "owner") {
      await requireAnotherActiveOrganizationOwner(ctx.db, {
        organizationId: args.organizationId,
        excludedUserId: membership.userId,
      });
    }
    await requireNoTargetOwnedActiveWork(ctx.db, {
      organizationId: args.organizationId,
      userId: membership.userId,
    });
    await deletePendingInvitationForUser(ctx.db, {
      organizationId: args.organizationId,
      userId: membership.userId,
    });
    await ctx.db.delete(membership._id);
    return { state: "removed" as const };
  },
});

export const leaveOrganization = mutation({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: vLeaveOrganizationResult,
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (builder) =>
        builder.eq("organizationId", args.organizationId).eq("userId", ctx.viewer.userId),
      )
      .unique();
    if (membership === null) {
      return { state: "already_left" as const };
    }
    if (membership.role === "owner") {
      await requireAnotherActiveOrganizationOwner(ctx.db, {
        organizationId: args.organizationId,
        excludedUserId: ctx.viewer.userId,
      });
    }
    await requireNoTargetOwnedActiveWork(ctx.db, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
    });
    await deletePendingInvitationForUser(ctx.db, {
      organizationId: args.organizationId,
      userId: ctx.viewer.userId,
    });
    await ctx.db.delete(membership._id);
    return { state: "left" as const };
  },
});

export const resolveInvitationTarget = action({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
    githubLogin: string(),
  },
  returns: vResolveInvitationTargetResult,
  handler: async (ctx, args): Promise<ResolveInvitationTargetResult> => {
    const context: OwnerGitHubContext = await ctx.runQuery(
      internal.organizationMembers.loadOwnerGitHubContext,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    const { target, installationOctokit } = await resolveInvitationTargetFromGitHub(
      context,
      args.githubLogin,
    );
    let relationship: GitHubRelationship;
    try {
      relationship = await readTargetRelationship(context, target, installationOctokit);
    } catch {
      relationship = "unavailable";
    }
    await ctx.runQuery(internal.organizationMembers.requireCurrentOwner, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    return {
      ...target,
      relationship,
    };
  },
});

export const createInvitation = action({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
    githubLogin: string(),
    expectedGithubAccountId: string(),
  },
  returns: vCreateInvitationResult,
  handler: async (ctx, args): Promise<CreateInvitationResult> => {
    const context: OwnerGitHubContext = await ctx.runQuery(
      internal.organizationMembers.loadOwnerGitHubContext,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    const { target } = await resolveInvitationTargetFromGitHub(context, args.githubLogin);
    if (target.expectedGithubAccountId !== args.expectedGithubAccountId) {
      throw new ConvexError("The GitHub account changed. Resolve the invitation target again.");
    }
    return await ctx.runMutation(internal.organizationMembers.commitInvitation, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
      expectedGithubAccountId: target.expectedGithubAccountId,
      githubLogin: target.githubLogin,
      githubAvatarUrl: target.githubAvatarUrl ? target.githubAvatarUrl : undefined,
      proposedCode: createInvitationCode(),
    });
  },
});

export const cancelInvitation = mutation({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
    invitationId: id("organizationInvitations"),
  },
  returns: vCancelInvitationResult,
  handler: async (ctx, args) => {
    await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const invitation = await ctx.db.get(args.invitationId);
    if (invitation === null || invitation.organizationId !== args.organizationId) {
      return { state: "already_canceled" as const };
    }
    if (invitation.state === "accepted" || invitation.state === "accepted_recipient_deleted") {
      throw new ConvexError("An accepted invitation cannot be canceled.");
    }
    await ctx.db.delete(invitation._id);
    return { state: "canceled" as const };
  },
});

export const getGitHubRelationships = action({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: array(vGitHubRelationshipResult),
  handler: async (ctx, args) => {
    const context: GitHubRelationshipsContext = await ctx.runQuery(
      internal.organizationMembers.loadGitHubRelationshipsContext,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    let octokit: ReturnType<typeof createGitHubInstallationOctokit> | null = null;
    if (context.organization.githubOwnerType === "organization") {
      try {
        octokit = createGitHubInstallationOctokit(context.organization.githubInstallationId);
      } catch {
        octokit = null;
      }
    }

    const relationships: Array<{ userId: Id<"users">; status: GitHubRelationship }> = [];
    for (const member of context.members) {
      if (member.githubAccountId === undefined) {
        relationships.push({
          userId: member.userId,
          status: "github_account_not_connected",
        });
        continue;
      }
      if (context.organization.githubOwnerType === "user") {
        relationships.push({
          userId: member.userId,
          status:
            member.githubAccountId === context.organization.githubOwnerId
              ? "owner_account"
              : "different_account",
        });
        continue;
      }
      if (octokit === null) {
        relationships.push({ userId: member.userId, status: "unavailable" });
        continue;
      }
      try {
        const currentUser = await readGitHubUserByAccountId(octokit, member.githubAccountId);
        const status = await readGitHubOrganizationRelationship(octokit, {
          githubOrganizationId: context.organization.githubOwnerId,
          githubOrganizationLogin: context.organization.githubOwnerLogin,
          githubAccountId: member.githubAccountId,
          githubLogin: currentUser.githubLogin,
        });
        relationships.push({ userId: member.userId, status });
      } catch {
        relationships.push({ userId: member.userId, status: "unavailable" });
      }
    }
    await ctx.runQuery(internal.organizationMembers.requireCurrentOwner, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    return relationships;
  },
});
