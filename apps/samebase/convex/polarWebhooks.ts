import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";

import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
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

  const externalCustomerId = event.data.externalId?.trim();
  if (!externalCustomerId) {
    return new Response(null, { status: 204 });
  }

  await ctx.runMutation(internal.polarBillingState.requestWebhookReconciliation, {
    externalCustomerId,
  });
  return new Response(null, { status: 202 });
});
