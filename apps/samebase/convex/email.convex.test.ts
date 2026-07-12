import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

const sendArgs = {
  to: "nicu@samebase.com",
  subject: "New Samebase signup",
  text: "A new user signed up for Samebase.",
};

function stubEmailConfiguration(deployment: string) {
  vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "account-id");
  vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "email-token");
  vi.stubEnv("CONVEX_DEPLOYMENT", deployment);
}

function stubSuccessfulSend() {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(
      JSON.stringify({
        success: true,
        errors: [],
        messages: [],
        result: {
          delivered: ["nicu@samebase.com"],
          message_id: "<message-id@samebase.com>",
          permanent_bounces: [],
          queued: [],
        },
      }),
      { status: 200 },
    );
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function readRequestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  return JSON.parse(init.body);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cloudflare email sending", () => {
  it("sends production email through the account-scoped REST endpoint", async () => {
    const t = makeConvexTest();
    stubEmailConfiguration("prod:samebase");
    const fetch = stubSuccessfulSend();

    await expect(t.action(internal.email.send, sendArgs)).resolves.toBeNull();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0];
    expect(input).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account-id/email/sending/send",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer email-token",
        "Content-Type": "application/json",
      },
    });
    expect(readRequestBody(init)).toEqual({
      to: "nicu@samebase.com",
      from: {
        address: "notifications@samebase.com",
        name: "Samebase",
      },
      subject: "New Samebase signup",
      text: "A new user signed up for Samebase.",
    });
  });

  it("labels preview email from the existing deployment profile", async () => {
    const t = makeConvexTest();
    stubEmailConfiguration("preview:email-branch");
    const fetch = stubSuccessfulSend();

    await t.action(internal.email.send, sendArgs);

    const [, init] = fetch.mock.calls[0];
    expect(readRequestBody(init)).toMatchObject({
      subject: "[Preview] New Samebase signup",
    });
  });

  it("labels shared development email without another environment variable", async () => {
    const t = makeConvexTest();
    stubEmailConfiguration("dev:samebase");
    const fetch = stubSuccessfulSend();

    await t.action(internal.email.send, sendArgs);

    const [, init] = fetch.mock.calls[0];
    expect(readRequestBody(init)).toMatchObject({
      subject: "[Development] New Samebase signup",
    });
  });

  it.each(["local:fast-meadow-123", "local:local-agent"])(
    "does not make external requests from unconfigured local deployment %s",
    async (deployment) => {
      const t = makeConvexTest();
      vi.stubEnv("CONVEX_DEPLOYMENT", deployment);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);

      await expect(t.action(internal.email.send, sendArgs)).resolves.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("fails deployed sends when the email configuration is missing", async () => {
    const t = makeConvexTest();
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:email-branch");

    await expect(t.action(internal.email.send, sendArgs)).rejects.toThrow(
      "CLOUDFLARE_EMAIL_API_TOKEN and CLOUDFLARE_EMAIL_ACCOUNT_ID are required",
    );
  });

  it("reports Cloudflare API errors without exposing the token", async () => {
    const t = makeConvexTest();
    stubEmailConfiguration("dev:samebase");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            errors: [
              {
                code: "10001",
                message: "email.sending.error.invalid_request_schema",
              },
            ],
            messages: [],
            result: null,
          }),
          { status: 400 },
        );
      }),
    );

    const result = t.action(internal.email.send, sendArgs);
    await expect(result).rejects.toThrow(
      "Cloudflare Email Sending failed (400): 10001: email.sending.error.invalid_request_schema",
    );
    await expect(result).rejects.not.toThrow("email-token");
  });

  it("fails when Cloudflare reports a permanent bounce", async () => {
    const t = makeConvexTest();
    stubEmailConfiguration("prod:samebase");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            messages: [],
            result: {
              delivered: [],
              message_id: "<message-id@samebase.com>",
              permanent_bounces: ["nicu@samebase.com"],
              queued: [],
            },
          }),
          { status: 200 },
        );
      }),
    );

    await expect(t.action(internal.email.send, sendArgs)).rejects.toThrow(
      "Cloudflare Email Sending permanently bounced for 1 recipient(s).",
    );
  });

  it("preserves the status for non-JSON provider failures", async () => {
    const t = makeConvexTest();
    stubEmailConfiguration("prod:samebase");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad gateway", { status: 502 })),
    );

    await expect(t.action(internal.email.send, sendArgs)).rejects.toThrow(
      "Cloudflare Email Sending returned a non-JSON response (502).",
    );
  });
});
