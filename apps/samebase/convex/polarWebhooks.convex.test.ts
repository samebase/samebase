import { Webhook } from "standardwebhooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { makeConvexTest } from "./test.setup";

const webhookSecret = "samebase-polar-webhook-test-secret";

function createSignedWebhookRequest(body: string): RequestInit {
  const messageId = "webhook-message-1";
  const timestamp = new Date();
  const signature = new Webhook(new TextEncoder().encode(webhookSecret), {
    format: "raw",
  }).sign(messageId, timestamp, body);
  return {
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": messageId,
      "webhook-signature": signature,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
    },
    method: "POST",
  };
}

describe("Polar webhooks", () => {
  beforeEach(() => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", webhookSecret);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("rejects an invalid signature", async () => {
    const response = await makeConvexTest().fetch("/webhooks/polar", {
      body: JSON.stringify({ type: "ignored.event" }),
      headers: {
        "content-type": "application/json",
        "webhook-id": "webhook-message-1",
        "webhook-signature": "v1,invalid",
        "webhook-timestamp": String(Math.floor(Date.now() / 1_000)),
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
  });

  it("ignores a valid signed event that Samebase does not use", async () => {
    const body = JSON.stringify({ type: "ignored.event" });
    const response = await makeConvexTest().fetch(
      "/webhooks/polar",
      createSignedWebhookRequest(body),
    );

    expect(response.status).toBe(204);
  });

  it("rejects a malformed signed subscription event without changing billing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const body = JSON.stringify({
      data: {},
      timestamp: new Date().toISOString(),
      type: "subscription.updated",
    });
    const t = makeConvexTest();
    const response = await t.fetch("/webhooks/polar", createSignedWebhookRequest(body));

    expect(response.status).toBe(500);
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationBillingAccounts").collect()),
    ).resolves.toEqual([]);
  });
});
