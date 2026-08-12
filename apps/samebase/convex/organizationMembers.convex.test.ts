import { RequestError } from "@octokit/request-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  getInstallationUserByAccountId: vi.fn(),
  getInstallationUserByLogin: vi.fn(),
  getOrganizationMembershipForUser: vi.fn(),
  getPublicUserByLogin: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly rest;

    constructor(options?: { auth?: unknown; authStrategy?: unknown }) {
      const getByUsername =
        options?.auth === undefined && options?.authStrategy === undefined
          ? githubMocks.getPublicUserByLogin
          : githubMocks.getInstallationUserByLogin;
      this.rest = {
        orgs: {
          getMembershipForUser: githubMocks.getOrganizationMembershipForUser,
        },
        users: {
          getById: githubMocks.getInstallationUserByAccountId,
          getByUsername,
        },
      };
    }
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
  vi.unstubAllGlobals();
});

async function seedMembers() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerUserId = await ctx.db.insert("users", {
      state: "active",
      email: "owner@example.invalid",
      displayName: "Owner",
      isApproved: true,
    });
    const inviteeUserId = await ctx.db.insert("users", {
      state: "active",
      email: "invitee@example.invalid",
      isApproved: false,
    });
    const memberUserId = await ctx.db.insert("users", {
      state: "active",
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
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
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
function githubUser(id: number, login: string, overrides?: Record<string, unknown>) {
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
    ...overrides,
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

function githubRequestError(status: number): RequestError {
  return new RequestError(`GitHub request failed with status ${status}.`, status, {
    request: {
      method: "GET",
      url: "https://api.github.com/users/invitation-target",
      headers: {},
    },
  });
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
      expect.objectContaining({
        githubLogin: "pending-target",
        code,
        createdBy: { kind: "displayName", label: "Owner" },
      }),
    ]);
    expect(ownerPage.members.find((member) => member.userId === ids.ownerUserId)).toMatchObject({
      avatarUrl: "https://avatars.githubusercontent.com/u/100?v=4",
      isOnlyActiveOwner: true,
      isPersonalGithubOwnerIdentity: true,
    });
    expect(ownerPage.members.find((member) => member.userId === ids.memberUserId)).toMatchObject({
      avatarUrl: "https://avatars.githubusercontent.com/u/300?v=4",
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

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.ownerMembershipId, { role: "member" });
      await ctx.db.patch(ids.memberMembershipId, { role: "owner" });
    });
    const personalOwnerMemberPage = await asOwner.query(api.organizationMembers.getPage, {
      organizationId: ids.organizationId,
      now: roundedNow,
    });
    expect(
      personalOwnerMemberPage.members.find((member) => member.userId === ids.ownerUserId),
    ).toMatchObject({
      isPersonalGithubOwnerIdentity: true,
      isViewer: true,
      role: "member",
    });
    expect(
      personalOwnerMemberPage.members.find((member) => member.userId === ids.memberUserId),
    ).toMatchObject({ isPersonalGithubOwnerIdentity: false });
  });

  it("orders members and pending invitations with stable ties", async () => {
    const { asOwner, ids, t } = await seedMembers();
    const orderIds = await t.run(async (ctx) => {
      const tiedMembershipIds = [];
      for (const [email, displayName] of [
        ["first-tied-member@example.invalid", "alpha"],
        ["second-tied-member@example.invalid", "Alpha"],
      ] as const) {
        const userId = await ctx.db.insert("users", {
          state: "active",
          email,
          displayName,
          isApproved: true,
        });
        tiedMembershipIds.push(
          await ctx.db.insert("organizationMemberships", {
            organizationId: ids.organizationId,
            userId,
            role: "member",
          }),
        );
      }
      const invitationIds = [];
      for (const [githubAccountId, githubLogin, codeDigit] of [
        ["410", "alpha", "4"],
        ["411", "Alpha", "5"],
        ["412", "zulu", "6"],
      ] as const) {
        invitationIds.push(
          await ctx.db.insert("organizationInvitations", {
            organizationId: ids.organizationId,
            githubAccountId,
            githubLogin,
            code: codeDigit.repeat(64),
            createdByUserId: ids.ownerUserId,
            createdAt: roundedNow,
            expiresAt: roundedNow + 60_000,
            state: "pending",
          }),
        );
      }
      return { tiedMembershipIds, invitationIds };
    });

    const page = await asOwner.query(api.organizationMembers.getPage, {
      organizationId: ids.organizationId,
      now: roundedNow,
    });
    expect(page.members.map((member) => member.membershipId)).toEqual([
      ids.ownerMembershipId,
      ...orderIds.tiedMembershipIds.sort(),
      ids.memberMembershipId,
    ]);
    expect(page.pendingInvitations?.map((invitation) => invitation.invitationId)).toEqual([
      ...orderIds.invitationIds.slice(0, 2).sort(),
      orderIds.invitationIds.at(2),
    ]);
  });

  it("creates one stable-identity invitation and requires explicit matching acceptance", async () => {
    const { asInvitee, asMember, asOwner, ids, t } = await seedMembers();
    githubMocks.getInstallationUserByLogin.mockResolvedValue({
      data: githubUser(200, "invitee-login"),
    });
    githubMocks.getOrganizationMembershipForUser.mockResolvedValue({
      data: githubMembership(200),
    });
    await t.run(async (ctx) => {
      const billingAccount = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", ids.organizationId))
        .unique();
      if (billingAccount === null) {
        throw new Error("Billing account is required.");
      }
      await ctx.db.patch(billingAccount._id, {
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: `members-customer-${ids.organizationId}`,
        polarBillingUserId: ids.ownerUserId,
        polarSeatQuantity: 3,
      });
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
      asOwner.action(api.organizationMembers.getInvitation, { code: created.code }),
    ).resolves.toMatchObject({ state: "available", viewerState: "wrong_github_account" });
    await expect(
      asInvitee.action(api.organizationMembers.getInvitation, { code: created.code }),
    ).resolves.toMatchObject({ state: "available", viewerState: "can_accept" });

    await expect(
      asOwner.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).rejects.toThrow("This invitation is for a different GitHub account.");
    const deletingInviteeMembershipId = await t.run(async (ctx) => {
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
      await ctx.db.replace(ids.inviteeUserId, {
        state: "deleting",
        email: "invitee@example.invalid",
        isApproved: false,
        runId,
        requestedAt: roundedNow,
      });
      return await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: ids.inviteeUserId,
        role: "member",
      });
    });
    await expect(
      asInvitee.action(api.organizationMembers.getInvitation, { code: created.code }),
    ).resolves.toEqual({ state: "unavailable" });
    await expect(
      asMember.query(api.organizationMembers.getPage, {
        organizationId: ids.organizationId,
        now: roundedNow,
      }),
    ).resolves.toMatchObject({
      members: expect.arrayContaining([
        expect.objectContaining({ userId: ids.inviteeUserId, isDeleting: true }),
      ]),
    });
    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).rejects.toThrow("Access denied");
    await t.run(async (ctx) => {
      await ctx.db.delete(deletingInviteeMembershipId);
      await ctx.db.replace(ids.inviteeUserId, {
        state: "active",
        email: "invitee@example.invalid",
        isApproved: false,
      });
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
    if (snapshot.user?.state !== "active") {
      throw new Error("Invitation acceptance did not keep an active user.");
    }
    expect(snapshot.user.isApproved).toBe(true);
    expect(snapshot.membership?.role).toBe("member");
    expect(snapshot.invitation).toMatchObject({
      state: "accepted",
      acceptedByUserId: ids.inviteeUserId,
    });
    await expect(
      asInvitee.action(api.organizationMembers.getInvitation, { code: created.code }),
    ).resolves.toMatchObject({
      state: "accepted",
      isViewerMember: true,
    });
    await expect(
      asOwner.action(api.organizationMembers.getInvitation, { code: created.code }),
    ).resolves.toEqual({ state: "unavailable" });
    await expect(
      asOwner.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).rejects.toThrow("Invitation is unavailable.");

    await asOwner.mutation(api.organizationMembers.removeMember, {
      organizationId: ids.organizationId,
      membershipId: snapshot.membership?._id ?? ids.memberMembershipId,
    });
    await expect(
      asInvitee.action(api.organizationMembers.getInvitation, { code: created.code }),
    ).resolves.toMatchObject({
      state: "accepted",
      isViewerMember: false,
    });
    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).resolves.toEqual({
      state: "already_accepted",
      organizationOwnerLogin: "samebase-test-org",
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("organizationMemberships")
            .withIndex("by_organization_and_user", (builder) =>
              builder.eq("organizationId", ids.organizationId).eq("userId", ids.inviteeUserId),
            )
            .unique(),
      ),
    ).resolves.toBeNull();
    const reissued = await asOwner.action(api.organizationMembers.createInvitation, {
      organizationId: ids.organizationId,
      githubLogin: "invitee-login",
      expectedGithubAccountId: "200",
    });
    expect(reissued).toMatchObject({
      state: "created",
    });
    expect(reissued.invitationId).not.toBe(created.invitationId);
    expect(reissued.code).not.toBe(created.code);
    await expect(
      t.run(async (ctx) => await ctx.db.get(created.invitationId)),
    ).resolves.toMatchObject({
      state: "accepted",
      acceptedByUserId: ids.inviteeUserId,
    });
  });

  it("blocks new invitations and keeps existing invitations pending without capacity", async () => {
    const { asInvitee, asOwner, ids, t } = await seedMembers();
    githubMocks.getInstallationUserByLogin.mockResolvedValue({
      data: githubUser(200, "invitee-login"),
    });
    await expect(
      asOwner.action(api.organizationMembers.createInvitation, {
        organizationId: ids.organizationId,
        githubLogin: "invitee-login",
        expectedGithubAccountId: "200",
      }),
    ).rejects.toThrow(
      "This organization needs another paid member seat before another member can join.",
    );
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationInvitations").collect()),
    ).resolves.toEqual([]);

    const code = "e".repeat(64);
    const { billingAccountId, invitationId } = await t.run(async (ctx) => {
      const billingAccount = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", ids.organizationId))
        .unique();
      if (billingAccount === null) {
        throw new Error("Billing account is required.");
      }
      await ctx.db.patch(billingAccount._id, {
        plan: "free",
        status: "inactive",
      });
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "200",
        githubLogin: "invitee-login",
        code,
        createdByUserId: ids.ownerUserId,
        createdAt: roundedNow,
        expiresAt: roundedNow + 60_000,
        state: "pending",
      });
      return { billingAccountId: billingAccount._id, invitationId };
    });

    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code }),
    ).rejects.toThrow(
      "This organization needs another paid member seat before another member can join.",
    );
    await expect(t.run(async (ctx) => await ctx.db.get(invitationId))).resolves.toMatchObject({
      state: "pending",
    });
    await expect(t.run(async (ctx) => await ctx.db.get(ids.inviteeUserId))).resolves.toMatchObject({
      isApproved: false,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(billingAccountId, {
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: `members-customer-${ids.organizationId}`,
        polarBillingUserId: ids.ownerUserId,
        polarSeatQuantity: 3,
      });
    });
    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code }),
    ).resolves.toEqual({
      state: "joined",
      organizationOwnerLogin: "samebase-test-org",
    });
  });

  it("lets only one concurrent invitation consume the last verified seat", async () => {
    const { asInvitee, ids, t } = await seedMembers();
    const firstCode = "5".repeat(64);
    const secondCode = "6".repeat(64);
    const secondInviteeUserId = await t.run(async (ctx) => {
      const billingAccount = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", ids.organizationId))
        .unique();
      if (billingAccount === null) {
        throw new Error("Billing account is required.");
      }
      await ctx.db.patch(billingAccount._id, {
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: `members-customer-${ids.organizationId}`,
        polarBillingUserId: ids.ownerUserId,
        polarSeatQuantity: 3,
      });
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "second-invitee@example.invalid",
        isApproved: false,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "201",
        githubLogin: "second-invitee-login",
      });
      await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "200",
        githubLogin: "invitee-login",
        code: firstCode,
        createdByUserId: ids.ownerUserId,
        createdAt: roundedNow,
        expiresAt: roundedNow + 60_000,
        state: "pending",
      });
      await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "201",
        githubLogin: "second-invitee-login",
        code: secondCode,
        createdByUserId: ids.ownerUserId,
        createdAt: roundedNow,
        expiresAt: roundedNow + 60_000,
        state: "pending",
      });
      return userId;
    });
    const asSecondInvitee = t.withIdentity({
      subject: `${secondInviteeUserId}|second-invitee-session`,
      tokenIdentifier: `test:${secondInviteeUserId}`,
    });

    const results = await Promise.allSettled([
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code: firstCode }),
      asSecondInvitee.mutation(api.organizationMembers.acceptInvitation, { code: secondCode }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization_and_user", (query) =>
            query.eq("organizationId", ids.organizationId),
          )
          .collect(),
      ),
    ).resolves.toHaveLength(3);
  });

  it("retains invitation creator attribution through the deleted user tombstone", async () => {
    const { asOwner, ids, t } = await seedMembers();
    const code = "8".repeat(64);
    const invitationId = await t.run(async (ctx) => {
      return await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "408",
        githubLogin: "creator-target",
        code,
        createdByUserId: ids.memberUserId,
        createdAt: roundedNow,
        expiresAt: roundedNow + 60_000,
        state: "pending",
      });
    });

    await expect(
      asOwner.query(api.organizationMembers.getPage, {
        organizationId: ids.organizationId,
        now: roundedNow,
      }),
    ).resolves.toMatchObject({
      pendingInvitations: [
        {
          invitationId,
          createdBy: { kind: "displayName", label: "Member" },
        },
      ],
    });

    await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("authSessions", {
        userId: ids.memberUserId,
        expirationTime: roundedNow + 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: {
          state: "active",
          userId: ids.memberUserId,
          email: "member@example.invalid",
        },
        completionCapability: "8".repeat(64),
        currentStep: "request_accepted",
        requestedAt: roundedNow,
        updatedAt: roundedNow,
        initiatingSessionId: sessionId,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: "creator-deletion", attempt: 1 },
      });
      await ctx.db.replace(ids.memberUserId, {
        state: "deleting",
        email: "member@example.invalid",
        displayName: "Member",
        isApproved: true,
        runId,
        requestedAt: roundedNow,
      });
    });
    await expect(
      asOwner.query(api.organizationMembers.getPage, {
        organizationId: ids.organizationId,
        now: roundedNow,
      }),
    ).resolves.toMatchObject({
      pendingInvitations: [{ createdBy: { kind: "displayName", label: "Member" } }],
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(ids.memberMembershipId);
      await ctx.db.replace(ids.memberUserId, { state: "deleted", deletedAt: roundedNow + 1 });
    });
    await expect(
      asOwner.query(api.organizationMembers.getPage, {
        organizationId: ids.organizationId,
        now: roundedNow,
      }),
    ).resolves.toMatchObject({
      pendingInvitations: [{ createdBy: { kind: "deleted", label: "Deleted Samebase account" } }],
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(ids.memberUserId);
    });
    await expect(
      asOwner.query(api.organizationMembers.getPage, {
        organizationId: ids.organizationId,
        now: roundedNow,
      }),
    ).rejects.toThrow("Samebase user reference is invalid.");
  });

  it("keeps an existing role and checks GitHub identity before existing membership", async () => {
    const { asOwner, ids, t } = await seedMembers();
    githubMocks.getInstallationUserByLogin.mockResolvedValue({
      data: githubUser(100, "owner-login"),
    });
    const created = await asOwner.action(api.organizationMembers.createInvitation, {
      organizationId: ids.organizationId,
      githubLogin: "owner-login",
      expectedGithubAccountId: "100",
    });
    await expect(
      asOwner.action(api.organizationMembers.getInvitation, { code: created.code }),
    ).resolves.toMatchObject({ state: "available", viewerState: "already_member" });
    await expect(
      asOwner.mutation(api.organizationMembers.acceptInvitation, { code: created.code }),
    ).resolves.toEqual({
      state: "already_member",
      organizationOwnerLogin: "samebase-test-org",
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.ownerMembershipId))?.role),
    ).resolves.toBe("owner");
  });

  it("rejects self-demotion and self-removal by the last active owner", async () => {
    const { asOwner, ids, t } = await seedMembers();

    await expect(
      asOwner.mutation(api.organizationMembers.changeRole, {
        organizationId: ids.organizationId,
        membershipId: ids.ownerMembershipId,
        role: "member",
      }),
    ).rejects.toThrow("An organization must have at least one active owner.");
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.ownerMembershipId))?.role),
    ).resolves.toBe("owner");
    await expect(
      asOwner.mutation(api.organizationMembers.removeMember, {
        organizationId: ids.organizationId,
        membershipId: ids.ownerMembershipId,
      }),
    ).rejects.toThrow("Use Leave organization to remove your own membership.");
  });

  it("keeps the designated billing payer as an organization owner", async () => {
    const { asMember, asOwner, ids, t } = await seedMembers();
    await expect(
      asOwner.mutation(api.organizationMembers.changeRole, {
        organizationId: ids.organizationId,
        membershipId: ids.memberMembershipId,
        role: "owner",
      }),
    ).resolves.toEqual({ state: "changed", role: "owner" });
    await t.run(async (ctx) => {
      const billingAccount = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", ids.organizationId))
        .unique();
      if (billingAccount === null) {
        throw new Error("Billing account is required.");
      }
      await ctx.db.patch(billingAccount._id, {
        polarBillingUserId: ids.ownerUserId,
      });
    });

    await expect(
      asOwner.mutation(api.organizationMembers.changeRole, {
        organizationId: ids.organizationId,
        membershipId: ids.ownerMembershipId,
        role: "member",
      }),
    ).rejects.toThrow(
      "Transfer organization billing before changing or removing the billing payer.",
    );
    await expect(
      asOwner.mutation(api.organizationMembers.leaveOrganization, {
        organizationId: ids.organizationId,
      }),
    ).rejects.toThrow(
      "Transfer organization billing before changing or removing the billing payer.",
    );
    await expect(
      asMember.mutation(api.organizationMembers.removeMember, {
        organizationId: ids.organizationId,
        membershipId: ids.ownerMembershipId,
      }),
    ).rejects.toThrow(
      "Transfer organization billing before changing or removing the billing payer.",
    );
  });

  it("derives expiry, deletes canceled invitations, and denies member administration", async () => {
    const { asInvitee, asMember, asOwner, ids, t } = await seedMembers();
    const expiredCode = "1".repeat(64);
    const cancelCode = "2".repeat(64);
    const expiredAt = roundedNow - 1;
    const invitationIds = await t.run(async (ctx) => {
      const expiredInvitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "200",
        githubLogin: "invitee-login",
        code: expiredCode,
        createdByUserId: ids.ownerUserId,
        createdAt: 1,
        expiresAt: expiredAt,
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
      const billingAccount = await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", ids.organizationId))
        .unique();
      if (billingAccount === null) {
        throw new Error("Billing account is required.");
      }
      await ctx.db.patch(billingAccount._id, {
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: `members-customer-${ids.organizationId}`,
        polarBillingUserId: ids.ownerUserId,
        polarSeatQuantity: 3,
      });
      return { expiredInvitationId, cancelInvitationId };
    });

    await expect(
      t.query(internal.organizationMembers.getInvitationAtTime, {
        code: expiredCode,
        now: expiredAt - 1,
        viewerUserId: ids.inviteeUserId,
      }),
    ).resolves.toMatchObject({ state: "available", viewerState: "can_accept" });
    await expect(
      t.query(internal.organizationMembers.getInvitationAtTime, {
        code: expiredCode,
        now: expiredAt,
        viewerUserId: ids.inviteeUserId,
      }),
    ).resolves.toEqual({ state: "unavailable" });
    await expect(
      asInvitee.action(api.organizationMembers.getInvitation, {
        code: expiredCode,
        // @ts-expect-error The public action must reject a forged client clock.
        now: 0,
      }),
    ).rejects.toThrow();
    await expect(
      asInvitee.action(api.organizationMembers.getInvitation, { code: expiredCode }),
    ).resolves.toEqual({ state: "unavailable" });
    await expect(
      asInvitee.mutation(api.organizationMembers.acceptInvitation, { code: expiredCode }),
    ).rejects.toThrow("Invitation has expired.");
    const reissued = await t.mutation(internal.organizationMembers.commitInvitation, {
      userId: ids.ownerUserId,
      organizationId: ids.organizationId,
      expectedGithubAccountId: "200",
      githubLogin: "invitee-login",
      proposedCode: "3".repeat(64),
    });
    expect(reissued).toMatchObject({
      state: "created",
      invitationId: invitationIds.expiredInvitationId,
      code: "3".repeat(64),
    });
    await expect(
      asInvitee.action(api.organizationMembers.getInvitation, { code: reissued.code }),
    ).resolves.toMatchObject({ state: "available", viewerState: "can_accept" });
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
      asMember.action(api.organizationMembers.resolveInvitationTarget, {
        organizationId: ids.organizationId,
        githubLogin: "new-target",
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      asMember.action(api.organizationMembers.getGitHubRelationships, {
        organizationId: ids.organizationId,
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
    githubMocks.getInstallationUserByLogin.mockResolvedValue({
      data: githubUser(200, "race-target"),
    });
    const target = await asOwner.action(api.organizationMembers.resolveInvitationTarget, {
      organizationId: ids.organizationId,
      githubLogin: "race-target",
    });
    githubMocks.getInstallationUserByLogin.mockResolvedValue({
      data: githubUser(201, "race-target"),
    });
    await expect(
      asOwner.action(api.organizationMembers.createInvitation, {
        organizationId: ids.organizationId,
        githubLogin: "race-target",
        expectedGithubAccountId: target.expectedGithubAccountId,
      }),
    ).rejects.toThrow("The GitHub account changed. Resolve the invitation target again.");
  });

  it("uses the public GitHub user when the installation returns 404", async () => {
    const { asOwner, ids, t } = await seedMembers();
    githubMocks.getInstallationUserByLogin.mockRejectedValue(githubRequestError(404));
    githubMocks.getPublicUserByLogin.mockResolvedValue({
      data: githubUser(205, "fallback-target"),
    });

    const target = await asOwner.action(api.organizationMembers.resolveInvitationTarget, {
      organizationId: ids.organizationId,
      githubLogin: "fallback-target",
    });
    expect(target).toMatchObject({
      expectedGithubAccountId: "205",
      githubLogin: "fallback-target",
      relationship: "unavailable",
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.memberMembershipId);
    });
    await expect(
      asOwner.action(api.organizationMembers.createInvitation, {
        organizationId: ids.organizationId,
        githubLogin: target.githubLogin,
        expectedGithubAccountId: target.expectedGithubAccountId,
      }),
    ).resolves.toMatchObject({
      githubLogin: "fallback-target",
      state: "created",
    });
    expect(githubMocks.getPublicUserByLogin).toHaveBeenCalledTimes(2);
  });

  it("does not retry public GitHub lookup after an invalid installation profile", async () => {
    const { asOwner, ids } = await seedMembers();
    githubMocks.getInstallationUserByLogin.mockResolvedValueOnce({
      data: githubUser(200, "invalid-target", { id: "invalid" }),
    });
    await expect(
      asOwner.action(api.organizationMembers.resolveInvitationTarget, {
        organizationId: ids.organizationId,
        githubLogin: "invalid-target",
      }),
    ).rejects.toThrow("GitHub returned an invalid user ID.");
    expect(githubMocks.getPublicUserByLogin).not.toHaveBeenCalled();
  });

  it("returns a product error when the anonymous GitHub lookup cannot resolve a user", async () => {
    const { asOwner, ids } = await seedMembers();
    githubMocks.getInstallationUserByLogin.mockRejectedValue(githubRequestError(503));
    githubMocks.getPublicUserByLogin.mockRejectedValueOnce(githubRequestError(404));

    await expect(
      asOwner.action(api.organizationMembers.resolveInvitationTarget, {
        organizationId: ids.organizationId,
        githubLogin: "missing-target",
      }),
    ).rejects.toThrow("GitHub user not found.");

    githubMocks.getPublicUserByLogin.mockRejectedValueOnce(githubRequestError(503));
    await expect(
      asOwner.action(api.organizationMembers.resolveInvitationTarget, {
        organizationId: ids.organizationId,
        githubLogin: "unavailable-target",
      }),
    ).rejects.toThrow("GitHub user lookup is unavailable.");
  });

  it("retries anonymous GitHub lookup when the installation request is unavailable", async () => {
    const { asOwner, ids } = await seedMembers();
    githubMocks.getInstallationUserByLogin.mockRejectedValue(githubRequestError(503));
    githubMocks.getPublicUserByLogin.mockResolvedValue({
      data: githubUser(205, "fallback-target"),
    });

    await expect(
      asOwner.action(api.organizationMembers.resolveInvitationTarget, {
        organizationId: ids.organizationId,
        githubLogin: "fallback-target",
      }),
    ).resolves.toMatchObject({
      expectedGithubAccountId: "205",
      githubLogin: "fallback-target",
      relationship: "unavailable",
    });
    expect(githubMocks.getPublicUserByLogin).toHaveBeenCalledTimes(1);
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
        organizationId: ids.organizationId,
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
    await t.run(async (ctx) => {
      const otherOrganizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "other-installation",
        githubOwnerId: "other-owner",
        githubOwnerLogin: "other-owner",
        githubOwnerLoginNormalized: "other-owner",
        githubOwnerType: "organization",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: otherOrganizationId,
        userId: ids.memberUserId,
        role: "member",
      });
      const otherVaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId: otherOrganizationId,
        convexTeamId: "other-team",
        cloudflareAccountId: "other-account",
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId: otherOrganizationId,
        userId: ids.memberUserId,
        vaultId: otherVaultId,
        repositoryFullName: "other-owner/app",
        trigger: "create",
        state: "queued",
        currentStep: "run_created",
        createdAt: roundedNow,
        updatedAt: roundedNow,
      });
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
    const matchingPendingInvitationId = await t.run(async (ctx) => {
      return await ctx.db.insert("organizationInvitations", {
        organizationId: ids.organizationId,
        githubAccountId: "300",
        githubLogin: "member-login",
        code: "7".repeat(64),
        createdByUserId: ids.ownerUserId,
        createdAt: roundedNow,
        expiresAt: roundedNow + 60_000,
        state: "pending",
      });
    });
    await expect(
      asOwner.mutation(api.organizationMembers.removeMember, {
        organizationId: ids.organizationId,
        membershipId: ids.memberMembershipId,
      }),
    ).resolves.toEqual({ state: "removed" });
    await expect(
      t.run(async (ctx) => await ctx.db.get(matchingPendingInvitationId)),
    ).resolves.toBeNull();
    const inactiveOwnerIds = await t.run(async (ctx) => {
      const unapprovedOwnerId = await ctx.db.insert("users", {
        state: "active",
        email: "unapproved-owner@example.invalid",
        isApproved: false,
      });
      const unapprovedMembershipId = await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: unapprovedOwnerId,
        role: "member",
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: unapprovedOwnerId,
        expirationTime: roundedNow + 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: {
          state: "active",
          userId: unapprovedOwnerId,
          email: "unapproved-owner@example.invalid",
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
        workflow: { state: "started", workflowId: "unapproved-owner-deletion", attempt: 1 },
      });
      return { unapprovedOwnerId, unapprovedMembershipId, runId };
    });
    await expect(
      asOwner.mutation(api.organizationMembers.changeRole, {
        organizationId: ids.organizationId,
        membershipId: inactiveOwnerIds.unapprovedMembershipId,
        role: "owner",
      }),
    ).resolves.toEqual({ state: "changed", role: "owner" });
    await expect(
      asOwner.mutation(api.organizationMembers.leaveOrganization, {
        organizationId: ids.organizationId,
      }),
    ).resolves.toEqual({ state: "left" });

    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId: ids.organizationId,
        userId: ids.ownerUserId,
        role: "owner",
      });
      await ctx.db.replace(inactiveOwnerIds.unapprovedOwnerId, {
        state: "deleting",
        email: "unapproved-owner@example.invalid",
        isApproved: false,
        runId: inactiveOwnerIds.runId,
        requestedAt: roundedNow,
      });
      await ctx.db.patch(inactiveOwnerIds.unapprovedMembershipId, { role: "member" });
    });
    await expect(
      asOwner.mutation(api.organizationMembers.changeRole, {
        organizationId: ids.organizationId,
        membershipId: inactiveOwnerIds.unapprovedMembershipId,
        role: "owner",
      }),
    ).rejects.toThrow("Only an active Samebase user can become an Owner.");
    await expect(
      asOwner.mutation(api.organizationMembers.leaveOrganization, {
        organizationId: ids.organizationId,
      }),
    ).rejects.toThrow("An organization must have at least one active owner.");
  });

  it("rejects a membership that still references a deleted user", async () => {
    const { asOwner, ids, t } = await seedMembers();
    await t.run(async (ctx) => {
      await ctx.db.replace(ids.memberUserId, { state: "deleted", deletedAt: roundedNow });
    });

    await expect(
      asOwner.query(api.organizationMembers.getPage, {
        organizationId: ids.organizationId,
        now: roundedNow,
      }),
    ).rejects.toThrow("Organization membership references a deleted user.");
    await expect(
      asOwner.mutation(api.organizationMembers.removeMember, {
        organizationId: ids.organizationId,
        membershipId: ids.memberMembershipId,
      }),
    ).rejects.toThrow("Organization membership references a deleted user.");
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
    githubMocks.getInstallationUserByAccountId.mockImplementation(
      async (options: { account_id?: number }) => {
        if (options.account_id === 100) {
          return { data: githubUser(100, "renamed-owner") };
        }
        if (options.account_id === 300) {
          return { data: githubUser(300, "renamed-member") };
        }
        throw new Error(`Unexpected GitHub account ID: ${options.account_id}`);
      },
    );
    githubMocks.getOrganizationMembershipForUser.mockImplementation(
      async (options: { username?: string }) => {
        if (options.username === "renamed-owner") {
          return { data: githubMembership(100, "admin") };
        }
        if (options.username === "renamed-member") {
          return { data: githubMembership(300) };
        }
        throw new Error(`Unexpected GitHub username: ${options.username}`);
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
