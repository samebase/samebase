import { validateEvent } from "@polar-sh/sdk/webhooks";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { readRequiredEnv } from "./oauthUtils";
import { deriveBillingFromCustomerState } from "./billing";
import { isRecord, readString, toErrorMessage } from "./jsonUtils";

type PolarServer = "sandbox" | "production";

function inferPolarServer(): PolarServer {
  const raw = process.env.CONVEX_DEPLOYMENT?.trim() ?? "";
  const prefix = raw.split(":")[0]?.trim().toLowerCase() ?? "";
  return prefix === "prod" ? "production" : "sandbox";
}

function getPolarApiBaseUrl(server: PolarServer): string {
  return server === "production"
    ? "https://api.polar.sh/v1"
    : "https://sandbox-api.polar.sh/v1";
}

function readExternalCustomerIdFromEvent(event: unknown): string | null {
  if (!isRecord(event)) {
    return null;
  }

  const data = event.data;
  if (!isRecord(data)) {
    return null;
  }

  const customer = data.customer;
  if (!isRecord(customer)) {
    return null;
  }

  return readString(customer, "external_id") ?? null;
}

async function fetchCustomerState(args: {
  server: PolarServer;
  externalCustomerId: string;
}): Promise<unknown> {
  const accessToken = readRequiredEnv("POLAR_ACCESS_TOKEN");
  const baseUrl = getPolarApiBaseUrl(args.server);
  const url = `${baseUrl}/customers/external/${encodeURIComponent(args.externalCustomerId)}/state`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "noter-app",
    },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      isRecord(payload) && typeof payload.detail === "string"
        ? payload.detail
        : `Polar customer state request failed (${response.status}).`;
    throw new Error(detail);
  }

  return payload;
}

export const handlePolarWebhook = httpAction(async (ctx, request) => {
  const secret = readRequiredEnv("POLAR_WEBHOOK_SECRET");
  const body = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event: unknown;
  try {
    event = validateEvent(body, headers, secret);
  } catch (error) {
    console.warn("billing:polar:webhook:invalid_signature", {
      message: toErrorMessage(error),
    });
    return new Response("Invalid webhook signature", { status: 401 });
  }

  const externalCustomerId = readExternalCustomerIdFromEvent(event);
  if (!externalCustomerId) {
    return new Response("Ignored", { status: 200 });
  }

  const server = inferPolarServer();

  try {
    const customerState = await fetchCustomerState({
      server,
      externalCustomerId,
    });
    const derived = deriveBillingFromCustomerState({ customerState, server });
    if (!derived) {
      return new Response("Ignored", { status: 200 });
    }

    await ctx.runMutation(internal.billing.applyPolarCustomerState, {
      externalCustomerId: derived.externalCustomerId,
      plan: derived.plan,
      status: derived.status,
      currentPeriodEndAt: derived.currentPeriodEndAt,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("billing:polar:webhook:failed", {
      message: toErrorMessage(error),
      externalCustomerId,
    });
    return new Response("Webhook processing failed", { status: 500 });
  }
});
