import { WebhookCustomerStateChangedPayload$inboundSchema } from "@polar-sh/sdk/models/components/webhookcustomerstatechangedpayload";
import { Webhook, WebhookVerificationError } from "standardwebhooks";

import { env, httpAction } from "./_generated/server";
import { reconcilePolarCustomerBilling } from "./polarBillingState";

/**
 * Polar's SDK verifier converts this secret with Node `Buffer`. Use its Standard Webhooks
 * dependency in raw-key mode so verification also runs in the Convex V8 runtime.
 */
export function verifyPolarWebhookEvent(args: {
  body: string;
  headers: Record<string, string>;
  secret: string;
}): unknown {
  return new Webhook(new TextEncoder().encode(args.secret), { format: "raw" }).verify(
    args.body,
    args.headers,
  );
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

  if (verifiedEvent.type !== "customer.state_changed") {
    return new Response(null, { status: 204 });
  }

  let event: ReturnType<typeof WebhookCustomerStateChangedPayload$inboundSchema.parse>;
  try {
    event = WebhookCustomerStateChangedPayload$inboundSchema.parse(verifiedEvent);
  } catch (error) {
    console.error("billing:polar:webhook:invalid_payload", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("Invalid webhook payload", { status: 500 });
  }

  const externalCustomerId = event.data.externalId?.trim();
  if (!externalCustomerId) {
    return new Response(null, { status: 204 });
  }

  try {
    await reconcilePolarCustomerBilling(ctx, { externalCustomerId });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("billing:polar:webhook:reconciliation_failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("Webhook processing failed", { status: 503 });
  }
});
