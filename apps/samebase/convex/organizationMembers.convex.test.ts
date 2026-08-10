import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly request = githubMocks.request;
  },
}));

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

const roundedNow = Math.floor(Date.now() / 60_000) * 60_000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_APP_ID", "42");
  vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
  vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/oauth/github/callback");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedMembers() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", {
      email: "owner@example.invalid",
      displayName: "Owner",
      isApproved: true,
    });
    const inviteeUserId = await ctx.db.insert("users", {
      email: "invitee@example.invalid",
      isApproved: false,
    });
    const memberUserId = await ctx.db.insert("users", {
      email: "member@example.invalid",
      displayName: "Member",
      isApproved: true,
    });
    await ctx.db.insert("authAccounts", {
      userId: ownerUserId,
      provider: "github",
      providerAccountId: "100",
      githubLogin: "owner-login",
    });
    await ctx.db.insert("authAccounts", {
      userId: inviteeUserId,
      provider: "github",
      providerAccountId: "200",
      githubLogin: "invitee-login",
    });
    await ctx.db.insert("authAccounts", {
      userId: memberUserId,
      provider: "github",
      providerAccountId: "300",
      githubLogin: "member-login",
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "900",
      githubOwnerType: "organization",
      githubOwnerLogin: "samebase-test-org",
      githubOwnerLoginNormalized: "samebase-test-org",
      githubInstallationId: "901",
    });
    const ownerMembershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerUserId,
      role: "owner",
    });
    const memberMembershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberUserId,
      role: "member",
    });
    return {
      ownerUserId,
      inviteeUserId,
      memberUserId,
      organizationId,
      ownerMembershipId,
      memberMembershipId,
    };
  });
  return {
    t,
    ids,
    asOwner: t.withIdentity({
      subject: `${ids.ownerUserId}|owner-session`,
      tokenIdentifier: `test:${ids.ownerUserId}`,
    }),
    asInvitee: t.withIdentity({
      subject: `${ids.inviteeUserId}|invitee-session`,
      tokenIdentifier: `test:${ids.inviteeUserId}`,
    }),
    asMember: t.withIdentity({
      subject: `${ids.memberUserId}|member-session`,
      tokenIdentifier: `test:${ids.memberUserId}`,
    }),
  };
}

// Source: https://api.github.com/users/octocat
// Captured 2026-08-08. Cases override only the stable identity observations.
function githubUser(id: number, login: string) {
  return {
    login,
    id,
    node_id: "MDQ6VXNlcjU4MzIzMQ==",
    avatar_url: `https://avatars.githubusercontent.com/u/${id}`,
    gravatar_id: "",
    url: `https://api.github.com/users/${login}`,
    html_url: `https://github.com/${login}`,
    followers_url: `https://api.github.com/users/${login}/followers`,
    following_url: `https://api.github.com/users/${login}/following{/other_user}`,
    gists_url: `https://api.github.com/users/${login}/gists{/gist_id}`,
    starred_url: `https://api.github.com/users/${login}/starred{/owner}{/repo}`,
    subscriptions_url: `https://api.github.com/users/${login}/subscriptions`,
    organizations_url: `https://api.github.com/users/${login}/orgs`,
    repos_url: `https://api.github.com/users/${login}/repos`,
    events_url: `https://api.github.com/users/${login}/events{/privacy}`,
    received_events_url: `https://api.github.com/users/${login}/received_events`,
    type: "User",
    user_view_type: "public",
    site_admin: false,
    name: "The Octocat",
    company: "@github",
    blog: "https://github.blog",
    location: "San Francisco",
    email: null,
    hireable: null,
    bio: null,
    twitter_username: null,
    public_repos: 8,
    public_gists: 8,
    followers: 23577,
    following: 9,
    created_at: "2011-01-25T18:44:36Z",
    updated_at: "2026-07-22T11:29:09Z",
  };
}

// Source: https://docs.github.com/en/rest/orgs/members#list-organization-memberships-for-the-authenticated-user
// Captured 2026-08-07. Cases override only user identity and role.
function githubMembership(userId: number, role: "admin" | "member" = "member") {
  return {
    url: "https://api.github.com/orgs/octocat/memberships/defunkt",
    state: "active",
    role,
    organization_url: "https://api.github.com/orgs/octocat",
    direct_membership: true,
    enterprise_teams_providing_indirect_membership: [],
    organization: {
      login: "samebase-test-org",
      id: 900,
      node_id: "MDEyOk9yZ2FuaXphdGlvbjE=",
      url: "https://api.github.com/orgs/samebase-test-org",
    },
    user: {
      login: "octocat",
      id: userId,
      node_id: "MDQ6VXNlcjE=",
      avatar_url: "https://github.com/images/error/octocat_happy.gif",
      url: "https://api.github.com/users/octocat",
      html_url: "https://github.com/octocat",
      type: "User",
      site_admin: false,
    },
  };
}

describe("organization member lifecycle", () => {
  it("projects owner-only personal recovery and invitation state", async () => {
    const { asMember, asOwner, ids, t } = await seedMembers();
    const code = "9".repeat(64);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.organizationId, {
        githubOwnerId: "100",
        githubOwnerType: "user",
      });
      await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "400",
        githubLogin: "pending-target",
        code,
        createdByUserId: ids.ownerUserId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        state: "pending",
      });
    });

    const ownerPage = await asOwner.query(api.organizationMembers.getPage, {
      organizationId: ids.organizationId,
      now: roundedNow,
    });
    expect(ownerPage.pendingInvitations).toEqual([
      expect.objectContaining({ githubLogin: "pending-target", code }),
    ]);
    expect(ownerPage.members.find((member) => member.userId === ids.ownerUserId)).toMatchObject({
      isOnlyActiveOwner: true,
      isPersonalGithubOwnerIdentity: true,
    });

    const memberPage = await asMember.query(api.organizationMembers.getPage, {
      organizationId: ids.organizationId,
      now: roundedNow,
    });
    expect(memberPage.pendingInvitations).toBeUndefined();
    expect(
      memberPage.members.every(
        (member) =>
          !member.isDeleting && !member.isOnlyActiveOwner && !member.isPersonalGithubOwnerIdentity,
      ),
    ).toBe(true);
  });

  it("creates one stable-identity invitation and requires explicit matching acceptance", async () => {
    const { asInvitee, asOwner, ids, t } = await seedMembers();
    githubMocks.request.mockImplementation(async (route: string) => {
      if (route === "GET /users/{username}") {
        return { data: githubUser(200, "invitee-login") };
      }
      if (route === "GET /orgs/{org}/memberships/{username}") {
        return { data: githubMembership(200) };
      }
      throw new Error(`Unexpected GitHub route: ${route}`);
    });

    const target = await asOwner.action(api.organizationMembers.resolveInvitationTarget, {
      organizationId: ids.organizationId,
      githubLogin: "invitee-login",
    });
    expect(target).toMatchObject({
      expectedGithubAccountId: "200",
      githubLogin: "invitee-login",
      relationship: "organization_member",
    });
    const created = await asOwner.action(api.organizationMembers.createInvitation, {
      organizationId: ids.organizationId,
      githubLogin: target.githubLogin,
      expectedGithubAccountId: target.expectedGithubAccountId,
    });
    expect(created.state).toBe("created");
    expect(created.code).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      asOwner.action(api.organizationMembers.createInvitation, {
        organizationId: ids.organizationId,
        githubLogin: target.githubLogin,
        expectedGithubAccountId: target.expectedGithubAccountId,
      }),
    ).resolves.toMatchObject({
      state: "existing",
      invitationId: created.invitationId,
      code: created.code,
    });
    await expect(
      asOwner.query(api.organizationMembers.getInvitation, {
        code: created.code,
        now: roundedNow,
      }),
    ).resolves.toMatchObject({ state: "available", viewerState: "wrong_github_account" });
    await expect(
      asInvitee.query(api.organizationMembers.getInvitation, {
        code: created.code,
        now: roundedNow,
      }),
    ).resolves.toMatchObject({ state: "available", viewerState: "can_accept" });

    await expect(
      asOwner.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).rejects.toThrow("This invitation is for a different GitHub account.");
    await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("authSessions", {
        userId: ids.inviteeUserId,
        expirationTime: roundedNow + 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: {
          state: "active",
          userId: ids.inviteeUserId,
          email: "invitee@example.invalid",
        },
        completionCapability: "a".repeat(64),
        currentStep: "request_accepted",
        requestedAt: roundedNow,
        updatedAt: roundedNow,
        initiatingSessionId: sessionId,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: "invitee-deletion", attempt: 1 },
      });
      await ctx.db.patch(ids.inviteeUserId, {
        accountDeletion: { state: "deleting", runId, requestedAt: roundedNow },
      });
    });
    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).rejects.toThrow("Access denied");
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.inviteeUserId, { accountDeletion: undefined });
    });

    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).resolves.toEqual({ state: "joined", organizationOwnerLogin: "samebase-test-org" });
    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).resolves.toEqual({
      state: "already_accepted",
      organizationOwnerLogin: "samebase-test-org",
    });
    const snapshot = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.inviteeUserId),
      membership: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (builder) =>
          builder.eq("organizationId", ids.organizationId).eq("userId", ids.inviteeUserId),
        )
        .unique(),
      invitation: await ctx.db.get(created.invitationId),
    }));
    expect(snapshot.user?.isApproved).toBe(true);
    expect(snapshot.membership?.role).toBe("member");
    expect(snapshot.invitation).toMatchObject({
      state: "accepted",
      acceptedByUserId: ids.inviteeUserId,
    });

    await asOwner.mutation(api.organizationMembers.removeMember, {
      organizationId: ids.organizationId,
      membershipId: snapshot.membership?._id ?? ids.memberMembershipId,
    });
    const reissued = await asOwner.action(api.organizationMembers.createInvitation, {
      organizationId: ids.organizationId,
      githubLogin: "invitee-login",
      expectedGithubAccountId: "200",
    });
    expect(reissued).toMatchObject({
      state: "created",
      invitationId: created.invitationId,
    });
    expect(reissued.code).not.toBe(created.code);
  });

  it("keeps an existing role and checks GitHub identity before existing membership", async () => {
    const { asOwner, ids, t } = await seedMembers();
    const code = "b".repeat(64);
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "100",
        githubLogin: "owner-login",
        code,
        createdByUserId: ids.ownerUserId,
        createdAt: roundedNow,
        expiresAt: roundedNow + 60_000,
        state: "pending",
      });
    });
    await expect(
      asOwner.query(api.organizationMembers.getInvitation, { code, now: roundedNow }),
    ).resolves.toMatchObject({ state: "available", viewerState: "already_member" });
    await expect(
      asOwner.mutation(api.organizationMembers.acceptInvitation, { code }),
    ).resolves.toEqual({
      state: "already_member",
      organizationOwnerLogin: "samebase-test-org",
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.ownerMembershipId))?.role),
    ).resolves.toBe("owner");
  });

  it("derives expiry, deletes canceled invitations, and denies member administration", async () => {
    const { asInvitee, asMember, asOwner, ids, t } = await seedMembers();
    const expiredCode = "1".repeat(64);
    const cancelCode = "2".repeat(64);
    const invitationIds = await t.run(async (ctx) => {
      const expiredInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "200",
        githubLogin: "invitee-login",
        code: expiredCode,
        createdByUserId: ids.ownerUserId,
        createdAt: 1,
        expiresAt: Date.now() - 1,
        state: "pending",
      });
      const cancelInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "400",
        githubLogin: "cancel-target",
        code: cancelCode,
        createdByUserId: ids.ownerUserId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        state: "pending",
      });
      return { expiredInvitationId, cancelInvitationId };
    });

    await expect(
      asInvitee.query(api.organizationMembers.getInvitation, { code: expiredCode, now: 0 }),
    ).resolves.toEqual({ state: "unavailable" });
    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code: expiredCode }),
    ).rejects.toThrow("Invitation has expired.");
    await expect(
      asMember.mutation(api.organizationMembers.cancelInvitation, {
        organizationId: ids.organizationId,
        invitationId: invitationIds.cancelInvitationId,
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      asOwner.mutation(api.organizationMembers.cancelInvitation, {
        organizationId: ids.organizationId,
        invitationId: invitationIds.cancelInvitationId,
      }),
    ).resolves.toEqual({ state: "canceled" });
    await expect(
      asOwner.mutation(api.organizationMembers.cancelInvitation, {
        organizationId: ids.organizationId,
        invitationId: invitationIds.cancelInvitationId,
      }),
    ).resolves.toEqual({ state: "already_canceled" });

    await expect(
      asMember.action(api.organizationMembers.createInvitation, {
        organizationId: ids.organizationId,
        githubLogin: "new-target",
        expectedGithubAccountId: "401",
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      asMember.mutation(api.organizationMembers.changeRole, {
        organizationId: ids.organizationId,
        membershipId: ids.memberMembershipId,
        role: "owner",
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      asMember.mutation(api.organizationMembers.removeMember, {
        organizationId: ids.organizationId,
        membershipId: ids.ownerMembershipId,
      }),
    ).rejects.toThrow("Organization owner access is required.");
  });

  it("rejects a username that resolves to a different stable ID during create", async () => {
    const { asOwner, ids } = await seedMembers();
    githubMocks.request.mockResolvedValue({ data: githubUser(200, "race-target") });
    const target = await asOwner.action(api.organizationMembers.resolveInvitationTarget, {
      organizationId: ids.organizationId,
      githubLogin: "race-target",
    });
    githubMocks.request.mockResolvedValue({ data: githubUser(201, "race-target") });
    await expect(
      asOwner.action(api.organizationMembers.createInvitation, {
        organizationId: ids.organizationId,
        githubLogin: "race-target",
        expectedGithubAccountId: target.expectedGithubAccountId,
      }),
    ).rejects.toThrow("The GitHub account changed. Resolve the invitation target again.");
  });

  it("enforces active owners and blocks only target-owned active vault work", async () => {
    const { asMember, asOwner, ids, t } = await seedMembers();
    const vaultId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId: ids.organizationId,
        convexTeamId: "team",
        cloudflareAccountId: "account",
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.memberUserId,
        vaultId,
        repositoryFullName: "samebase-test-org/app",
        trigger: "create",
        state: "queued",
        currentStep: "run_created",
        createdAt: roundedNow,
        updatedAt: roundedNow,
      });
      return vaultId;
    });

    await expect(
      asOwner.mutation(api.organizationMembers.changeRole, {
        organizationId: ids.organizationId,
        membershipId: ids.memberMembershipId,
        role: "owner",
      }),
    ).resolves.toEqual({ state: "changed", role: "owner" });
    await expect(
      asOwner.mutation(api.organizationMembers.removeMember, {
        organizationId: ids.organizationId,
        membershipId: ids.memberMembershipId,
      }),
    ).rejects.toThrow("Wait for this member's active vault work to finish.");
    await expect(
      asMember.mutation(api.organizationMembers.leaveOrganization, {
        organizationId: ids.organizationId,
      }),
    ).rejects.toThrow("Wait for this member's active vault work to finish.");

    await t.run(async (ctx) => {
      const run = await ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_vault_and_state", (builder) =>
          builder.eq("vaultId", vaultId).eq("state", "queued"),
        )
        .unique();
      if (run !== null) {
        await ctx.db.patch(run._id, { state: "failed", completedAt: roundedNow + 1 });
      }
    });
    const deletionRunId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        organizationId: ids.organizationId,
        userId: ids.memberUserId,
        vaultId,
        repositoryFullName: "samebase-test-org/app",
        createdAt: roundedNow,
        updatedAt: roundedNow,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "samebase_managed_repository",
              ghRepoId: "github-repository",
              owner: "samebase-test-org",
              name: "app",
              repositoryFullName: "samebase-test-org/app",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
    });
    await expect(
      asOwner.mutation(api.organizationMembers.removeMember, {
        organizationId: ids.organizationId,
        membershipId: ids.memberMembershipId,
      }),
    ).rejects.toThrow("Wait for this member's active vault work to finish.");
    await t.run(async (ctx) => {
      await ctx.db.delete(deletionRunId);
    });
    await expect(
      asOwner.mutation(api.organizationMembers.removeMember, {
        organizationId: ids.organizationId,
        membershipId: ids.memberMembershipId,
      }),
    ).resolves.toEqual({ state: "removed" });
    await t.run(async (ctx) => {
      const unapprovedOwnerId = await ctx.db.insert("users", {
        email: "unapproved-owner@example.invalid",
        isApproved: false,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: unapprovedOwnerId,
        role: "owner",
      });
      const deletingOwnerId = await ctx.db.insert("users", {
        email: "deleting-owner@example.invalid",
        isApproved: true,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: deletingOwnerId,
        expirationTime: roundedNow + 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: {
          state: "active",
          userId: deletingOwnerId,
          email: "deleting-owner@example.invalid",
        },
        completionCapability: "d".repeat(64),
        currentStep: "request_accepted",
        requestedAt: roundedNow,
        updatedAt: roundedNow,
        initiatingSessionId: sessionId,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: "owner-deletion", attempt: 1 },
      });
      await ctx.db.patch(deletingOwnerId, {
        accountDeletion: { state: "deleting", runId, requestedAt: roundedNow },
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: deletingOwnerId,
        role: "owner",
      });
    });
    await expect(
      asOwner.mutation(api.organizationMembers.leaveOrganization, {
        organizationId: ids.organizationId,
      }),
    ).rejects.toThrow("An organization must have at least one active owner.");
  });

  it("rejects an internal invitation-code collision", async () => {
    const { ids, t } = await seedMembers();
    const code = "c".repeat(64);
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "777",
        githubLogin: "collision-owner",
        code,
        createdByUserId: ids.ownerUserId,
        createdAt: roundedNow,
        expiresAt: roundedNow + 60_000,
        state: "pending",
      });
    });
    await expect(
      t.mutation(internal.organizationMembers.commitInvitation, {
        userId: ids.ownerUserId,
        organizationId: ids.organizationId,
        expectedGithubAccountId: "778",
        githubLogin: "collision-target",
        proposedCode: code,
      }),
    ).rejects.toThrow("Invitation code collision.");
  });

  it("resolves current GitHub logins by stable account ID before membership", async () => {
    const { asOwner, ids } = await seedMembers();
    githubMocks.request.mockImplementation(
      async (route: string, options: { account_id?: number; username?: string }) => {
        if (route === "GET /user/{account_id}") {
          if (options.account_id === 100) {
            return { data: githubUser(100, "renamed-owner") };
          }
          if (options.account_id === 300) {
            return { data: githubUser(300, "renamed-member") };
          }
        }
        if (route === "GET /orgs/{org}/memberships/{username}") {
          if (options.username === "renamed-owner") {
            return { data: githubMembership(100, "admin") };
          }
          if (options.username === "renamed-member") {
            return { data: githubMembership(300) };
          }
        }
        throw new Error(`Unexpected GitHub route: ${route}`);
      },
    );

    await expect(
      asOwner.action(api.organizationMembers.getGitHubRelationships, {
        organizationId: ids.organizationId,
      }),
    ).resolves.toEqual([
      { userId: ids.ownerUserId, status: "organization_owner" },
      { userId: ids.memberUserId, status: "organization_member" },
    ]);
  });
});
