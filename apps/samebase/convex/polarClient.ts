import { Polar } from "@polar-sh/sdk";

import { env } from "./_generated/server";
import { resolveDeploymentProfile } from "./deploymentProfile";

export type PolarServer = "sandbox" | "production";

const POLAR_API_TIMEOUT_MS = 10_000;

function readConfiguredValue(value: string | undefined): string | null {
  const configured = value?.trim();
  return configured ? configured : null;
}

export function resolvePolarServer(): PolarServer {
  return resolveDeploymentProfile().kind === "production" ? "production" : "sandbox";
}

export function readPolarProMonthlyProductId(): string | null {
  return readConfiguredValue(env.POLAR_PRO_MONTHLY_PRODUCT_ID);
}

export function createPolarClient(timeoutMs = POLAR_API_TIMEOUT_MS): Polar {
  const accessToken = readConfiguredValue(env.POLAR_ACCESS_TOKEN);
  if (!accessToken) {
    throw new Error("Polar billing is not configured.");
  }

  return new Polar({
    accessToken,
    server: resolvePolarServer(),
    timeoutMs,
  });
}
