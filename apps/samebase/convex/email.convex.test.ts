import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { components, internal } from "./_generated/api";
import { sendEmail } from "./email";
import { makeConvexTest } from "./test.setup";

const sendArgs = {
  to: "nicu@samebase.com",
  subject: "New Samebase signup",
  text: "A new user signed up for Samebase.",
};

function stubEmailConfiguration(deployment: string) {
  // Convex uses V8; the edge-runtime test host lacks the SDK's Node process metadata.
  vi.stubGlobal("EdgeRuntime", undefined);
  vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "account-id");
  vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "email-token");
  vi.stubEnv("CONVEX_DEPLOYMENT", deployment);
}

function stubSuccessfulSend() {
  // Cloudflare REST response fields, checked 2026-10-01:
  // https://developers.cloudflare.com/api/resources/email_sending/methods/send/
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
          suppressed_recipients: [],
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
  it("stores production email and its delivery result in the configured inbox", async () => {
    const t = makeConvexTest();
    stubEmailConfiguration("prod:samebase");
    const fetch = stubSuccessfulSend();

    await expect(t.action(internal.email.send, sendArgs)).resolves.toEqual({
      ok: true,
      value: "accepted",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readRequestBody(fetch.mock.calls[0][1])).toMatchObject({
      from: { address: "notifications@samebase.com", name: "Samebase" },
    });
    const inboxes = await t.query(components.mail.inboxes.list, {});
    expect(inboxes).toMatchObject([
      { address: "notifications@samebase.com", label: "Samebase notifications" },
    ]);
    const threads = await t.query(components.mail.mail.listThreads, {
      inboxId: inboxes[0]._id,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(threads.page).toHaveLength(1);
    const messages = await t.query(components.mail.mail.listMessages, {
      threadId: threads.page[0]._id,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(messages.page).toMatchObject([
      {
        direction: "outbound",
        from: "notifications@samebase.com",
        to: [sendArgs.to],
        subject: sendArgs.subject,
        bodyText: sendArgs.text,
        status: "accepted",
        rawAvailable: false,
        attachments: [],
      },
    ]);
    await expect(
      t.query(components.mail.delivery.get, { messageId: messages.page[0]._id }),
    ).resolves.toMatchObject({
      kind: "accepted",
      providerMessageId: "<message-id@samebase.com>",
      recipientResults: {
        delivered: [sendArgs.to],
        permanent_bounces: [],
        queued: [],
        suppressed_recipients: [],
      },
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

      await expect(t.action(internal.email.send, sendArgs)).resolves.toEqual({
        ok: true,
        value: "skipped",
      });
      expect(fetch).not.toHaveBeenCalled();
      await expect(t.query(components.mail.inboxes.list, {})).resolves.toEqual([]);
    },
  );

  it("fails deployed sends when the email configuration is missing", async () => {
    const t = makeConvexTest();
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:email-branch");

    await expect(t.action(internal.email.send, sendArgs)).rejects.toThrow(
      "CLOUDFLARE_EMAIL_API_TOKEN and CLOUDFLARE_EMAIL_ACCOUNT_ID are required",
    );
  });

  it("returns a rejected result to direct callers and fails the action without provider details", async () => {
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
                code: 10001,
                message: "email-token private-diagnostic@example.com",
              },
            ],
            messages: [],
            result: null,
          }),
          { status: 400 },
        );
      }),
    );

    await expect(t.action((ctx) => sendEmail(ctx, sendArgs))).resolves.toEqual({
      ok: false,
      error: "rejected",
    });
    await expect(t.action(internal.email.send, sendArgs)).rejects.toThrow(
      new Error(
        "Email sending was not confirmed: rejected. Check delivery history before retrying.",
      ),
    );
  });

  it.each([
    {
      label: "permanent bounce",
      permanentBounces: [sendArgs.to],
      suppressedRecipients: [],
      error: "bounced",
    },
    {
      label: "suppressed recipient",
      permanentBounces: [],
      suppressedRecipients: [sendArgs.to],
      error: "suppressed",
    },
  ])(
    "returns a $label to direct callers and fails the action",
    async ({ permanentBounces, suppressedRecipients, error }) => {
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
                permanent_bounces: permanentBounces,
                queued: [],
                suppressed_recipients: suppressedRecipients,
              },
            }),
            { status: 200 },
          );
        }),
      );

      await expect(t.action((ctx) => sendEmail(ctx, sendArgs))).resolves.toEqual({
        ok: false,
        error,
      });
      await expect(t.action(internal.email.send, sendArgs)).rejects.toThrow(
        new Error(
          `Email sending was not confirmed: ${error}. Check delivery history before retrying.`,
        ),
      );
    },
  );

  it("does not report success when the provider outcome is unknown", async () => {
    const t = makeConvexTest();
    stubEmailConfiguration("prod:samebase");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad gateway", { status: 502 })),
    );

    await expect(t.action((ctx) => sendEmail(ctx, sendArgs))).resolves.toEqual({
      ok: false,
      error: "unknown",
    });
    await expect(t.action(internal.email.send, sendArgs)).rejects.toThrow(
      new Error(
        "Email sending was not confirmed: unknown. Check delivery history before retrying.",
      ),
    );
  });
});
