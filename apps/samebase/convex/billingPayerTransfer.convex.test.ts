import type { Member } from "@polar-sh/sdk/models/components/member";
import { PolarError } from "@polar-sh/sdk/models/errors/polarerror";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const polarMocks = vi.hoisted(() => ({
  createPolarClient: vi.fn(),
}));

vi.mock("./polarClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./polarClient")>();
  return {
    ...actual,
    createPolarClient: polarMocks.createPolarClient,
  };
});

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

function polarNotFound(): PolarError {
  return new PolarError("Member not found", {
    body: "",
    request: new Request("https://api.polar.sh/v1/customers/members"),
    response: new Response(null, { status: 404 }),
  });
}

async function seedPayerTransfer() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const currentPayerUserId = await ctx.db.insert("users", {
      state: "active",
      displayName: "Current Payer",
      email: "current-payer@example.invalid",
      isApproved: true,
    });
    const targetUserId = await ctx.db.insert("users", {
      state: "active",
      displayName: "Next Payer",
      email: "next-payer@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "payer-transfer-org",
      githubOwnerType: "organization",
      githubOwnerLogin: "payer-transfer-org",
      githubOwnerLoginNormalized: "payer-transfer-org",
      githubInstallationId: "payer-transfer-installation",
    });
    const currentPayerMembershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      role: "owner",
      userId: currentPayerUserId,
    });
    const targetMembershipId = await ctx.db.insert("organizationMemberships", {
      organizationId,
      role: "owner",
      userId: targetUserId,
    });
    const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "pro",
      polarBillingUserId: currentPayerUserId,
      polarExternalCustomerId: "payer-transfer-customer",
      polarSeatQuantity: 2,
      provider: "polar",
      status: "active",
    });
    return {
      billingAccountId,
      currentPayerMembershipId,
      currentPayerUserId,
      organizationId,
      targetMembershipId,
      targetUserId,
    };
  });
  return {
    ...ids,
    asCurrentPayer: t.withIdentity({
      subject: `${ids.currentPayerUserId}|payer-transfer-session`,
      tokenIdentifier: `test:${ids.currentPayerUserId}`,
    }),
    asTarget: t.withIdentity({
      subject: `${ids.targetUserId}|target-session`,
      tokenIdentifier: `test:${ids.targetUserId}`,
    }),
    t,
  };
}

function createPolarMemberBoundary(args: {
  currentPayerUserId: Id<"users">;
  currentPayerRole?: Member["role"];
  targetRole?: Member["role"];
  targetUserId: Id<"users">;
}) {
  const roles = new Map<string, Member["role"]>([
    [args.currentPayerUserId, args.currentPayerRole ?? "owner"],
  ]);
  if (args.targetRole) {
    roles.set(args.targetUserId, args.targetRole);
  }
  const emails = new Map<string, string>([
    [args.currentPayerUserId, "current-payer@example.invalid"],
    [args.targetUserId, "next-payer@example.invalid"],
  ]);
  const member = (userId: string): Member => {
    const role = roles.get(userId);
    if (!role) {
      throw polarNotFound();
    }
    return {
      id: `polar-member-${userId}`,
      createdAt: new Date(0),
      modifiedAt: null,
      customerId: "polar-customer-1",
      email: emails.get(userId) ?? "member@example.invalid",
      externalId: userId,
      name: null,
      role,
    };
  };
  const getExternal = vi.fn(async ({ memberExternalId }: { memberExternalId: string }) =>
    member(memberExternalId),
  );
  const createExternal = vi.fn(
    async ({
      memberCreateFromCustomer,
    }: {
      memberCreateFromCustomer: {
        email: string;
        externalId?: string | null;
        role?: "member" | "billing_manager";
      };
    }) => {
      const externalId = memberCreateFromCustomer.externalId;
      if (!externalId) {
        throw new Error("External member ID is required.");
      }
      roles.set(externalId, memberCreateFromCustomer.role ?? "member");
      emails.set(externalId, memberCreateFromCustomer.email);
      return member(externalId);
    },
  );
  const updateExternal = vi.fn(
    async ({
      memberExternalId,
      memberUpdate,
    }: {
      memberExternalId: string;
      memberUpdate: { role?: Member["role"] | null };
    }) => {
      if (!roles.has(memberExternalId) || !memberUpdate.role) {
        throw new Error("Polar Member update is invalid.");
      }
      if (memberUpdate.role === "owner") {
        for (const [userId, role] of roles) {
          if (role === "owner") {
            roles.set(userId, "billing_manager");
          }
        }
      }
      roles.set(memberExternalId, memberUpdate.role);
      return member(memberExternalId);
    },
  );
  polarMocks.createPolarClient.mockReturnValue({
    customers: {
      getExternal: vi.fn(async ({ externalId }: { externalId: string }) => ({
        deletedAt: null,
        externalId,
        id: "polar-customer-1",
        type: "team",
      })),
      members: { createExternal, getExternal, updateExternal },
    },
  });
  return { createExternal, getExternal, roles, updateExternal };
}

describe("Polar billing payer transfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "local:test");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("moves Polar ownership before it changes the Samebase billing payer", async () => {
    const seed = await seedPayerTransfer();
    const polar = createPolarMemberBoundary(seed);

    await expect(
      seed.asTarget.action(api.billing.transferPolarBillingPayer, {
        organizationId: seed.organizationId,
        targetMembershipId: seed.currentPayerMembershipId,
      }),
    ).rejects.toThrow("Only the designated billing payer can transfer billing.");
    expect(polar.getExternal).not.toHaveBeenCalled();

    await expect(
      seed.asCurrentPayer.action(api.billing.transferPolarBillingPayer, {
        organizationId: seed.organizationId,
        targetMembershipId: seed.targetMembershipId,
      }),
    ).resolves.toEqual({ state: "transferred" });

    expect(polar.createExternal).toHaveBeenCalledWith({
      externalId: "payer-transfer-customer",
      memberCreateFromCustomer: {
        email: "next-payer@example.invalid",
        externalId: seed.targetUserId,
        name: "Next Payer",
        role: "member",
      },
    });
    expect(polar.updateExternal.mock.calls.map((call) => call[0])).toEqual([
      {
        externalId: "payer-transfer-customer",
        memberExternalId: seed.targetUserId,
        memberUpdate: { role: "owner" },
      },
      {
        externalId: "payer-transfer-customer",
        memberExternalId: seed.currentPayerUserId,
        memberUpdate: { role: "member" },
      },
    ]);
    expect(polar.roles.get(seed.currentPayerUserId)).toBe("member");
    expect(polar.roles.get(seed.targetUserId)).toBe("owner");
    await expect(
      seed.t.run(async (ctx) => await ctx.db.get(seed.billingAccountId)),
    ).resolves.toMatchObject({
      polarBillingUserId: seed.targetUserId,
    });
    expect(
      await seed.t.run(async (ctx) => await ctx.db.get(seed.billingAccountId)),
    ).not.toHaveProperty("polarBillingPayerTransfer");
  });

  it("resumes after Polar changed ownership but Samebase did not finish", async () => {
    const seed = await seedPayerTransfer();
    const polar = createPolarMemberBoundary({
      ...seed,
      currentPayerRole: "billing_manager",
      targetRole: "owner",
    });
    await seed.t.run(async (ctx) => {
      await ctx.db.patch(seed.billingAccountId, {
        polarBillingPayerTransfer: {
          attemptId: "existing-transfer-attempt",
          targetUserId: seed.targetUserId,
        },
      });
    });

    await expect(
      seed.asCurrentPayer.action(api.billing.transferPolarBillingPayer, {
        organizationId: seed.organizationId,
        targetMembershipId: seed.targetMembershipId,
      }),
    ).resolves.toEqual({ state: "transferred" });

    expect(polar.createExternal).not.toHaveBeenCalled();
    expect(polar.updateExternal).toHaveBeenCalledOnce();
    expect(polar.updateExternal).toHaveBeenCalledWith({
      externalId: "payer-transfer-customer",
      memberExternalId: seed.currentPayerUserId,
      memberUpdate: { role: "member" },
    });
  });

  it("keeps the target protected when Polar does not confirm the transfer", async () => {
    const seed = await seedPayerTransfer();
    const polar = createPolarMemberBoundary(seed);
    polar.getExternal.mockRejectedValueOnce(new Error("Polar is unavailable."));

    await expect(
      seed.asCurrentPayer.action(api.billing.transferPolarBillingPayer, {
        organizationId: seed.organizationId,
        targetMembershipId: seed.targetMembershipId,
      }),
    ).rejects.toThrow("Polar could not finish the billing payer transfer. Try again.");

    await expect(
      seed.t.run(async (ctx) => await ctx.db.get(seed.billingAccountId)),
    ).resolves.toMatchObject({
      polarBillingPayerTransfer: { targetUserId: seed.targetUserId },
      polarBillingUserId: seed.currentPayerUserId,
    });
    await expect(
      seed.asCurrentPayer.mutation(api.organizationMembers.changeRole, {
        organizationId: seed.organizationId,
        membershipId: seed.targetMembershipId,
        role: "member",
      }),
    ).rejects.toThrow(
      "Finish the billing payer transfer before changing or removing the next billing payer.",
    );
    await expect(
      seed.t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId: seed.organizationId,
        role: "member",
        userEmail: "next-payer@example.invalid",
      }),
    ).rejects.toThrow(
      "Finish the billing payer transfer before changing or removing the next billing payer.",
    );
    await expect(
      seed.asCurrentPayer.query(api.billing.getViewerBillingStatus, {
        organizationId: seed.organizationId,
      }),
    ).resolves.toMatchObject({ canManageBilling: false, payerState: "viewer" });
    await expect(
      seed.asCurrentPayer.action(api.billing.requestPolarBillingChange, {
        change: { expectedSeatQuantity: 2, kind: "add_member_seat" },
        organizationId: seed.organizationId,
        returnUrl: "http://localhost/org/payer-transfer-org/settings?checkout=cancel",
        successUrl: "http://localhost/org/payer-transfer-org/settings?checkout=success",
      }),
    ).rejects.toThrow("Finish the billing payer transfer before changing this subscription.");
  });
});
