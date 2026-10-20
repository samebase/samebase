import { Webhook } from "standardwebhooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { makeConvexTest } from "./test.setup";

// t.fetch loads convex/http.ts, which imports these modules that only a build and a deploy write.
vi.mock("../dist/server/server.js", () => ({ default: { fetch: async () => new Response() } }));
vi.mock("../.convex-hosting/version.js", () => ({ versionId: "test" }));

const webhookSecret = "whsec_c2FtZWJhc2UtcG9sYXItd2ViaG9vay10ZXN0LXNlY3JldA==";
const standardSigner = new Webhook(webhookSecret);

function createSignedWebhookRequest(body: string, timestamp = new Date()): RequestInit {
  const messageId = "webhook-message-1";
  const signature = standardSigner.sign(messageId, timestamp, body);
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

  it("rejects changed or expired signed requests", async () => {
    const body = JSON.stringify({ type: "ignored.event" });
    const t = makeConvexTest();
    const changedBody = await t.fetch("/webhooks/polar", {
      ...createSignedWebhookRequest(body),
      body: JSON.stringify({ type: "subscription.updated" }),
    });
    const expired = await t.fetch(
      "/webhooks/polar",
      createSignedWebhookRequest(body, new Date(Date.now() - 600_000)),
    );

    expect(changedBody.status).toBe(401);
    expect(expired.status).toBe(401);
  });

  it("rejects the legacy Polar signing method", async () => {
    const body = JSON.stringify({ type: "ignored.event" });
    const timestamp = new Date();
    const signed = createSignedWebhookRequest(body, timestamp);
    const headers = new Headers(signed.headers);
    headers.set(
      "webhook-signature",
      new Webhook(new TextEncoder().encode(webhookSecret), { format: "raw" }).sign(
        "webhook-message-1",
        timestamp,
        body,
      ),
    );
    const response = await makeConvexTest().fetch("/webhooks/polar", { ...signed, headers });

    expect(response.status).toBe(401);
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
