import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { deriveBillingFromCustomerState } from "./billing";
import { readPolarProMonthlyProductId } from "./polarClient";

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

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(body, headers, secret);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response("Invalid webhook signature", { status: 401 });
    }

    console.error("billing:polar:webhook:invalid_payload", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("Invalid webhook payload", { status: 500 });
  }

  if (event.type !== "customer.state_changed") {
    return new Response(null, { status: 204 });
  }

  const productId = readPolarProMonthlyProductId();
  if (!productId) {
    return new Response("Billing product is not configured", { status: 503 });
  }

  const derived = deriveBillingFromCustomerState({
    customerState: event.data,
    productId,
  });
  if (!derived) {
    return new Response(null, { status: 204 });
  }

  await ctx.scheduler.runAfter(0, internal.billing.applyPolarCustomerState, {
    state: derived,
    polarStateChangedAt: event.timestamp.getTime(),
  });
  return new Response(null, { status: 202 });
});
