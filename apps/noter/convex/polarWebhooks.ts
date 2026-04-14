import { validateEvent } from "@polar-sh/sdk/webhooks";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { resolveDeploymentProfile } from "./deploymentProfile";
import { readRequiredEnv } from "./oauthUtils";
import { deriveBillingFromCustomerState } from "./billing";
import { isRecord, readString, toErrorMessage } from "./jsonUtils";

type PolarServer = "sandbox" | "production";

const POLAR_WEBHOOK_FETCH_TIMEOUT_MS = 8000;

function inferPolarServer(): PolarServer {
  return resolveDeploymentProfile().kind === "production"
    ? "production"
    : "sandbox";
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

  const direct =
    readString(data, "external_customer_id") ??
    readString(data, "customer_external_id") ??
    readString(data, "external_id");
  if (direct) {
    return direct;
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

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    POLAR_WEBHOOK_FETCH_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "noter-app",
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Polar customer state request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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
    const redactedExternalCustomerId =
      externalCustomerId.length <= 12
        ? "redacted"
        : `${externalCustomerId.slice(0, 8)}...${externalCustomerId.slice(-4)}`;
    console.error("billing:polar:webhook:failed", {
      message: toErrorMessage(error),
      externalCustomerId: redactedExternalCustomerId,
    });
    return new Response("Webhook processing failed", { status: 500 });
  }
});
