import { Webhook } from "standardwebhooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { makeConvexTest } from "./test.setup";

const webhookSecret = "whsec_c2FtZWJhc2UtcG9sYXItd2ViaG9vay10ZXN0LXNlY3JldA==";
const standardSigner = new Webhook(webhookSecret);
// Polar documents both signing keys at https://polar.sh/docs/integrate/webhooks/delivery.
const signingSchemes = [
  ["legacy Polar HMAC", new Webhook(new TextEncoder().encode(webhookSecret), { format: "raw" })],
  ["Standard Webhooks", standardSigner],
] as const;

function createSignedWebhookRequest(
  body: string,
  signer: Webhook,
  timestamp = new Date(),
): RequestInit {
  const messageId = "webhook-message-1";
  const signature = signer.sign(messageId, timestamp, body);
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

  it("rejects an invalid signature with a legacy secret that is not Base64", async () => {
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "samebase-polar-webhook-test-secret");
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

  it.each(signingSchemes)("ignores an unused event signed with %s", async (_scheme, signer) => {
    const body = JSON.stringify({ type: "ignored.event" });
    const response = await makeConvexTest().fetch(
      "/webhooks/polar",
      createSignedWebhookRequest(body, signer),
    );

    expect(response.status).toBe(204);
  });

  it.each(signingSchemes)(
    "rejects changed or expired requests signed with %s",
    async (_scheme, signer) => {
      const body = JSON.stringify({ type: "ignored.event" });
      const t = makeConvexTest();
      const changedBody = await t.fetch("/webhooks/polar", {
        ...createSignedWebhookRequest(body, signer),
        body: JSON.stringify({ type: "subscription.updated" }),
      });
      const expired = await t.fetch(
        "/webhooks/polar",
        createSignedWebhookRequest(body, signer, new Date(Date.now() - 600_000)),
      );

      expect(changedBody.status).toBe(401);
      expect(expired.status).toBe(401);
    },
  );

  it("rejects a malformed signed subscription event without changing billing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const body = JSON.stringify({
      data: {},
      timestamp: new Date().toISOString(),
      type: "subscription.updated",
    });
    const t = makeConvexTest();
    const response = await t.fetch(
      "/webhooks/polar",
      createSignedWebhookRequest(body, standardSigner),
    );

    expect(response.status).toBe(500);
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationBillingAccounts").collect()),
    ).resolves.toEqual([]);
  });
});
