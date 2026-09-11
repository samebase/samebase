import { WebhookCustomerStateChangedPayload$inboundSchema } from "@polar-sh/sdk/models/components/webhookcustomerstatechangedpayload";
import { WebhookSubscriptionUpdatedPayload$inboundSchema } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload";
import { Webhook, WebhookVerificationError } from "standardwebhooks";

import { env, httpAction } from "./_generated/server";
import { reconcilePolarCustomerBilling } from "./polarBillingState";
import { createPolarClient, readPolarErrorLogFields } from "./polarClient";

const POLAR_WEBHOOK_API_TIMEOUT_MS = 1_500;

/**
 * Polar secrets generated before September 8, 2026 use the full UTF-8 string as the HMAC key.
 * Newer secrets use Standard Webhooks decoding. Verify both without Node `Buffer` in Convex V8.
 */
export function verifyPolarWebhookEvent(args: {
  body: string;
  headers: Record<string, string>;
  secret: string;
}): unknown {
  try {
    return new Webhook(new TextEncoder().encode(args.secret), { format: "raw" }).verify(
      args.body,
      args.headers,
    );
  } catch (error) {
    if (!(error instanceof WebhookVerificationError)) {
      throw error;
    }

    let webhook: Webhook;
    try {
      webhook = new Webhook(args.secret);
    } catch {
      // Legacy secrets can be arbitrary strings that are not valid Base64.
      throw error;
    }
    return webhook.verify(args.body, args.headers);
  }
}

export const handlePolarWebhook = httpAction(async (ctx, request) => {
  const secret = env.POLAR_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return new Response("Webhook is not configured", { status: 503 });
  }

  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let verifiedEvent: unknown;
  try {
    verifiedEvent = verifyPolarWebhookEvent({ body, headers, secret });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response("Invalid webhook signature", { status: 401 });
    }

    console.error("billing:polar:webhook:invalid_payload", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("Invalid webhook payload", { status: 500 });
  }

  if (
    verifiedEvent === null ||
    typeof verifiedEvent !== "object" ||
    !("type" in verifiedEvent) ||
    typeof verifiedEvent.type !== "string"
  ) {
    console.error("billing:polar:webhook:invalid_payload", {
      errorName: "InvalidEventType",
    });
    return new Response("Invalid webhook payload", { status: 500 });
  }

  if (
    verifiedEvent.type !== "customer.state_changed" &&
    verifiedEvent.type !== "subscription.updated"
  ) {
    return new Response(null, { status: 204 });
  }

  let externalCustomerId: string | undefined;
  try {
    externalCustomerId =
      verifiedEvent.type === "customer.state_changed"
        ? WebhookCustomerStateChangedPayload$inboundSchema.parse(
            verifiedEvent,
          ).data.externalId?.trim()
        : WebhookSubscriptionUpdatedPayload$inboundSchema.parse(
            verifiedEvent,
          ).data.customer.externalId?.trim();
  } catch (error) {
    console.error("billing:polar:webhook:invalid_payload", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("Invalid webhook payload", { status: 500 });
  }

  if (!externalCustomerId) {
    return new Response(null, { status: 204 });
  }

  try {
    await reconcilePolarCustomerBilling(ctx, {
      externalCustomerId,
      polar: createPolarClient(POLAR_WEBHOOK_API_TIMEOUT_MS),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("billing:polar:webhook:reconciliation_failed", readPolarErrorLogFields(error));
    return new Response("Webhook processing failed", { status: 503 });
  }
});
