import { describe, expect, it } from "vite-plus/test";

import { api, components } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function seedMessage(t: ReturnType<typeof makeConvexTest>) {
  const inboxId = await t.mutation(components.mail.inboxes.create, {
    domain: "example.test",
    localPart: "notifications",
    label: "Notifications",
  });
  const messageId = await t.mutation(components.mail.mail.queueSend, {
    inboxId,
    clientRequestId: "email-monitor-test",
    to: ["recipient@example.test"],
    cc: [],
    subject: "Account notification",
    text: "Private notification content.",
  });
  return { inboxId, messageId };
}

describe("staff email monitor", () => {
  it.each(["anonymous", "member", "organization_owner"] as const)(
    "denies every email query to %s, including known inbox and message IDs",
    async (role) => {
      const t = makeConvexTest();
      const { inboxId, messageId } = await seedMessage(t);
      const userId = await t.run(async (ctx) => {
        if (role === "anonymous") return null;

        const userId = await ctx.db.insert("users", {
          state: "active",
          email: "member@example.test",
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        });
        if (role === "organization_owner") {
          const organizationId = await ctx.db.insert("organizations", {
            githubOwnerId: "monitor-test-organization",
            githubOwnerType: "organization",
            githubOwnerLogin: "monitor-test",
            githubOwnerLoginNormalized: "monitor-test",
            githubInstallationId: "monitor-test-installation",
          });
          await ctx.db.insert("organizationMemberships", {
            organizationId,
            userId,
            role: "owner",
          });
        }
        return userId;
      });
      const viewer = userId
        ? t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` })
        : t;

      await expect(viewer.query(api.emailMonitor.listInboxes, {})).rejects.toThrow("Access denied");
      await expect(
        viewer.query(api.emailMonitor.listHistory, {
          inboxId,
          status: null,
          paginationOpts: { numItems: 10, cursor: null },
        }),
      ).rejects.toThrow("Access denied");
      await expect(viewer.query(api.emailMonitor.getMessage, { messageId })).rejects.toThrow(
        "Access denied",
      );
      await expect(viewer.query(api.emailMonitor.getDelivery, { messageId })).rejects.toThrow(
        "Access denied",
      );
    },
  );

  it("lets staff read the component inbox, history, message and delivery", async () => {
    const t = makeConvexTest();
    const { inboxId, messageId } = await seedMessage(t);
    const userId = await t.run(
      async (ctx) =>
        await ctx.db.insert("users", {
          state: "active",
          email: "nicu@samebase.com",
          isApproved: true,
          termsVersion: "2026-08-12",
          termsAcceptedAt: 1,
        }),
    );
    const staff = t.withIdentity({
      subject: userId,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(staff.query(api.emailMonitor.listInboxes, {})).resolves.toMatchObject([
      { _id: inboxId, address: "notifications@example.test", label: "Notifications" },
    ]);
    const history = await staff.query(api.emailMonitor.listHistory, {
      inboxId,
      status: "queued",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page).toMatchObject([{ _id: messageId, subject: "Account notification" }]);
    expect(history.isDone).toBe(true);
    await expect(staff.query(api.emailMonitor.getMessage, { messageId })).resolves.toMatchObject({
      _id: messageId,
      bodyText: "Private notification content.",
      status: "queued",
    });
    await expect(staff.query(api.emailMonitor.getDelivery, { messageId })).resolves.toMatchObject({
      kind: "queued",
    });
  });
});
